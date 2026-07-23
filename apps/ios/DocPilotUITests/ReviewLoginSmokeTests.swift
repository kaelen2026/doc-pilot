import XCTest

/// 发版前的全自动端到端冒烟:用 App Store 审核账号「邮箱+密码」登录并走一遍主导航。
///
/// 相较 `LiveSmokeTests`(OTP + Mailpit)这条**不依赖任何邮件服务**,故可对着**生产**
/// 后端全自动跑——这正是提审前要验证的东西:审核员用同一套凭据能否登进去。绿灯等于同时
/// 证明「生产 API 可达」「审核账号已在生产就绪」「登录→主导航链路通」。
///
/// 由 `apps/ios/scripts/preflight-smoke.sh` 驱动:通过 `TEST_RUNNER_*` 注入门禁开关与凭据
/// (xcodebuild 把 `TEST_RUNNER_` 前缀的环境变量转发给测试运行进程,去前缀后可见)。默认
/// skip,避免污染普通 UI 测试跑批。
@MainActor
final class ReviewLoginSmokeTests: XCTestCase {
    func testReviewPasswordLoginAndPrimaryNavigation() throws {
        let env = ProcessInfo.processInfo.environment
        try XCTSkipUnless(env["REVIEW_SMOKE"] == "1")

        // 凭据默认取审核账号,允许经 TEST_RUNNER_REVIEW_EMAIL/PASSWORD 覆盖(非机密:已随提审下发)。
        let email = env["REVIEW_EMAIL"] ?? "review@docpilot.app"
        let password = env["REVIEW_PASSWORD"] ?? "DocPilot-Review-2026"

        // 经 -prefillLogin 让 app 在启动时直接填好邮箱/密码并切到密码方式,绕开 XCUITest 往
        // SecureField 敲复杂密码的不稳(实测 typeText 会确定性弄错大写)。这条门禁验的是
        // 「生产可达 + 审核账号可登 + 登录后导航」,不是键盘输入,故绕开键盘不损其目的。
        let app = XCUIApplication()
        app.launchArguments = ["-prefillLogin"]
        app.launchEnvironment = ["PREFILL_EMAIL": email, "PREFILL_PASSWORD": password]
        app.launch()

        // 模拟器残留会话时先退到登录页;退登会清掉预填,故重启一次让 -prefillLogin 重新生效。
        let emailField = app.textFields["login.email"]
        if !emailField.waitForExistence(timeout: 3) {
            signOut(app)
            app.terminate()
            app.launch()
        }
        XCTAssertTrue(emailField.waitForExistence(timeout: 10), "未出现登录页：\(app.debugDescription)")
        XCTAssertTrue(
            (emailField.value as? String)?.contains(email) == true,
            "预填邮箱未生效：\(String(describing: emailField.value))"
        )

        let submit = app.buttons["login.submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5), "缺少登录按钮")
        XCTAssertTrue(submit.isEnabled, "预填邮箱+密码后「登录」仍不可用")
        submit.tap()

        // 登录成功:离开登录页。停留即视为生产不可达 / 审核账号未就绪 / 凭据失效。
        guard emailField.waitForNonExistence(timeout: 20) else {
            XCTFail("密码登录后仍停留在登录页(检查生产可达性与审核账号是否已在生产就绪)：\(app.debugDescription)")
            return
        }

        // 主导航仅剩 文档 / 账户;账户页应回显审核邮箱。
        XCTAssertTrue(app.tabBars.buttons["文档"].waitForExistence(timeout: 15), "缺少主导航：文档")
        app.tabBars.buttons["文档"].tap()
        XCTAssertTrue(app.navigationBars["文档"].waitForExistence(timeout: 10), "未进入页面：文档")

        XCTAssertTrue(app.tabBars.buttons["账户"].waitForExistence(timeout: 15), "缺少主导航：账户")
        app.tabBars.buttons["账户"].tap()
        XCTAssertTrue(app.navigationBars["账户"].waitForExistence(timeout: 10), "未进入页面：账户")

        let emailText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", email)).firstMatch
        XCTAssertTrue(emailText.waitForExistence(timeout: 10), "账户页未回显审核邮箱")
    }

    /// 从任意登录态退回登录页:进账户 tab → 滚到底 → 点「退出登录」。
    private func signOut(_ app: XCUIApplication) {
        let accountTab = app.tabBars.buttons["账户"]
        guard accountTab.waitForExistence(timeout: 10) else { return }
        accountTab.tap()
        let signOut = app.buttons["退出登录"]
        for _ in 0..<4 where !signOut.exists { app.swipeUp() }
        if signOut.waitForExistence(timeout: 10) { signOut.tap() }
    }
}
