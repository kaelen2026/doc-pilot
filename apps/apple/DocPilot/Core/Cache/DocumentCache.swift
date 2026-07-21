import Foundation

struct DocumentCacheKey: Hashable, Sendable {
    let userID: String
    let documentID: String
    let version: Int

    var relativePath: String {
        "\(sanitize(userID))/\(sanitize(documentID))/v\(version).pdf"
    }

    private func sanitize(_ value: String) -> String {
        value.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" }.reduce("") { $0 + String($1) }
    }
}

actor DocumentCache {
    private let root: URL

    init(root: URL? = nil) {
        self.root = root ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appending(path: "DocPilot/Documents", directoryHint: .isDirectory)
    }

    func cachedURL(for key: DocumentCacheKey) -> URL? {
        let url = root.appending(path: key.relativePath)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func store(_ data: Data, for key: DocumentCacheKey) throws -> URL {
        let destination = root.appending(path: key.relativePath)
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(), withIntermediateDirectories: true
        )
        let temporary = destination.appendingPathExtension("download")
        try data.write(to: temporary, options: .atomic)
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: temporary, to: destination)
        return destination
    }

    func removeUser(_ userID: String) throws {
        let directory = root.appending(path: DocumentCacheKey(userID: userID, documentID: "x", version: 1).relativePath)
            .deletingLastPathComponent().deletingLastPathComponent()
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }
}
