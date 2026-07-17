import { PROCESSING_ERROR_CODES } from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import { errorCodeOf, isRetryable, PipelineError } from "./errors";

describe("PipelineError classification", () => {
  it("non-retryable errors are not retried", () => {
    const err = PipelineError.nonRetryable(PROCESSING_ERROR_CODES.INVALID_PDF, "bad pdf");
    expect(isRetryable(err)).toBe(false);
    expect(errorCodeOf(err)).toBe(PROCESSING_ERROR_CODES.INVALID_PDF);
  });

  it("retryable errors are retried", () => {
    const err = PipelineError.retryable(PROCESSING_ERROR_CODES.STORAGE_UNAVAILABLE, "s3 down");
    expect(isRetryable(err)).toBe(true);
  });

  it("unknown errors default to retryable + INTERNAL code", () => {
    const err = new Error("boom");
    expect(isRetryable(err)).toBe(true);
    expect(errorCodeOf(err)).toBe(PROCESSING_ERROR_CODES.INTERNAL);
  });
});
