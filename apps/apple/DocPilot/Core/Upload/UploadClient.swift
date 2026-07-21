import CryptoKit
import Foundation

struct UploadClient: Sendable {
    let api: APIClient

    func upload(fileURL: URL) async throws -> String {
        let accessing = fileURL.startAccessingSecurityScopedResource()
        defer { if accessing { fileURL.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
        if let validationError = PDFValidator.validate(data: data, contentType: "application/pdf") {
            throw validationError
        }
        let checksum = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let idempotencyKey = "apple-upload-\(checksum)"
        let created: CreateUploadResult = try await api.send(
            "/documents", method: "POST",
            body: CreateUploadBody(
                filename: fileURL.lastPathComponent,
                contentType: "application/pdf",
                sizeBytes: data.count,
                checksumSha256: checksum
            ),
            headers: ["Idempotency-Key": idempotencyKey]
        )
        if created.duplicate == true { return created.document.id }
        guard let target = created.upload else { throw APIError.invalidResponse }
        var request = URLRequest(url: target.url)
        request.httpMethod = target.method
        request.httpBody = data
        for (name, value) in target.headers { request.setValue(value, forHTTPHeaderField: name) }
        let response = try await api.transport.send(request)
        guard 200..<300 ~= response.response.statusCode else {
            throw APIError.server(statusCode: response.response.statusCode, code: nil)
        }
        let _: CompleteUploadResult = try await api.send(
            "/documents/\(created.document.id)/complete-upload", method: "POST"
        )
        return created.document.id
    }
}
