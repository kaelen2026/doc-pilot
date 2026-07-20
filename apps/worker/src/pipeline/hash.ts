import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * 计算文件内容的 SHA256(hex),流式读取,不把整个文件读进内存。
 * 这是内容级去重的「权威指纹」——从对象存储实际下载的字节算出,不信前端(见 ADR-003)。
 */
export function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
