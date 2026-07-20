import { describe, expect, it } from "vitest";
import { stripCodeFence } from "./strip-code-fence";

describe("stripCodeFence", () => {
  it("剥掉 ```json 围栏,取内层内容", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("剥掉无语言标记的 ``` 围栏", () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("容忍围栏外的首尾空白", () => {
    expect(stripCodeFence('  \n```json\n{"a":1}\n```  \n')).toBe('{"a":1}');
  });

  it("无围栏时去首尾空白后原样返回(统一 trim 语义,消除两处漂移)", () => {
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("正文内的反引号不被误剥", () => {
    expect(stripCodeFence("值为 `x`")).toBe("值为 `x`");
  });
});
