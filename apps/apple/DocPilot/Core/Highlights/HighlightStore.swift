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
}
