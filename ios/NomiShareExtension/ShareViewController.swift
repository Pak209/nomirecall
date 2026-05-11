import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        Task {
            await handleSharedItems()
        }
    }

    private func handleSharedItems() async {
        let inputItems = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let providers = inputItems.flatMap { $0.attachments ?? [] }

        var payload = NomiSharePayload(receivedAt: Date())

        for provider in providers {
            if payload.urlString == nil,
               provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let url = await loadURL(from: provider) {
                payload.urlString = url.absoluteString
            }

            if payload.text == nil,
               provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
               let text = await loadString(from: provider) {
                payload.text = text
            }
        }

        if payload.urlString == nil,
           let detectedURL = firstURL(in: payload.text) {
            payload.urlString = detectedURL.absoluteString
        }

        do {
            try NomiShareInbox.save(payload)
            openNomi()
            extensionContext?.completeRequest(returningItems: nil)
        } catch {
            extensionContext?.cancelRequest(withError: error)
        }
    }

    private func loadURL(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let string = item as? String {
                    continuation.resume(returning: URL(string: string))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func loadString(from provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                if let string = item as? String {
                    continuation.resume(returning: string)
                } else if let data = item as? Data {
                    continuation.resume(returning: String(data: data, encoding: .utf8))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func firstURL(in text: String?) -> URL? {
        guard let text,
              let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }

        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return detector.firstMatch(in: text, range: range)?.url
    }

    private func openNomi() {
        guard let url = URL(string: "nomirecall://share") else { return }
        var responder: UIResponder? = self
        let selector = NSSelectorFromString("openURL:")

        while let currentResponder = responder {
            if currentResponder.responds(to: selector) {
                currentResponder.perform(selector, with: url)
                return
            }
            responder = currentResponder.next
        }
    }
}
