#!/usr/bin/env node
// 把已签名 APK 上传到 vivo 应用商店并提交发布,走官方 /router/rest 网关(TOP 风格)。
// 无第三方依赖(Node 内置),凭据只经环境变量传入。签名逻辑在 lib/sign.mjs(有单测)。
//
// 流程:app.upload.apk.app(上传拿流水号)→ app.sync.update.app(提交版本)。
// 成功判据:code==0 且 subCode 为空或 "0"(只看 code 会把签名错误误判为成功)。
// 注意:/router/rest 响应 Content-Type 为 text/plain 但 body 是 JSON,必须手动解析。
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { buildCanonical, hmacSha256Hex, md5Hex } from "./lib/sign.mjs";

const GATEWAY = "https://developer-api.vivo.com.cn/router/rest";

// 计算式读环境变量(独立 CI 脚本无 env.ts;计算访问也避开 biome noUndeclaredEnvVars)。
const env = (name) => process.env[name];

function usage(code = 0) {
  process.stderr.write(
    `用法: upload-vivo.mjs --apk <path> --package <包名> --version-code <n> [--update-desc <文本>] [--online-type <1|2>]\n` +
      `必需环境变量: VIVO_ACCESS_KEY VIVO_ACCESS_SECRET\n` +
      `⚠️ sign_method 字面值(HMAC-SHA256 vs hmac)与 multipart 文件字段名建议首次真跑时确认。\n`,
  );
  process.exit(code);
}

function parseArgs(argv) {
  const a = { onlineType: "1" };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case "--apk":
        a.apk = v;
        i++;
        break;
      case "--package":
        a.pkg = v;
        i++;
        break;
      case "--version-code":
        a.versionCode = v;
        i++;
        break;
      case "--update-desc":
        a.updateDesc = v;
        i++;
        break;
      case "--online-type":
        a.onlineType = v;
        i++;
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        process.stderr.write(`未知参数: ${argv[i]}\n`);
        usage(1);
    }
  }
  return a;
}

// 公共参数 + 业务参数 → 补 sign → 组 query 串(值由 URLSearchParams 做传输编码)。
function signedParams(secret, params) {
  const full = {
    access_key: env("VIVO_ACCESS_KEY"),
    timestamp: String(Date.now()), // 毫秒
    format: "json",
    v: "1.0",
    sign_method: "HMAC-SHA256",
    target_app_key: "developer",
    ...params,
  };
  full.sign = hmacSha256Hex(secret, buildCanonical(full, { exclude: ["sign"] }));
  return full;
}

// text/plain 但内容是 JSON。code==0 且 subCode 空/"0" 才算成功。
async function call(secret, params, formFile) {
  const url = new URL(GATEWAY);
  for (const [k, val] of Object.entries(signedParams(secret, params))) {
    if (val !== undefined && val !== null) url.searchParams.set(k, String(val));
  }
  const init = { method: "POST" };
  if (formFile) {
    const fd = new FormData();
    fd.append("file", new Blob([formFile.bytes]), formFile.name); // file 不参与签名
    init.body = fd;
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`vivo 响应非 JSON(HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const sub = json.subCode;
  const ok = json.code === 0 && (sub === undefined || sub === null || sub === "" || sub === "0");
  if (!ok) {
    throw new Error(
      `vivo ${params.method} 失败: code=${json.code} subCode=${sub ?? ""} msg=${json.msg ?? json.message ?? ""}`,
    );
  }
  return json.data ?? {};
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.apk || !a.pkg || !a.versionCode) usage(1);
  const secret = env("VIVO_ACCESS_SECRET");
  if (!env("VIVO_ACCESS_KEY") || !secret) {
    process.stderr.write("✗ 缺少 VIVO_ACCESS_KEY / VIVO_ACCESS_SECRET\n");
    process.exit(1);
  }

  const bytes = readFileSync(a.apk);
  const fileMd5 = md5Hex(bytes);

  process.stderr.write("▸ ① 上传 APK(app.upload.apk.app)\n");
  const up = await call(
    secret,
    { method: "app.upload.apk.app", packageName: a.pkg, fileMd5 },
    { bytes, name: basename(a.apk) },
  );
  const serialnumber = up.serialnumber;
  if (!serialnumber) throw new Error(`未拿到 serialnumber: ${JSON.stringify(up)}`);

  process.stderr.write("▸ ② 提交发布(app.sync.update.app)\n");
  await call(secret, {
    method: "app.sync.update.app",
    packageName: a.pkg,
    versionCode: a.versionCode,
    apk: serialnumber,
    fileMd5,
    onlineType: a.onlineType,
    compatibleDevice: "2",
    updateDesc: a.updateDesc,
  });

  process.stderr.write(
    `✅ 已提交 vivo 发布(${a.pkg} versionCode=${a.versionCode})。到 vivo 开放平台查审核状态。\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exit(1);
});
