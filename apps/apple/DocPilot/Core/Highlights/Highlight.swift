import CoreGraphics
import Foundation
import SwiftData

@Model
final class Highlight {
    @Attribute(.unique) var id: UUID
    var userID: String
    var documentID: String
    var pageIndex: Int
    var x: Double
    var y: Double
    var width: Double
    var height: Double
    var text: String
    var createdAt: Date

    init(userID: String, documentID: String, pageIndex: Int, bounds: CGRect, text: String) {
        id = UUID()
        self.userID = userID
        self.documentID = documentID
        self.pageIndex = pageIndex
        x = bounds.origin.x; y = bounds.origin.y
        width = bounds.width; height = bounds.height
        self.text = text
        createdAt = Date()
    }

    var bounds: CGRect { CGRect(x: x, y: y, width: width, height: height) }
}
