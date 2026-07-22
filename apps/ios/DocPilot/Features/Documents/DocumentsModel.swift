import Foundation
import Observation

@MainActor @Observable
final class DocumentsModel {
    enum LoadState { case idle, loading, loaded, failed }

    private(set) var state = LoadState.idle
    private(set) var documents: [DocumentItem] = []
    private(set) var uploadState = UploadState.idle
    var selectedDocumentID: String?
    private let client: DocumentsClient
    private let uploader: UploadClient

    init(client: DocumentsClient, uploader: UploadClient) {
        self.client = client
        self.uploader = uploader
    }

    var shouldPoll: Bool { documents.contains { $0.status.isInFlight } }

    func load() async {
        if documents.isEmpty { state = .loading }
        do {
            documents = try await client.list()
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed
        }
    }

    func pollWhileNeeded() async {
        while shouldPoll && !Task.isCancelled {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            await load()
        }
    }

    func upload(_ url: URL) async {
        uploadState = uploadState.advancing(to: .creating)
        do {
            uploadState = uploadState.advancing(to: .uploading(progress: 0))
            let id = try await uploader.upload(fileURL: url)
            uploadState = uploadState.advancing(to: .confirming)
            uploadState = uploadState.advancing(to: .completed(documentID: id))
            await load()
            selectedDocumentID = id
        } catch is PDFValidationError {
            uploadState = .failed(.validation)
        } catch {
            uploadState = .failed(.network)
        }
    }
}
