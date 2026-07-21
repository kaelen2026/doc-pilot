import Foundation
import Testing
@testable import DocPilot

struct DiscoveryContractTests {
    @Test func decodesSearchResults() throws {
        let data = Data(#"{"results":[{"documentId":"doc-1","title":"报告","score":0.9,"passages":[{"chunkId":"chunk-1","content":"内容","pageStart":2,"pageEnd":2,"score":0.9}]}]}"#.utf8)
        let response = try JSONDecoder.docPilot.decode(SearchResponse.self, from: data)
        #expect(response.results.first?.passages.first?.pageStart == 2)
    }

    @Test func decodesNotificationSnapshot() throws {
        let data = Data(#"{"unreadCount":3}"#.utf8)
        let snapshot = try JSONDecoder.docPilot.decode(NotificationSnapshot.self, from: data)
        #expect(snapshot.unreadCount == 3)
    }
}
