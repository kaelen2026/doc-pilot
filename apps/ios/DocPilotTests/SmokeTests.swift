import Foundation
import Testing
@testable import DocPilot

struct SmokeTests {
    @Test func appEnvironment保留API地址() throws {
        let url = try #require(URL(string: "https://api.example.invalid"))
        let environment = AppEnvironment(apiBaseURL: url)
        #expect(environment.apiBaseURL == url)
    }
}
