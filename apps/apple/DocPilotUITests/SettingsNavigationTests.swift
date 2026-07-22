import XCTest

@MainActor
final class SettingsNavigationTests: XCTestCase {
    /// 复现「点击设置图标后无法返回上一级」:点齿轮进设置页 → 点系统返回按钮 → 应回到账户页。
    func testBackButtonReturnsToAccountViaGear() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-initialTab", "account"]
        app.launch()

        let gear = app.buttons["account.settings"]
        guard gear.waitForExistence(timeout: 15) else {
            throw XCTSkip("未进入账户页(可能未登录):\(app.debugDescription)")
        }
        gear.tap()

        let settingsBar = app.navigationBars["设置"]
        XCTAssertTrue(settingsBar.waitForExistence(timeout: 8), "未进入设置页")
        // 等资料加载完成(触发账户页重算)后再返回,贴近真实时序。
        _ = app.staticTexts["版本"].waitForExistence(timeout: 5)
        let back = settingsBar.buttons.element(boundBy: 0)
        XCTAssertTrue(back.waitForExistence(timeout: 5), "设置页没有返回按钮")
        back.tap()
        XCTAssertTrue(
            app.navigationBars["账户"].waitForExistence(timeout: 8),
            "点返回按钮后未回到账户页,仍停留在:\(app.debugDescription)"
        )
    }
}
