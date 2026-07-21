import Foundation
import Testing
@testable import DocPilot

struct SSEParserTests {
    @Test func 支持跨块CRLF和多行Data() throws {
        var parser = SSEParser()
        #expect(try parser.feed(Data("event: message.del".utf8)).isEmpty)
        let frames = try parser.feed(Data("ta\r\ndata: {\"text\":\"a\"}\r\ndata: tail\r\n\r\n".utf8))
        #expect(frames == [SSEFrame(event: "message.delta", data: "{\"text\":\"a\"}\ntail")])
    }

    @Test func 忽略注释并保留未知事件供上层决定() throws {
        var parser = SSEParser()
        let frames = try parser.feed(Data(": keepalive\n\nevent: future.event\ndata: {}\n\n".utf8))
        #expect(frames == [SSEFrame(event: "future.event", data: "{}")])
    }
}
