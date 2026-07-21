import Testing
@testable import DocPilot

struct UploadStateTests {
    @Test func 上传状态按创建直传确认推进() {
        var state = UploadState.idle
        state = state.advancing(to: .creating)
        state = state.advancing(to: .uploading(progress: 0.5))
        state = state.advancing(to: .confirming)
        state = state.advancing(to: .completed(documentID: "doc-1"))
        #expect(state == .completed(documentID: "doc-1"))
    }

    @Test func 不允许跳过创建直接确认() {
        #expect(UploadState.idle.advancing(to: .confirming) == .failed(.invalidTransition))
    }
}
