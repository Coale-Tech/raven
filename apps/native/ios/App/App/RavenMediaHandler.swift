import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves raven-media://<folder>/<file>?src=<site url>: the bearer goes only to the session's origin.
final class RavenMediaHandler: NSObject, WKURLSchemeHandler, URLSessionDataDelegate {
    static let shared = RavenMediaHandler()
    var origin = ""
    var token = ""
    // WebKit throws when a stopped task is touched. The delegate shares the main queue with start
    // and stop, so that cannot happen. All state here is main-thread only.
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
    private var tasks: [Int: Entry] = [:]
    // File writes stay off the main thread; serial, so a part file closes after its last write.
    private let disk = DispatchQueue(label: "raven.media.disk")
    private var folder: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("media") }

    private final class Entry {
        let scheme: WKURLSchemeTask
        let task: URLSessionTask
        let target: URL
        // Own part file per task: two requests for one file never write into each other.
        let partURL: URL
        var part: FileHandle?
        init(scheme: WKURLSchemeTask, task: URLSessionTask, target: URL) {
            self.scheme = scheme; self.task = task; self.target = target
            partURL = target.appendingPathExtension("\(task.taskIdentifier).part")
        }
    }

    func webView(_ webView: WKWebView, start schemeTask: WKURLSchemeTask) {
        guard let url = schemeTask.request.url, let host = url.host,
              let src = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "src" })?.value,
              !origin.isEmpty, src.hasPrefix(origin + "/"), let srcURL = URL(string: src) else {
            return fail(schemeTask, status: 403)
        }
        // Media elements only: as a page, a site file would run inside the app's WebView with the native bridge.
        if schemeTask.request.mainDocumentURL == url { return fail(schemeTask, status: 403) }
        let target = folder.appendingPathComponent(host).appendingPathComponent(url.lastPathComponent)
        let range = schemeTask.request.value(forHTTPHeaderField: "Range")
        if FileManager.default.fileExists(atPath: target.path) { return fromDisk(schemeTask, file: target, range: range) }
        var request = URLRequest(url: srcURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let range = range { request.setValue(range, forHTTPHeaderField: "Range") }
        let task = session.dataTask(with: request)
        tasks[task.taskIdentifier] = Entry(scheme: schemeTask, task: task, target: target)
        task.resume()
    }

    // WebKit stops a task it has abandoned (scrolled away, seek); the partial copy is dropped.
    func webView(_ webView: WKWebView, stop schemeTask: WKURLSchemeTask) {
        guard let id = tasks.first(where: { $0.value.scheme === schemeTask })?.key, let entry = tasks.removeValue(forKey: id) else { return }
        entry.task.cancel()
        disk.async {
            entry.part?.closeFile()
            try? FileManager.default.removeItem(at: entry.partURL)
        }
    }

    // A complete cached file answers Range itself: video seeking never touches the network.
    private func fromDisk(_ schemeTask: WKURLSchemeTask, file: URL, range: String?) {
        guard let data = try? Data(contentsOf: file, options: .mappedIfSafe) else { return fail(schemeTask, status: 500) }
        var start = 0, end = data.count - 1
        if let range = range, range.hasPrefix("bytes=") {
            let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false).map { Int($0) ?? nil }
            if let first = parts.first ?? nil {
                start = first
                if parts.count > 1, let last = parts[1] { end = min(end, last) }
            } else if parts.count > 1, let suffix = parts[1] {
                start = max(0, data.count - suffix)
            }
        }
        guard start <= end, start < data.count else { return fail(schemeTask, status: 416) }
        var headers = ["Content-Type": mime(for: file), "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "X-Content-Type-Options": "nosniff"]
        if range != nil { headers["Content-Range"] = "bytes \(start)-\(end)/\(data.count)" }
        let response = HTTPURLResponse(url: schemeTask.request.url!, statusCode: range == nil ? 200 : 206, httpVersion: "HTTP/1.1", headerFields: headers)!
        schemeTask.didReceive(response)
        // The file is mapped, not read: sent in slices, a range of a large video is never in memory at once.
        let slice = 1 << 20
        var offset = start
        while offset <= end {
            let upper = min(offset + slice, end + 1)
            schemeTask.didReceive(offset == 0 && upper == data.count ? data : data.subdata(in: offset..<upper))
            offset = upper
        }
        schemeTask.didFinish()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, let entry = tasks[dataTask.taskIdentifier] else { return completionHandler(.cancel) }
        if http.statusCode >= 400 {
            tasks.removeValue(forKey: dataTask.taskIdentifier)
            fail(entry.scheme, status: http.statusCode)
            return completionHandler(.cancel)
        }
        // A full 200 is teed into a part file and renamed on completion; a Range answer is streamed only.
        if http.statusCode == 200, dataTask.originalRequest?.value(forHTTPHeaderField: "Range") == nil {
            disk.async {
                try? FileManager.default.createDirectory(at: entry.target.deletingLastPathComponent(), withIntermediateDirectories: true)
                FileManager.default.createFile(atPath: entry.partURL.path, contents: nil)
                entry.part = try? FileHandle(forWritingTo: entry.partURL)
            }
        }
        let keep = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control"]
        var headers = ["X-Content-Type-Options": "nosniff"]
        for (key, value) in http.allHeaderFields {
            guard let key = key as? String, let value = value as? String, let name = keep.first(where: { $0.caseInsensitiveCompare(key) == .orderedSame }) else { continue }
            headers[name] = name == "Content-Type" ? inert(value) : value
        }
        entry.scheme.didReceive(HTTPURLResponse(url: entry.scheme.request.url!, statusCode: http.statusCode, httpVersion: "HTTP/1.1", headerFields: headers)!)
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let entry = tasks[dataTask.taskIdentifier] else { return }
        disk.async { entry.part?.write(data) }
        entry.scheme.didReceive(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let entry = tasks.removeValue(forKey: task.taskIdentifier) else { return }
        disk.async {
            guard let part = entry.part else { return }
            part.closeFile()
            // A failed move (download error, or another request finished this file first) drops the copy.
            if error != nil || (try? FileManager.default.moveItem(at: entry.partURL, to: entry.target)) == nil {
                try? FileManager.default.removeItem(at: entry.partURL)
            }
        }
        if let error = error { entry.scheme.didFailWithError(error) } else { entry.scheme.didFinish() }
    }

    private func fail(_ schemeTask: WKURLSchemeTask, status: Int) {
        schemeTask.didReceive(HTTPURLResponse(url: schemeTask.request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: [:])!)
        schemeTask.didFinish()
    }

    private func mime(for file: URL) -> String {
        inert(UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream")
    }

    /// A site file never renders as a document here, whatever type the site reports.
    private func inert(_ contentType: String) -> String {
        let type = contentType.lowercased()
        return type.hasPrefix("text/html") || type.hasPrefix("application/xhtml+xml") ? "text/plain" : contentType
    }
}
