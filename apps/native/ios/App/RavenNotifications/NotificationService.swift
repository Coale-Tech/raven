import Intents
import UserNotifications

/// Dresses a push before iOS shows it: it becomes a message from a person, with their face,
/// their name and the conversation it belongs to (contract: raven/notification.py). It runs only
/// because the relay marks the push mutable, and shows it as sent if it cannot finish in time.
final class NotificationService: UNNotificationServiceExtension {
    // Held so the timeout can deliver what has been built so far. The download's thread and the
    // timeout both reach them, so every touch is on this queue and the push is handed over once.
    private let queue = DispatchQueue(label: "raven.notification.service")
    // Who sent the message, which names the person the notification is shown as coming from.
    private var sender: String?
    // The site, named beside the sender when this device has more than one to tell apart.
    private var site: String?
    private var manySites: Bool {
        (UserDefaults(suiteName: "group.raven.thecommit.company")?.integer(forKey: "siteCount") ?? 0) > 1
    }
    private var deliver: ((UNNotificationContent) -> Void)?
    private var content: UNMutableNotificationContent?
    private var download: URLSessionTask?
    // iOS gives the extension seconds: a face is worth a short wait, never the notification.
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 5
        return URLSession(configuration: configuration)
    }()

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            return contentHandler(request.content)
        }
        deliver = contentHandler
        self.content = content
        let info = request.content.userInfo

        // The site travels on the title of a push the device draws. It moves under the sender,
        // where it stays only if this push is not turned into a message below.
        site = host(from: info)
        if let site = site {
            content.subtitle = site
            content.title = content.title.replacingOccurrences(of: " · \(site)", with: "")
        }
        // One thread per conversation, so iOS stacks a channel's notifications together.
        if content.threadIdentifier.isEmpty, let tag = info["tag"] as? String { content.threadIdentifier = tag }

        sender = info["from_user"] as? String
        guard let avatar = url(from: info) else { return finish() }
        if let cached = AvatarStore.file(for: avatar) { return finish(face: cached) }
        download = Self.session.downloadTask(with: avatar) { [weak self] location, _, _ in
            guard let self = self else { return }
            guard let location = location, let stored = AvatarStore.keep(location, for: avatar) else { return self.finish() }
            self.finish(face: stored)
        }
        download?.resume()
    }

    // iOS is about to show the push as it arrived; hand over what is ready.
    override func serviceExtensionTimeWillExpire() {
        download?.cancel()
        finish()
    }

    /// The push as a message from a person, which is what puts the sender's face where the app's
    /// icon would be. It needs the communication notifications capability; without it, or without a
    /// sender to name, the notification is shown as it stands.
    private func asMessage(_ content: UNMutableNotificationContent, face: URL?) -> UNNotificationContent {
        guard !content.title.isEmpty else { return content }
        // A message notification has room for the sender alone: the site comes along only when
        // this device is signed in to more than one and the name would be ambiguous.
        let name = manySites ? [content.title, site].compactMap { $0 }.joined(separator: " · ") : content.title
        let image = face.flatMap { try? Data(contentsOf: $0) }.map { INImage(imageData: $0) }
        let handle = INPersonHandle(value: sender ?? content.title, type: .unknown)
        let person = INPerson(
            personHandle: handle,
            nameComponents: nil,
            displayName: name,
            image: image,
            contactIdentifier: nil,
            customIdentifier: handle.value
        )
        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: nil,
            conversationIdentifier: content.threadIdentifier.isEmpty ? nil : content.threadIdentifier,
            serviceName: nil,
            sender: person,
            attachments: nil
        )
        if let image = image { intent.setImage(image, forParameterNamed: \.sender) }
        // Donated, so iOS ties this push to the ones before it from the same person.
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        interaction.donate(completion: nil)
        return (try? content.updating(from: intent)) ?? content
    }

    private func finish(face: URL? = nil) {
        queue.sync {
            guard let deliver = deliver, let content = content else { return }
            self.deliver = nil
            deliver(asMessage(content, face: face))
        }
    }

    /// The site's hostname, which is the name it puts on a title it words itself.
    private func host(from info: [AnyHashable: Any]) -> String? {
        if let base = info["base_url"] as? String, let host = URL(string: base)?.host { return host }
        let sitename = info["sitename"] as? String
        return sitename?.isEmpty == false ? sitename : nil
    }

    /// The face on the notification: a channel's workspace, or the sender of a direct message.
    private func url(from info: [AnyHashable: Any]) -> URL? {
        if let logo = info["workspace_image"] as? String, !logo.isEmpty { return URL(string: logo) }
        if let image = info["image"] as? String, !image.isEmpty { return URL(string: image) }
        guard let options = info["fcm_options"] as? [AnyHashable: Any], let image = options["image"] as? String else { return nil }
        return URL(string: image)
    }
}
