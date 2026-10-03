import Foundation

/// fetch() for the engine: no cookies, no cache, no redirects, and the Origin header the server
/// expects. Callbacks arrive on the main thread.
@MainActor
final class HTTPBridge: NSObject, URLSessionTaskDelegate {
  struct Response {
    var status = 0
    var headers = "[]"
    var body = ""
    var url = ""
    /// Set for a network failure; fetch() rejects with a TypeError carrying it.
    var error: String?
  }

  private var session: URLSession!
  private var tasks: [Int: URLSessionDataTask] = [:]
  private let origin: (URL) -> String
  private let respond: (Int, Response) -> Void

  init(origin: @escaping (URL) -> String, respond: @escaping (Int, Response) -> Void) {
    self.origin = origin
    self.respond = respond
    super.init()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
  }

  func start(id: Int, method: String, url: String, headers: String, body: String?) {
    guard let target = URL(string: url), ["http", "https"].contains(target.scheme ?? "") else {
      respond(id, Response(error: "Invalid URL."))
      return
    }
    var request = URLRequest(url: target, timeoutInterval: 30)
    request.httpMethod = method
    let pairs = (try? JSONDecoder().decode([[String]].self, from: Data(headers.utf8))) ?? []
    for pair in pairs where pair.count == 2 { request.setValue(pair[1], forHTTPHeaderField: pair[0]) }
    request.setValue(origin(target), forHTTPHeaderField: "Origin")
    request.httpBody = body.map { Data($0.utf8) }
    let task = session.dataTask(with: request) { data, response, error in
      MainActor.assumeIsolated { self.finish(id, url, data, response, error) }
    }
    tasks[id] = task
    task.resume()
  }

  func cancel(_ id: Int) {
    tasks.removeValue(forKey: id)?.cancel()
  }

  private func finish(_ id: Int, _ url: String, _ data: Data?, _ response: URLResponse?, _ error: Error?) {
    // A cancelled request was already settled by its AbortSignal.
    guard tasks.removeValue(forKey: id) != nil else { return }
    guard error == nil, let http = response as? HTTPURLResponse else {
      log.notice("Request to \(url, privacy: .public) failed: \(error?.localizedDescription ?? "no response", privacy: .public)")
      respond(id, Response(error: error?.localizedDescription ?? "The server sent no response."))
      return
    }
    if (300..<400).contains(http.statusCode) {
      respond(id, Response(error: "The server redirected the request, which Dump does not follow."))
      return
    }
    let headers = http.allHeaderFields.compactMap { name, value -> [String]? in
      guard let name = name as? String else { return nil }
      return [name.lowercased(), "\(value)"]
    }
    let headerJSON = (try? JSONEncoder().encode(headers)).map { String(decoding: $0, as: UTF8.self) }
    respond(
      id,
      Response(
        status: http.statusCode, headers: headerJSON ?? "[]",
        body: String(decoding: data ?? Data(), as: UTF8.self), url: url))
  }

  nonisolated func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping @Sendable (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}
