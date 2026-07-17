// 生成 E2E 用的最小可解析 PDF(单页、标准 Helvetica 字体、有真实文本层)。
// 无第三方依赖:手写 PDF 结构并按字节精确计算 xref 偏移。
// unpdf(pdf.js)能逐页抽出这些文本,解析→清洗→切片→embed(mock) 全链路即可跑通。
// 内容用英文(标准 14 字体不含 CJK 字形;E2E 只关心「能抽到文本、切出 chunk」)。
//
// 用法:node e2e/fixtures/make-pdf.mjs  → 覆盖写 e2e/fixtures/sample.pdf
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LINES = [
  "DocPilot End-to-End Test Document",
  "",
  "This document is a fixture used by the automated end-to-end test.",
  "It exists to exercise the full processing pipeline without a real PDF.",
  "The parser extracts this text, the cleaner normalizes it, and the",
  "chunker splits it into retrievable passages that are embedded as vectors.",
  "",
  "DocPilot answers questions strictly from the uploaded document and",
  "attaches verifiable citations that quote the source text word for word.",
  "When the document contains no supporting evidence, DocPilot refuses to",
  "answer instead of guessing, which keeps every citation trustworthy.",
  "",
  "Session handling, upload flow, parsing, retrieval and grounded answering",
  "are all covered by this single deterministic end-to-end scenario.",
];

// 内容流:BT/ET 之间逐行书写,TL 设行距,T* 换行。文本里避开 ( ) \ 需转义的字符。
const contentLines = LINES.map((line) => `(${line.replace(/[()\\]/g, "\\$&")}) Tj T*`).join("\n");
const content = `BT\n/F1 12 Tf\n72 730 Td\n15 TL\n${contentLines}\nET\n`;

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefOffset = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const off of offsets) {
  pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

const out = fileURLToPath(new URL("./sample.pdf", import.meta.url));
writeFileSync(out, Buffer.from(pdf, "utf8"));
console.log(`wrote ${out} (${Buffer.byteLength(pdf, "utf8")} bytes)`);
