// 签名纯函数单测(node --test)。四家商店都没公开签名测试向量,
// 故这里钉住真正易错的确定性部分:canonical string 组装、MD5、HMAC(用公认向量)、
// RSA 加解密往返(含分块)。跑:node --test apps/android/scripts/lib/
import assert from "node:assert/strict";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { test } from "node:test";
import { buildCanonical, hmacSha256Hex, md5Hex, rsaEncryptPkcs1Hex } from "./sign.mjs";

test("buildCanonical:按 key ASCII 升序、跳过 null/undefined、k=v 以 & 连接", () => {
  assert.equal(buildCanonical({ b: 2, a: 1, c: null, d: undefined }), "a=1&b=2");
});

test("buildCanonical:exclude 剔除指定 key(如 sign 自身不参与签名)", () => {
  assert.equal(
    buildCanonical({ sign: "x", a: "1", timestamp: "9" }, { exclude: ["sign"] }),
    "a=1&timestamp=9",
  );
});

test("buildCanonical:大写字母 ASCII 小于小写(排序按 code unit 而非字典序)", () => {
  // 'A'(65) < 'a'(97) < 'b'(98);确保没被 localeCompare 之类打乱。
  assert.equal(buildCanonical({ b: 1, A: 2, a: 3 }), "A=2&a=3&b=1");
});

test("md5Hex:32 位小写 hex(对拍已知向量)", () => {
  assert.equal(md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
});

test("hmacSha256Hex:对拍 RFC/公认向量", () => {
  // key="key", data=经典 pangram → 公认结果。
  assert.equal(
    hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
});

test("rsaEncryptPkcs1Hex:短明文往返还原(自造密钥对,私钥解密)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const plaintext = '{"sig":[{"name":"RequestData","hash":"deadbeef"}],"password":"secret"}';
  const hex = rsaEncryptPkcs1Hex(publicKey, plaintext);
  const decrypted = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(hex, "hex"),
  );
  assert.equal(decrypted.toString("utf8"), plaintext);
});

test("rsaEncryptPkcs1Hex:超一个 RSA 块的明文分块加密后可逐块解密还原", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const blockMax = 2048 / 8 - 11; // 245
  const plaintext = "x".repeat(blockMax * 2 + 30); // 强制 3 块
  const hex = rsaEncryptPkcs1Hex(publicKey, plaintext);
  const cipher = Buffer.from(hex, "hex");
  const blockBytes = 2048 / 8; // 256:每个密文块固定长度
  assert.equal(cipher.length % blockBytes, 0, "密文应为整数个 RSA 块");
  let out = "";
  for (let i = 0; i < cipher.length; i += blockBytes) {
    out += privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
      cipher.subarray(i, i + blockBytes),
    ).toString("utf8");
  }
  assert.equal(out, plaintext);
});

test("rsaEncryptPkcs1Hex:同一明文两次加密结果不同(PKCS#1 v1.5 随机填充)", () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const a = rsaEncryptPkcs1Hex(publicKey, "same-input");
  const b = rsaEncryptPkcs1Hex(publicKey, "same-input");
  assert.notEqual(a, b); // 故不能拿固定密文做断言,只能测往返
});
