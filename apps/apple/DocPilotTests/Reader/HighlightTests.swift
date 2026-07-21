import CoreGraphics
import Testing
@testable import DocPilot

struct HighlightTests {
    @Test func 高亮保留用户文档页码和坐标() {
        let highlight = Highlight(
            userID: "user-1", documentID: "doc-1", pageIndex: 2,
            bounds: CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.04), text: "证据"
        )
        #expect(highlight.userID == "user-1")
        #expect(highlight.documentID == "doc-1")
        #expect(highlight.bounds.width == 0.3)
    }
}
