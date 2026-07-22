import Testing
@testable import DocPilot

struct ScanLoginTests {
    @Test func 从完整深链解析出userCode() {
        #expect(ScanLogin.parseUserCode(from: "docpilot://device-login?user_code=ABCD1234") == "ABCD1234")
    }

    @Test func 兼容裸用户码() {
        #expect(ScanLogin.parseUserCode(from: "ABCD1234") == "ABCD1234")
    }

    @Test func 裸码两侧空白被裁掉() {
        #expect(ScanLogin.parseUserCode(from: "  ABCD1234  ") == "ABCD1234")
    }

    @Test func 深链缺少userCode参数返回nil() {
        #expect(ScanLogin.parseUserCode(from: "docpilot://device-login") == nil)
    }

    @Test func 无关文本与空串返回nil() {
        #expect(ScanLogin.parseUserCode(from: "hello world!") == nil)
        #expect(ScanLogin.parseUserCode(from: "") == nil)
        #expect(ScanLogin.parseUserCode(from: "   ") == nil)
    }

    @Test func 其它URL无userCode返回nil() {
        #expect(ScanLogin.parseUserCode(from: "https://example.com/device") == nil)
    }
}
