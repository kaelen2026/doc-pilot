import Foundation

enum PDFValidationError: Error, Equatable, Sendable {
    case emptyFile, invalidContentType, invalidMagicBytes, fileTooLarge
}

enum PDFValidator {
    static let maxSizeBytes = 50 * 1024 * 1024

    static func validate(sizeBytes: Int, contentType: String) -> PDFValidationError? {
        if sizeBytes == 0 { return .emptyFile }
        if sizeBytes > maxSizeBytes { return .fileTooLarge }
        if contentType.lowercased() != "application/pdf" { return .invalidContentType }
        return nil
    }

    static func validate(data: Data, contentType: String) -> PDFValidationError? {
        if let error = validate(sizeBytes: data.count, contentType: contentType) { return error }
        return data.starts(with: Data("%PDF-".utf8)) ? nil : .invalidMagicBytes
    }
}
