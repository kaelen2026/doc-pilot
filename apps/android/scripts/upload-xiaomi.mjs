#!/usr/bin/env node
// 把已签名 APK 上传到小米应用商店并提交,走官方「应用自动发布接口」。
// 无第三方依赖(Node 内置),凭据只经环境变量传入。加密逻辑在 lib/sign.mjs(有单测)。
//
// 小米不是私钥签名,而是用「公钥证书」对明文做 RSA 公钥加密(PKCS#1 v1.5)→ hex,作 SIG。
// 明文:{"sig":[{"name":"RequestData","hash":<RequestData 的 md5>},{"name":"apk","hash":<apk 的 md5>}],
//        "password":<接口私钥>}。POST /dev/push:multipart(RequestData + SIG + apk)。成功判据 result==0。
//
// 「仅换包」最小字段模式:不带 icon/截图。官方 /dev/push 文档把 icon 标为必填——若首次真跑被拒
// (如 result 非 0、提示缺 icon),需补 icon 文件。synchroType 取值官方未明确,默认 2,可 --synchro-type 覆盖。
import { readFileSync } from "node:fs";
import { md5Hex, rsaEncryptPkcs1Hex } from "./lib/sign.mjs";

const env = (name) => process.env[name];
const BASE = env("XIAOMI_API_BASE") || "https://api.developer.xiaomi.com/devupload";

function usage(code = 0) {
  process.stderr.write(
    `用法: upload-xiaomi.mjs --apk <path> --package <包名> [--update-desc <文本>] [--synchro-type <n>]\n` +
      `必需环境变量: XIAOMI_USERNAME(账号邮箱) XIAOMI_PRIVATE_KEY(接口私钥) XIAOMI_CERT_BASE64(公钥证书 .cer 的 base64)\n` +
      `⚠️ 最小字段模式:不带 icon/截图。若被拒需补 icon;synchroType 默认 2 未经官方确认。首次真跑请确认。\n`,
  );
  process.exit(code);
}

function parseArgs(argv) {
  const a = { synchroType: "2" };
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
      case "--update-desc":
        a.updateDesc = v;
        i++;
        break;
      case "--synchro-type":
        a.synchroType = v;
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

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.apk || !a.pkg) usage(1);
  const userName = env("XIAOMI_USERNAME");
  const password = env("XIAOMI_PRIVATE_KEY"); // 接口私钥,进明文的 password 字段
  const certB64 = env("XIAOMI_CERT_BASE64");
  if (!userName || !password || !certB64) {
    process.stderr.write("✗ 缺少 XIAOMI_USERNAME / XIAOMI_PRIVATE_KEY / XIAOMI_CERT_BASE64\n");
    process.exit(1);
  }
  const cert = Buffer.from(certB64, "base64"); // .cer(DER 或 PEM 均可,X509Certificate 自动识别)
  const bytes = readFileSync(a.apk);

  // RequestData:更新用最小 appInfo(packageName + updateDesc);userName 与 synchroType 在顶层。
  const appInfo = { packageName: a.pkg };
  if (a.updateDesc) appInfo.updateDesc = a.updateDesc;
  const requestData = JSON.stringify({ userName, synchroType: Number(a.synchroType), appInfo });

  // 明文里各参数用「实际发送出去的同一份字节」算 MD5,否则小米报 -20002。
  const plaintext = JSON.stringify({
    sig: [
      { name: "RequestData", hash: md5Hex(requestData) },
      { name: "apk", hash: md5Hex(bytes) },
    ],
    password,
  });
  const sig = rsaEncryptPkcs1Hex(cert, plaintext);

  process.stderr.write("▸ 上传并提交(/dev/push,最小字段,无 icon)\n");
  const fd = new FormData();
  fd.append("RequestData", requestData);
  fd.append("SIG", sig);
  fd.append("apk", new Blob([bytes]), "release.apk");
  const res = await fetch(`${BASE}/dev/push`, { method: "POST", body: fd });
  const json = await res.json();
  if (json.result !== 0) {
    throw new Error(`小米提交失败: result=${json.result} message=${json.message ?? ""}`);
  }

  process.stderr.write(`✅ 已提交小米(${a.pkg})。到小米开放平台查审核状态。\n`);
}

main().catch((err) => {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exit(1);
});
