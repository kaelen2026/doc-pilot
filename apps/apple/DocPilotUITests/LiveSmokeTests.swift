import XCTest

@MainActor
final class LiveSmokeTests: XCTestCase {
    private let email = "simulator-\(Int(Date().timeIntervalSince1970))@example.com"

    func testLiveOTPLoginAndPrimaryNavigation() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["LIVE_SMOKE"] == "1")

        let app = XCUIApplication()
        app.launch()

        let emailField = app.textFields["login.email"]
        if !emailField.waitForExistence(timeout: 3) {
            let accountTab = app.tabBars.buttons["账户"]
            XCTAssertTrue(accountTab.waitForExistence(timeout: 10))
            accountTab.tap()
            let signOut = app.buttons["退出登录"]
            for _ in 0..<4 where !signOut.exists { app.swipeUp() }
            XCTAssertTrue(signOut.waitForExistence(timeout: 10))
            signOut.tap()
        }
        XCTAssertTrue(emailField.waitForExistence(timeout: 10))
        emailField.tap()
        emailField.typeText(email)

        let submit = app.buttons["login.submit"]
        XCTAssertTrue(submit.isEnabled)
        submit.tap()

        // OTP 页为分格 Input OTP:普通 textField 承接输入,输满 6 位自动验证,无需再点提交。
        let otpField = app.textFields["login.otp"]
        guard otpField.waitForExistence(timeout: 10) else {
            XCTFail("OTP 输入框未出现：\(app.debugDescription)")
            return
        }
        let otp = try await latestOTP(timeout: 10)
        otpField.tap()
        otpField.typeText(otp)

        guard emailField.waitForNonExistence(timeout: 15) else {
            XCTFail("登录后仍停留在登录页：\(app.debugDescription)")
            return
        }

        for tab in ["文档", "搜索", "通知", "账户"] {
            let button = app.tabBars.buttons[tab]
            XCTAssertTrue(button.waitForExistence(timeout: 15), "缺少主导航：\(tab)")
            button.tap()
            XCTAssertTrue(app.navigationBars[tab].waitForExistence(timeout: 10), "未进入页面：\(tab)")
        }
        let emailText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", email)).firstMatch
        XCTAssertTrue(emailText.waitForExistence(timeout: 10), "账户资料未加载")
    }

    private func latestOTP(timeout: TimeInterval) async throws -> String {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let otp = try await fetchLatestOTP() { return otp }
            try await Task.sleep(for: .milliseconds(250))
        }
        XCTFail("未在 Mailpit 中找到 OTP")
        throw URLError(.timedOut)
    }

    private func fetchLatestOTP() async throws -> String? {
        let listURL = URL(string: "http://127.0.0.1:8025/api/v1/messages?limit=20")!
        let (listData, _) = try await URLSession.shared.data(from: listURL)
        let list = try JSONDecoder().decode(MessageList.self, from: listData)
        guard let message = list.messages.first(where: { item in
            item.to.contains { $0.address == email }
        }) else { return nil }

        let detailURL = URL(string: "http://127.0.0.1:8025/api/v1/message/\(message.id)")!
        let (detailData, _) = try await URLSession.shared.data(from: detailURL)
        let detail = try JSONDecoder().decode(MessageDetail.self, from: detailData)
        return detail.text.firstMatch(of: /\b\d{6}\b/).map { String($0.output) }
    }
}

private struct MessageList: Decodable {
    let messages: [Message]
    enum CodingKeys: String, CodingKey { case messages = "messages" }
}

private struct Message: Decodable {
    struct Recipient: Decodable {
        let address: String
        enum CodingKeys: String, CodingKey { case address = "Address" }
    }
    let id: String
    let to: [Recipient]
    enum CodingKeys: String, CodingKey { case id = "ID"; case to = "To" }
}

private struct MessageDetail: Decodable {
    let text: String
    enum CodingKeys: String, CodingKey { case text = "Text" }
}
