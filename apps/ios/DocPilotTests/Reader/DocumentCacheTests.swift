import Foundation
import Testing
@testable import DocPilot

struct DocumentCacheTests {
    @Test func 缓存键按用户文档版本隔离() {
        let key = DocumentCacheKey(userID: "user/a", documentID: "doc:1", version: 2)
        #expect(key.relativePath == "user_a/doc_1/v2.pdf")
    }
}
