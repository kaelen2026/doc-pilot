import { buildParseJobId } from "@doc-pilot/contracts";
import { buildOriginalObjectKey } from "@doc-pilot/storage";
import { describe, expect, it } from "vitest";
import { parseCreateUpload, validateUploadConstraints } from "./document.schema";

describe("validateUploadConstraints", () => {
  it("accepts a valid pdf under the size limit", () => {
    expect(
      validateUploadConstraints({ contentType: "application/pdf", sizeBytes: 1024 }),
    ).toBeNull();
  });

  it("rejects non-pdf content types", () => {
    expect(validateUploadConstraints({ contentType: "image/png", sizeBytes: 1024 })).toMatch(
      /unsupported/,
    );
  });

  it("rejects files over 50MB", () => {
    expect(
      validateUploadConstraints({ contentType: "application/pdf", sizeBytes: 51 * 1024 * 1024 }),
    ).toMatch(/too large/);
  });

  it("rejects non-positive sizes", () => {
    expect(validateUploadConstraints({ contentType: "application/pdf", sizeBytes: 0 })).toMatch(
      /positive/,
    );
  });
});

describe("parseCreateUpload", () => {
  it("parses a valid body", () => {
    const input = parseCreateUpload({
      filename: "a.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
    });
    expect(input.filename).toBe("a.pdf");
  });

  it("throws on missing filename", () => {
    expect(() => parseCreateUpload({ contentType: "application/pdf", sizeBytes: 10 })).toThrow();
  });
});

describe("object key & job id builders", () => {
  it("builds the original object key", () => {
    expect(buildOriginalObjectKey({ workspaceId: "ws", documentId: "doc", version: 1 })).toBe(
      "workspaces/ws/documents/doc/v1/original.pdf",
    );
  });

  it("builds a stable parse job id", () => {
    expect(buildParseJobId("doc", 1)).toBe("document:doc:version:1:parse");
  });
});
