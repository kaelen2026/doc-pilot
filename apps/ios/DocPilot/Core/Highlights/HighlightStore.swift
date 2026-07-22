import Foundation
import SwiftData

@MainActor
struct HighlightStore {
    let context: ModelContext

    func list(userID: String, documentID: String) throws -> [Highlight] {
        let predicate = #Predicate<Highlight> { $0.userID == userID && $0.documentID == documentID }
        return try context.fetch(FetchDescriptor(predicate: predicate, sortBy: [SortDescriptor(\.createdAt)]))
    }

    func add(_ highlight: Highlight) throws { context.insert(highlight); try context.save() }
    func delete(_ highlight: Highlight) throws { context.delete(highlight); try context.save() }

    /// 本机高亮总条数(供设置页展示)。
    func count() throws -> Int { try context.fetchCount(FetchDescriptor<Highlight>()) }

    /// 清除本机全部高亮。
    func deleteAll() throws { try context.delete(model: Highlight.self); try context.save() }
}
