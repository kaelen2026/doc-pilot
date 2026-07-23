import Foundation
import Testing
@testable import DocPilot

struct AccountDeletionTextTests {
    private func fixedDate() -> Date {
        var comps = DateComponents()
        comps.year = 2026; comps.month = 7; comps.day = 30; comps.hour = 12
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return cal.date(from: comps)!
    }

    @Test func 到期日期文案含年月日() {
        let text = AccountDeletion.scheduledDateText(
            fixedDate(),
            locale: Locale(identifier: "zh_CN"),
            timeZone: TimeZone(identifier: "Asia/Shanghai")!
        )
        #expect(text.contains("2026"))
        #expect(text.contains("7"))
        #expect(text.contains("30"))
    }
}

struct AccountDeletionModelTests {
    @Test func 请求注销成功后回报成功且不静默失败() async throws {
        let spy = SignOutSpy()
        let transport = DeletionStubTransport(
            statusCode: 200,
            body: #"{"scheduledAt":"2026-07-30T00:00:00.000Z"}"#
        )
        let model = await makeModel(transport: transport, spy: spy)

        let ok = await model.requestDeletion()

        #expect(ok)
        #expect(await model.deletionErrorMessage == nil)
        // POST /me/deletion 命中的路径与方法。
        #expect(await transport.lastPath == "/me/deletion")
        #expect(await transport.lastMethod == "POST")
    }

    @Test func 请求注销失败给出错误且回报失败() async throws {
        let spy = SignOutSpy()
        let transport = DeletionStubTransport(statusCode: 500, body: "{}")
        let model = await makeModel(transport: transport, spy: spy)

        let ok = await model.requestDeletion()

        #expect(!ok)
        #expect(await model.deletionErrorMessage != nil)
    }

    @Test func 撤销注销成功后清错误() async throws {
        let spy = SignOutSpy()
        let transport = DeletionStubTransport(statusCode: 200, body: "{}")
        let model = await makeModel(transport: transport, spy: spy)

        await model.cancelDeletion()

        #expect(await model.deletionErrorMessage == nil)
        // 撤销打了 DELETE /me/deletion(成功后还会跟 load() 的 GET,故断言"曾发生"而非"最后一个")。
        #expect(await transport.methods.contains("DELETE"))
    }

    @Test func 撤销注销失败给出错误() async throws {
        let spy = SignOutSpy()
        let transport = DeletionStubTransport(statusCode: 500, body: "{}")
        let model = await makeModel(transport: transport, spy: spy)

        await model.cancelDeletion()

        #expect(await model.deletionErrorMessage != nil)
    }

    @MainActor
    private func makeModel(transport: DeletionStubTransport, spy: SignOutSpy) -> AccountModel {
        let api = APIClient(
            baseURL: URL(string: "https://api.example.invalid")!,
            transport: transport,
            token: { "token" }
        )
        return AccountModel(api: api, signOut: { spy.markSignedOut() })
    }
}

private final class SignOutSpy: @unchecked Sendable {
    private(set) var signedOut = false
    func markSignedOut() { signedOut = true }
}

private actor DeletionStubTransport: HTTPTransport {
    private let statusCode: Int
    private let body: String
    private(set) var lastPath: String?
    private(set) var lastMethod: String?
    private(set) var methods: [String] = []

    init(statusCode: Int, body: String) {
        self.statusCode = statusCode
        self.body = body
    }

    func send(_ request: URLRequest) async throws -> HTTPResponse {
        lastPath = request.url?.path
        lastMethod = request.httpMethod
        if let method = request.httpMethod { methods.append(method) }
        let response = HTTPURLResponse(
            url: request.url!, statusCode: statusCode, httpVersion: nil, headerFields: nil
        )!
        return HTTPResponse(data: Data(body.utf8), response: response)
    }
}
