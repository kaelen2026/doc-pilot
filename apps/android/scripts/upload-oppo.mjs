#!/usr/bin/env node
// 把已签名 APK 上传到 OPPO 软件商店并提交发布,走官方「API 传包能力」。
// 无第三方依赖(Node 内置),凭据只经环境变量传入。签名逻辑在 lib/sign.mjs(有单测)。
//
// 「仅换包」最小字段模式:只发 APK + 更新说明,不重传 icon/截图/描述(已上架应用的版本更新)。
// 官方 /app/upd 文档把 app_name/summary/detail_desc/icon_url/pic_url 标为必填——若首次真跑被拒,
// 需要补这些字段(见 --* 覆盖项)。流程:换 token → get-upload-url → multipart 上传 → /app/upd。
// 成功判据:errno==0(且 /app/upd 的 data.success==true)。
import { readFileSync } from "node:fs";
import { buildCanonical, hmacSha256Hex, md5Hex } from "./lib/sign.mjs";

// 生产域名(研究置信度中,首次真跑请确认;可用 OPPO_API_BASE 覆盖)。
const env = (name) => process.env[name];
const BASE = env("OPPO_API_BASE") || "https://oop-openapi-cn.heytapmobi.com";

function usage(code = 0) {
  process.stderr.write(
    `用法: upload-oppo.mjs --apk <path> --package <包名> --version-code <n> [--update-desc <文本>] [--online-type <1|2>] [--cpu-code <n>]\n` +
      `必需环境变量: OPPO_CLIENT_ID OPPO_CLIENT_SECRET\n` +
      `⚠️ 最小字段模式:不重传 icon/截图/描述。若 /app/upd 报缺字段,需扩展必填项。首次真跑请确认。\n`,
  );
  process.exit(code);
}

function parseArgs(argv) {
  const a = { onlineType: "1", cpuCode: "0" };
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
      case "--cpu-code":
        a.cpuCode = v;
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

// 公共参数 access_token/timestamp + 业务参数 → api_sign = HmacSHA256(key=client_secret) 小写 hex。
// api_sign 本身不参与签名。
function withSign(secret, params) {
  const full = {
    access_token: params.access_token,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...params,
  };
  full.api_sign = hmacSha256Hex(secret, buildCanonical(full, { exclude: ["api_sign"] }));
  return full;
}

async function getJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (json.errno !== 0)
    throw new Error(`OPPO 请求失败 errno=${json.errno} ${JSON.stringify(json)}`);
  return json.data ?? {};
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.apk || !a.pkg || !a.versionCode) usage(1);
  const clientId = env("OPPO_CLIENT_ID");
  const secret = env("OPPO_CLIENT_SECRET");
  if (!clientId || !secret) {
    process.stderr.write("✗ 缺少 OPPO_CLIENT_ID / OPPO_CLIENT_SECRET\n");
    process.exit(1);
  }
  const bytes = readFileSync(a.apk);

  process.stderr.write("▸ ① 换 access_token\n");
  const tokenData = await getJson(
    `${BASE}/developer/v1/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(secret)}`,
  );
  const token = tokenData.access_token;
  if (!token) throw new Error(`未拿到 access_token: ${JSON.stringify(tokenData)}`);

  process.stderr.write("▸ ② 获取上传地址(get-upload-url)\n");
  const urlParams = withSign(secret, { access_token: token });
  const uploadInfo = await getJson(
    `${BASE}/resource/v1/upload/get-upload-url?${new URLSearchParams(urlParams)}`,
  );
  const { upload_url, sign: uploadSign } = uploadInfo;
  if (!upload_url || !uploadSign)
    throw new Error(`未拿到 upload_url/sign: ${JSON.stringify(uploadInfo)}`);

  process.stderr.write(`▸ ③ 上传 APK(${bytes.length} bytes)\n`);
  const fd = new FormData();
  fd.append("type", "apk");
  fd.append("sign", uploadSign); // get-upload-url 返回的一次性 sign
  fd.append("file", new Blob([bytes]), "app-release.apk");
  const upRes = await fetch(upload_url, { method: "POST", body: fd });
  const upJson = await upRes.json();
  if (upJson.errno !== 0) throw new Error(`OPPO 文件上传失败: ${JSON.stringify(upJson)}`);
  const { url: fileUrl, md5 } = upJson.data ?? {};
  if (!fileUrl) throw new Error(`上传未返回文件 url: ${JSON.stringify(upJson)}`);

  process.stderr.write("▸ ④ 提交发布(/app/upd,最小字段)\n");
  const apkInfo = JSON.stringify([
    { url: fileUrl, md5: md5 || md5Hex(bytes), cpu_code: Number(a.cpuCode) },
  ]);
  const updParams = withSign(secret, {
    access_token: token,
    pkg_name: a.pkg,
    version_code: a.versionCode,
    apk_url: apkInfo,
    online_type: a.onlineType,
    update_desc: a.updateDesc,
  });
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(updParams)) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }
  const updRes = await fetch(`${BASE}/resource/v1/app/upd`, { method: "POST", body });
  const updJson = await updRes.json();
  if (updJson.errno !== 0 || updJson.data?.success === false) {
    throw new Error(`OPPO 提交发布失败: ${JSON.stringify(updJson)}`);
  }

  process.stderr.write(
    `✅ 已提交 OPPO 发布(${a.pkg} versionCode=${a.versionCode})。到 OPPO 开放平台查审核状态。\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exit(1);
});
