// 国内安卓商店发版 API 的签名/摘要纯函数。与 HTTP 解耦、可单测。
// vivo / OPPO / 应用宝 用 HMAC-SHA256(canonical string);小米用 RSA 公钥加密(PKCS#1 v1.5)。
import {
  constants,
  createHash,
  createHmac,
  createPublicKey,
  publicEncrypt,
  X509Certificate,
} from "node:crypto";

/**
 * 构造签名原文(canonical string):
 * 除 `exclude` 列出的 key 外,按 key 的 ASCII(code unit)升序排序,
 * 跳过值为 null/undefined 的项,拼成 `k=v` 并以 `&` 连接。
 * vivo / OPPO / 应用宝 三家的拼串口径一致(值均用原值,不做 URL 编码)。
 */
export function buildCanonical(params, { exclude = [] } = {}) {
  const ex = new Set(exclude);
  return Object.keys(params)
    .filter((k) => !ex.has(k) && params[k] !== null && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

/** HMAC-SHA256(key=secret 的 UTF-8 字节),结果小写 hex。 */
export function hmacSha256Hex(secret, data) {
  return createHmac("sha256", Buffer.from(secret, "utf8")).update(data, "utf8").digest("hex");
}

/** 对字节/字符串算 MD5,结果 32 位小写 hex(小米明文里各参数的 hash 用)。 */
export function md5Hex(input) {
  return createHash("md5").update(input).digest("hex");
}

/** 从「公钥 KeyObject」/「X.509 证书(PEM/DER)」/「公钥(PEM/DER)」解析出公钥 KeyObject。 */
function resolvePublicKey(certOrKey) {
  if (typeof certOrKey === "object" && certOrKey !== null && certOrKey.type === "public") {
    return certOrKey; // 已经是公钥 KeyObject
  }
  try {
    return new X509Certificate(certOrKey).publicKey; // 小米下发的 .cer 证书
  } catch {
    return createPublicKey(certOrKey); // 裸公钥 PEM/DER
  }
}

/**
 * 小米 SIG:用公钥对明文做 RSA/NONE/PKCS1Padding(PKCS#1 v1.5)加密,结果小写 hex。
 * 明文长于单个 RSA 块(modulus 字节数 - 11)时必须分块加密再拼接,否则小米报 -20002。
 * 注意:PKCS#1 v1.5 填充含随机字节,同一明文每次输出不同——只能测加解密往返,不能断言固定串。
 */
export function rsaEncryptPkcs1Hex(certOrKey, plaintext) {
  const key = resolvePublicKey(certOrKey);
  const modulusBits = key.asymmetricKeyDetails?.modulusLength;
  if (!modulusBits) throw new Error("无法确定 RSA 公钥模数长度");
  const blockMax = modulusBits / 8 - 11; // PKCS#1 v1.5 单块最大明文字节
  const data = Buffer.from(plaintext, "utf8");
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += blockMax) {
    const slice = data.subarray(offset, offset + blockMax);
    chunks.push(publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, slice));
  }
  return Buffer.concat(chunks).toString("hex");
}
