import Foundation
import Testing
@testable import DocPilot

struct DocumentsContractTests {
    @Test func 解码服务端文档列表() throws {
        let data = Data(#"{"documents":[{"id":"doc-1","title":"方案","status":"processing","currentStage":"parse","progress":30,"sizeBytes":1024,"pageCount":null,"errorCode":null,"createdAt":"2026-07-21T08:00:00Z"}]}"#.utf8)
        let response = try JSONDecoder.docPilot.decode(DocumentsResponse.self, from: data)
        #expect(response.documents.first?.status == .processing)
        #expect(response.documents.first?.pageCount == nil)
    }
}
