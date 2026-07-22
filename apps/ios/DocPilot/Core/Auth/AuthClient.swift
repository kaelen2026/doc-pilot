import Foundation

struct AuthSession: Decodable, Sendable, Equatable {
    struct User: Decodable, Sendable, Equatable { let id: String; let name: String; let email: String }
    struct Session: Decodable, Sendable, Equatable { let id: String; let expiresAt: Date }
    let user: User
    let session: Session
}

struct AuthClient: Sendable {
    let api: APIClient
    let tokenStore: any SecureTokenStore

    func sendOTP(email: String) async throws {
        let _: EmptyResponse = try await api.send(
            "/api/auth/email-otp/send-verification-otp",
            method: "POST",
            body: SendOTPBody(email: email, type: "sign-in")
        )
    }

    func verifyOTP(email: String, otp: String) async throws -> AuthSession {
        let response = try await api.transport.send(try request(
            path: "/api/auth/sign-in/email-otp",
            body: VerifyOTPBody(email: email, otp: otp)
        ))
        guard 200..<300 ~= response.response.statusCode else {
            if response.response.statusCode == 401 { throw APIError.unauthorized }
            throw APIError.server(statusCode: response.response.statusCode, code: nil)
        }
        guard let token = response.response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw APIError.invalidResponse
        }
        try tokenStore.saveToken(token)
        guard let session = try await restoreSession() else { throw APIError.unauthorized }
        return session
    }

    func restoreSession() async throws -> AuthSession? {
        guard let token = try tokenStore.loadToken() else { return nil }
        var authenticated = api
        authenticated.token = { token }
        do {
            return try await authenticated.send("/api/auth/get-session")
        } catch APIError.unauthorized {
            try tokenStore.deleteToken()
            return nil
        }
    }

    func signOut() async throws {
        if try tokenStore.loadToken() != nil {
            var authenticated = api
            authenticated.token = { try? tokenStore.loadToken() }
            let _: EmptyResponse = try await authenticated.send(
                "/api/auth/sign-out", method: "POST", body: EmptyBody()
            )
        }
        try tokenStore.deleteToken()
    }

    private func request(path: String, body: some Encodable) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: api.baseURL) else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("docpilot://", forHTTPHeaderField: "Origin")
        return request
    }
}

private struct SendOTPBody: Encodable, Sendable { let email: String; let type: String }
private struct VerifyOTPBody: Encodable, Sendable { let email: String; let otp: String }
private struct EmptyBody: Encodable, Sendable {}
