import Foundation

struct SSEFrame: Equatable, Sendable {
    let event: String
    let data: String
}

struct SSEParser: Sendable {
    private var buffer = Data()

    mutating func feed(_ chunk: Data) throws -> [SSEFrame] {
        buffer.append(chunk)
        guard var text = String(data: buffer, encoding: .utf8) else { return [] }
        text = text.replacingOccurrences(of: "\r\n", with: "\n")
        var blocks = text.components(separatedBy: "\n\n")
        guard blocks.count > 1 else { return [] }
        let remainder = blocks.removeLast()
        buffer = Data(remainder.utf8)
        return blocks.compactMap(parse)
    }

    private func parse(_ block: String) -> SSEFrame? {
        var event = "message"
        var data: [String] = []
        for line in block.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix(":") { continue }
            if line.hasPrefix("event:") { event = line.dropFirst(6).trimmingCharacters(in: .whitespaces) }
            if line.hasPrefix("data:") { data.append(line.dropFirst(5).trimmingCharacters(in: .whitespaces)) }
        }
        return data.isEmpty ? nil : SSEFrame(event: event, data: data.joined(separator: "\n"))
    }
}
