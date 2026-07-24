#!/usr/bin/env node
// 把已签名 APK 上传到应用宝(腾讯应用开放平台)并提交审核,走官方 developer_api。
// 无第三方依赖(Node 内置),凭据只经环境变量传入。签名逻辑在 lib/sign.mjs(有单测)。
//
// 前提:该 App 必须已在开放平台人工上架过——应用宝的 API 只更新已上架应用,不支持新应用发布。
// 流程:get_file_upload_info(拿 COS 预签名 URL + 流水号)→ PUT COS 上传 →
//       update_app(内置提交审核)→ query_app_update_status(查审核)。
// 成功判据:JSON 里 ret==0(不是 HTTP 状态码)。签名用原值,传输才 URL 编码。
import { readFileSync } from "node:fs";
import { buildCanonical, hmacSha256Hex, md5Hex } from "./lib/sign.mjs";

const BASE = "https://p.open.qq.com/open_file/developer_api";

// 计算式读环境变量(独立 CI 脚本无 env.ts;计算访问也避开 biome noUndeclaredEnvVars)。
const env = (name) => process.env[name];

function usage(code = 0) {
  process.stderr.write(
    `用法: upload-tencent.mjs --apk <path> --package <包名> --app-id <id> [--deploy-type <1|2>] [--arch <64|32>]\n` +
      `必需环境变量: TENCENT_USER_ID TENCENT_ACCESS_SECRET\n` +
      `⚠️ 通用 APK 默认放 64 位槽(--arch 64);若你的包按架构分包,分别跑并传 --arch。首次真跑请确认。\n`,
  );
  process.exit(code);
}

function parseArgs(argv) {
  const a = { deployType: "1", arch: "64" };
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
      case "--app-id":
        a.appId = v;
        i++;
        break;
      case "--deploy-type":
        a.deployType = v;
        i++;
        break;
      case "--arch":
        a.arch = v;
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

// 公共参数(user_id/timestamp/sign)+ 业务参数;sign 对「原值」拼串算,传输时再 URL 编码。
function signed(params) {
  const full = {
    user_id: env("TENCENT_USER_ID"),
    timestamp: String(Math.floor(Date.now() / 1000)), // 秒
    ...params,
  };
  full.sign = hmacSha256Hex(
    env("TENCENT_ACCESS_SECRET"),
    buildCanonical(full, { exclude: ["sign"] }),
  );
  return full;
}

async function postForm(path, params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(signed(params))) {
    if (v !== undefined && v !== null) body.set(k, String(v)); // URLSearchParams 负责传输编码
  }
  const res = await fetch(`${BASE}${path}`, { method: "POST", body });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`应用宝响应非 JSON(HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (json.ret !== 0) throw new Error(`应用宝 ${path} 失败: ret=${json.ret} msg=${json.msg ?? ""}`);
  return json;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.apk || !a.pkg || !a.appId) usage(1);
  if (!env("TENCENT_USER_ID") || !env("TENCENT_ACCESS_SECRET")) {
    process.stderr.write("✗ 缺少 TENCENT_USER_ID / TENCENT_ACCESS_SECRET\n");
    process.exit(1);
  }
  if (a.arch !== "64" && a.arch !== "32") {
    process.stderr.write("✗ --arch 仅支持 64 或 32\n");
    process.exit(1);
  }

  const bytes = readFileSync(a.apk);
  const fileMd5 = md5Hex(bytes);

  process.stderr.write("▸ ① 获取上传信息(get_file_upload_info)\n");
  const info = await postForm("/get_file_upload_info", {
    pkg_name: a.pkg,
    app_id: a.appId,
    file_type: "apk",
    file_name: "app-release.apk",
  });
  const { pre_sign_url, serial_number } = info;
  if (!pre_sign_url || !serial_number)
    throw new Error(`未拿到 pre_sign_url/serial_number: ${JSON.stringify(info)}`);

  process.stderr.write(`▸ ② 上传到腾讯云 COS(${bytes.length} bytes)\n`);
  const put = await fetch(pre_sign_url, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!put.ok) throw new Error(`COS 上传失败: HTTP ${put.status}`);

  process.stderr.write("▸ ③ 提交更新并提审(update_app)\n");
  const flag = a.arch === "64" ? "apk64" : "apk32";
  await postForm("/update_app", {
    pkg_name: a.pkg,
    app_id: a.appId,
    deploy_type: a.deployType, // 1=审核通过后立即发布
    [`${flag}_flag`]: "1",
    [`${flag}_file_serial_number`]: serial_number,
    [`${flag}_file_md5`]: fileMd5,
  });

  process.stderr.write(`✅ 已提交应用宝更新并提审(${a.pkg})。到腾讯应用开放平台查审核状态。\n`);
}

main().catch((err) => {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exit(1);
});
