import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashFileSha256 } from "./hash";

describe("hashFileSha256", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "hash-test-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("与已知 SHA256 一致", async () => {
    const file = join(dir, "hello.txt");
    await writeFile(file, "hello");
    // echo -n hello | sha256sum
    expect(await hashFileSha256(file)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("相同内容不同文件得到相同指纹", async () => {
    const a = join(dir, "a.pdf");
    const b = join(dir, "b.pdf");
    await writeFile(a, "same-bytes");
    await writeFile(b, "same-bytes");
    expect(await hashFileSha256(a)).toBe(await hashFileSha256(b));
  });

  it("内容不同则指纹不同", async () => {
    const a = join(dir, "x.pdf");
    const b = join(dir, "y.pdf");
    await writeFile(a, "content-x");
    await writeFile(b, "content-y");
    expect(await hashFileSha256(a)).not.toBe(await hashFileSha256(b));
  });
});
