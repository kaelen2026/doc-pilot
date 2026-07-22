import XCTest

/// 视觉自检用:逐个 tab 截图存为 attachment。app 需已登录且本地后端可达;
/// 未登录则 skip(不污染 CI)。手动跑:
/// xcodebuild test -scheme DocPilotLiveSmoke -only-testing:DocPilotUITests/ScreenshotTests
@MainActor
final class ScreenshotTests: XCTestCase {
    func testCapturePrimaryScreens() throws {
        let app = XCUIApplication()
        app.launch()

        let docsTab = app.tabBars.buttons["文档"]
        try XCTSkipUnless(docsTab.waitForExistence(timeout: 15), "未登录,跳过截图")

        capture(app, "01-documents")

        // 通知不再是 tab:从文档页顶部铃铛进入,截图后返回。
        app.buttons["documents.notifications"].tap()
        _ = app.navigationBars["通知"].waitForExistence(timeout: 10)
        Thread.sleep(forTimeInterval: 0.8)
        capture(app, "02-notifications")
        app.navigationBars["通知"].buttons.element(boundBy: 0).tap()

        app.tabBars.buttons["账户"].tap()
        _ = app.navigationBars["账户"].waitForExistence(timeout: 10)
        Thread.sleep(forTimeInterval: 0.8)
        capture(app, "03-account")
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
