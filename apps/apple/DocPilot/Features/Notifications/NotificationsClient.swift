import Foundation

enum NotificationStreamUpdate: Sendable {
    case snapshot(Int)
    case created(NotificationItem)
}

struct NotificationsClient: Sendable {
    let api: APIClient

    func stream() -> AsyncThrowingStream<NotificationStreamUpdate, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    guard let url = URL(string: "/api/v1/notifications/stream", relativeTo: api.baseURL) else {
                        throw APIError.invalidResponse
                    }
                    var request = URLRequest(url: url)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    if let token = await api.token?() {
                        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    }
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        throw APIError.invalidResponse
                    }
                    var parser = SSEParser()
                    for try await line in bytes.lines {
                        try Task.checkCancellation()
                        for frame in try parser.feed(Data((line + "\n").utf8)) {
                            switch frame.event {
                            case "notification.snapshot":
                                let value = try JSONDecoder.docPilot.decode(NotificationSnapshot.self, from: Data(frame.data.utf8))
                                continuation.yield(.snapshot(value.unreadCount))
                            case "notification.created":
                                let item = try JSONDecoder.docPilot.decode(NotificationItem.self, from: Data(frame.data.utf8))
                                continuation.yield(.created(item))
                            default: break
                            }
                        }
                    }
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
