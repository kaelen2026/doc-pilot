import { writeFileSync } from "node:fs";

const TOPICS = [
  "DocPilot isolates every database and vector query by workspace identifier.",
  "The transactional outbox prevents database state from diverging from queued work.",
  "Processing version guards stop stale jobs from reviving deleted or reprocessed documents.",
  "Grounded answers cite retrieved source chunks and refuse when evidence is insufficient.",
  "The worker parses, cleans, chunks, embeds, summarizes, and finalizes each PDF.",
];

function escapePdfText(value) {
  return value.replace(/[()\\]/g, "\\$&");
}

export function buildPdf(pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 500) {
    throw new Error(`pageCount 必须是 1..500 的整数:${pageCount}`);
  }
  const objects = new Map();
  const kids = [];
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (let page = 1; page <= pageCount; page++) {
    const pageObject = 4 + (page - 1) * 2;
    const contentObject = pageObject + 1;
    kids.push(`${pageObject} 0 R`);
    const lines = [
      `DocPilot Local Staging Capacity Document - Page ${page} of ${pageCount}`,
      ...TOPICS,
      `Capacity marker ${page}: deterministic text verifies page extraction and citation location.`,
      ...TOPICS,
      `End of benchmark page ${page}.`,
    ];
    const commands = lines.map((line) => `(${escapePdfText(line)}) Tj T*`).join("\n");
    const content = `BT\n/F1 10 Tf\n54 748 Td\n15 TL\n${commands}\nET\n`;
    objects.set(
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    objects.set(
      contentObject,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    );
  }
  objects.set(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = new Map();
  const maxObject = 3 + pageCount * 2;
  for (let id = 1; id <= maxObject; id++) {
    offsets.set(id, Buffer.byteLength(pdf));
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxObject; id++) {
    pdf += `${String(offsets.get(id)).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export function writePdf(path, pageCount) {
  const buffer = buildPdf(pageCount);
  writeFileSync(path, buffer);
  return buffer.byteLength;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pageCount = Number(process.argv[2]);
  const path = process.argv[3];
  if (!path) throw new Error("用法:node generate-pdf.mjs <pages> <output>");
  console.log(JSON.stringify({ path, pageCount, sizeBytes: writePdf(path, pageCount) }));
}
