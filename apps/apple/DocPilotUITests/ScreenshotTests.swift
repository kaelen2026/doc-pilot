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

        for (tab, name) in [("搜索", "02-search"), ("通知", "03-notifications"), ("账户", "04-account")] {
            app.tabBars.buttons[tab].tap()
            _ = app.navigationBars[tab].waitForExistence(timeout: 10)
            Thread.sleep(forTimeInterval: 0.8)
            capture(app, name)
        }
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
