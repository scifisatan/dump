import Foundation

/// WebSocket for the engine, on URLSessionWebSocketTask with the Origin header the server
/// expects. Every socket ends with exactly one `close` event. Callbacks arrive on the main thread.
@MainActor
final class SocketBridge: NSObject, URLSessionWebSocketDelegate {
  private var session: URLSession!
  private var sockets: [Int: URLSessionWebSocketTask] = [:]
  private var opened: Set<Int> = []
  private let origin: (URL) -> String
  /// (socket ID, event, data, close code): see `host.socket` in mac/engine/polyfills.ts.
  private let emit: (Int, String, Any, Int) -> Void

  init(origin: @escaping (URL) -> String, emit: @escaping (Int, String, Any, Int) -> Void) {
    self.origin = origin
    self.emit = emit
    super.init()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
  }

  func open(id: Int, url: String) {
    guard let target = URL(string: url), ["ws", "wss"].contains(target.scheme ?? "") else {
      emit(id, "error", "", 0)
      emit(id, "close", "", 1006)
      return
    }
    var request = URLRequest(url: target, timeoutInterval: 30)
    var originURL = URLComponents(url: target, resolvingAgainstBaseURL: false)
    originURL?.scheme = target.scheme == "wss" ? "https" : "http"
    request.setValue(origin(originURL?.url ?? target), forHTTPHeaderField: "Origin")
    let task = session.webSocketTask(with: request)
    // TinyBase sends large first syncs as 256 KB fragments; leave generous headroom.
    task.maximumMessageSize = 32 << 20
    sockets[id] = task
    task.taskDescription = String(id)
    task.resume()
    receive(id, task)
  }

  func send(id: Int, _ text: String) {
    guard let task = sockets[id] else { return }
    let size = text.utf8.count
    task.send(.string(text)) { error in
      MainActor.assumeIsolated {
        self.emit(id, "sent", size, 0)
        if let error { self.fail(id, error) }
      }
    }
  }

  func close(id: Int, code: Int, reason: String) {
    guard let task = sockets[id] else { return }
    let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .normalClosure
    task.cancel(with: closeCode, reason: Data(reason.utf8))
    // A socket closed before it opened never reports back; settle it here.
    if !opened.contains(id) { finish(id, code: 1006, reason: "") }
  }

  private func receive(_ id: Int, _ task: URLSessionWebSocketTask) {
    task.receive { result in
      MainActor.assumeIsolated {
        guard self.sockets[id] === task else { return }
        switch result {
        case .success(.string(let text)):
          self.emit(id, "message", text, 0)
          self.receive(id, task)
        case .success(.data(let data)):
          self.emit(id, "message", String(decoding: data, as: UTF8.self), 0)
          self.receive(id, task)
        case .success:
          self.receive(id, task)
        case .failure(let error):
          self.fail(id, error)
        }
      }
    }
  }

  private func fail(_ id: Int, _ error: Error) {
    guard let task = sockets[id] else { return }
    let status = (task.response as? HTTPURLResponse)?.statusCode
    log.notice(
      "Sync socket failed\(status.map { " (HTTP \($0))" } ?? "", privacy: .public): \(error.localizedDescription, privacy: .public)"
    )
    emit(id, "error", "", 0)
    task.cancel()
    finish(id, code: 1006, reason: "")
  }

  private func finish(_ id: Int, code: Int, reason: String) {
    guard sockets.removeValue(forKey: id) != nil else { return }
    opened.remove(id)
    emit(id, "close", reason, code)
  }

  private func id(of task: URLSessionTask) -> Int? {
    task.taskDescription.flatMap(Int.init)
  }

  nonisolated func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?
  ) {
    MainActor.assumeIsolated {
      guard let id = id(of: webSocketTask), sockets[id] === webSocketTask else { return }
      opened.insert(id)
      emit(id, "open", "", 0)
    }
  }

  nonisolated func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?
  ) {
    MainActor.assumeIsolated {
      guard let id = id(of: webSocketTask), sockets[id] === webSocketTask else { return }
      finish(id, code: closeCode.rawValue, reason: String(decoding: reason ?? Data(), as: UTF8.self))
    }
  }

  nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    MainActor.assumeIsolated {
      guard let id = id(of: task), sockets[id] === task else { return }
      if let error { fail(id, error) } else { finish(id, code: 1006, reason: "") }
    }
  }
}
