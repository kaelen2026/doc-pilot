import Foundation

struct AppEnvironment: Sendable {
    let apiBaseURL: URL

    static var live: AppEnvironment {
        let value = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String
        guard let value, let url = URL(string: value), url.host != nil else {
            preconditionFailure("API_BASE_URL 未配置或不是合法 URL")
        }
        return AppEnvironment(apiBaseURL: url)
    }
}
