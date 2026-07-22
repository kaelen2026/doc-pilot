import Foundation
import Testing
@testable import DocPilot

struct PDFValidatorTests {
    @Test func 接受合法PDF() {
        let data = Data("%PDF-1.7 fixture".utf8)
        #expect(PDFValidator.validate(data: data, contentType: "application/pdf") == nil)
    }

    @Test func 拒绝伪装文件和超限文件() {
        #expect(PDFValidator.validate(data: Data("not pdf".utf8), contentType: "application/pdf") == .invalidMagicBytes)
        #expect(PDFValidator.validate(sizeBytes: 50 * 1024 * 1024 + 1, contentType: "application/pdf") == .fileTooLarge)
    }
}
