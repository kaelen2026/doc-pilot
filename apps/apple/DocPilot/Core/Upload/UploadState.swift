enum UploadFailure: Error, Equatable, Sendable { case invalidTransition, validation, network }

enum UploadState: Equatable, Sendable {
    case idle, creating, uploading(progress: Double), confirming
    case completed(documentID: String)
    case failed(UploadFailure)

    func advancing(to next: UploadState) -> UploadState {
        let allowed: Bool = switch (self, next) {
        case (.idle, .creating), (.creating, .uploading), (.uploading, .uploading),
             (.uploading, .confirming), (.confirming, .completed): true
        default: false
        }
        return allowed ? next : .failed(.invalidTransition)
    }
}
