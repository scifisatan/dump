import AppKit
import DumpKit
import SwiftUI

struct SettingsView: View {
  @Bindable var model: AppModel

  var body: some View {
    Form {
      if model.firstRun {
        Section { Welcome(model: model) }
      }
      Section("Quick capture") {
        LabeledContent("Shortcut") { ShortcutRecorder(model: model) }
        if model.shortcutRefused {
          Text("macOS refused this shortcut; another app may be using it. Choose a different one.")
            .font(.callout)
            .foregroundStyle(.red)
        }
        Toggle(
          "Open at login",
          isOn: Binding(get: { model.opensAtLogin }, set: { model.setOpensAtLogin($0) })
        )
        .disabled(!model.canOpenAtLogin)
      }
      Section("Sync") { SyncSettings(model: model) }
      Section("Advanced") { AdvancedSettings(model: model) }
    }
    .formStyle(.grouped)
    .frame(width: 540)
    .frame(minHeight: 560)
  }
}

private struct Welcome: View {
  let model: AppModel

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      DumpMark().frame(width: 40, height: 40)
      VStack(alignment: .leading, spacing: 6) {
        Text("Dump is in your menu bar").font(.headline)
        Text(
          "Press \(model.shortcut.display) anywhere, type, and press Return. Your notes are saved on this Mac right away; connect your server below to sync them with your other devices."
        )
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
        Button("Try It Now") { model.showPanel?() }
          .padding(.top, 2)
      }
    }
    .padding(.vertical, 4)
  }
}

private struct ShortcutRecorder: View {
  let model: AppModel
  @State private var recording = false
  @State private var monitor: Any?

  var body: some View {
    Button(recording ? "Type a shortcut…" : model.shortcut.display) {
      recording ? stop() : start()
    }
    .frame(minWidth: 130)
    .onDisappear(perform: stop)
    .help("Click, then press the new shortcut. Escape cancels.")
  }

  private func start() {
    recording = true
    model.pauseShortcut?(true)
    monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      let flags = event.modifierFlags.intersection([.command, .option, .control, .shift])
      if event.keyCode == 53, flags.isEmpty {  // Escape
        stop()
      } else if let shortcut = Shortcut(event: event) {
        model.shortcut = shortcut
        stop()
      } else {
        NSSound.beep()
      }
      return nil
    }
  }

  private func stop() {
    guard recording else { return }
    recording = false
    if let monitor { NSEvent.removeMonitor(monitor) }
    monitor = nil
    model.pauseShortcut?(false)
  }
}

private struct SyncSettings: View {
  let model: AppModel

  var body: some View {
    let snapshot = model.snapshot
    LabeledContent("Status") {
      HStack(spacing: 6) {
        Circle().fill(Color(nsColor: snapshot.sync.tint)).frame(width: 8, height: 8)
        Text(snapshot.sync.label)
      }
    }
    if let error = snapshot.syncError, snapshot.sync != .synced {
      Text(error).font(.callout).foregroundStyle(.secondary)
    }
    if let server = model.server {
      LabeledContent("Server") {
        Text(server.baseUrl).textSelection(.enabled)
      }
      if snapshot.sync == .signedOut { SignIn(model: model) }
      DisclosureGroup("Switch to another server") {
        ServerConnection(model: model, action: "Switch to This Server")
        Text(
          "Switching opens that server’s own notebook. Notes stay with their server; move them with export and import in the web app."
        )
        .font(.callout)
        .foregroundStyle(.secondary)
      }
    } else {
      Text(
        "This notebook lives only on this Mac. Connect your server to sync it with your other devices and keep a copy off this Mac."
      )
      .foregroundStyle(.secondary)
      ServerConnection(
        model: model, action: "Connect and Sync",
        notice: "Your notes on this Mac will be added to this server’s notebook.")
    }
    let others = model.profiles.others
    if !others.isEmpty {
      ForEach(others) { profile in
        LabeledContent(profile.server?.host ?? "This Mac only") {
          Button("Open") {
            Task { try? await model.switchTo(profile) }
          }
        }
      }
    }
  }
}

/// Finds a Dump server, then checks its owner key before anything is saved; the web app's
/// ServerConnection, natively.
private struct ServerConnection: View {
  let model: AppModel
  let action: String
  var notice: String?
  @State private var address = ""
  @State private var key = ""
  @State private var checked: ServerCheck?
  @State private var busy = false
  @State private var error: String?

  var body: some View {
    LabeledContent("Server address") {
      HStack {
        TextField("Server address", text: $address, prompt: Text("https://dump-api.example.com"))
          .labelsHidden()
          .textFieldStyle(.roundedBorder)
          .autocorrectionDisabled()
          .onSubmit(check)
          .onChange(of: address) {
            checked = nil
            error = nil
          }
        Button("Check", action: check)
          .disabled(busy || address.trimmingCharacters(in: .whitespaces).isEmpty)
      }
      .frame(maxWidth: 330)
    }
    if let checked {
      LabeledContent("Found") {
        VStack(alignment: .trailing, spacing: 2) {
          Label("Dump server", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
          Text("Automatic filing \(checked.classify ? "available" : "off")")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
      }
      if checked.hasOwnerKey {
        LabeledContent("Owner key") {
          SecureField("Owner key", text: $key)
            .labelsHidden()
            .textFieldStyle(.roundedBorder)
            .onSubmit(connect)
            .frame(maxWidth: 330)
        }
        if let notice { Text(notice).font(.callout).foregroundStyle(.secondary) }
        HStack {
          Spacer()
          if busy { ProgressView().controlSize(.small) }
          Button(action, action: connect)
            .buttonStyle(.borderedProminent)
            .disabled(busy || key.isEmpty)
        }
      } else {
        Text("This server has no owner key yet. Set OWNER_KEY on it, redeploy, then check again.")
          .foregroundStyle(.red)
      }
    }
    if let error {
      Text(error).font(.callout).foregroundStyle(.red)
    }
  }

  private func check() {
    guard !busy else { return }
    busy = true
    error = nil
    Task {
      defer { busy = false }
      do {
        checked = try await model.engine.inspect(address)
      } catch {
        self.error = error.localizedDescription
      }
    }
  }

  private func connect() {
    guard let checked, !busy, !key.isEmpty else { return }
    busy = true
    error = nil
    Task {
      defer { busy = false }
      do {
        try await model.connect(checked, key: key)
        key = ""
        address = ""
        self.checked = nil
      } catch {
        self.error = error.localizedDescription
      }
    }
  }
}

/// Shown when the server refused this Mac's key, because it is wrong or was rotated.
private struct SignIn: View {
  let model: AppModel
  @State private var key = ""
  @State private var busy = false
  @State private var error: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("This Mac is signed out. Your notes are still here; enter the owner key to sync again.")
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        SecureField("Owner key", text: $key)
          .textFieldStyle(.roundedBorder)
          .onSubmit(signIn)
        Button("Sign In", action: signIn).disabled(busy || key.isEmpty)
      }
      if let error { Text(error).font(.callout).foregroundStyle(.red) }
    }
  }

  private func signIn() {
    guard !busy, !key.isEmpty else { return }
    busy = true
    error = nil
    Task {
      defer { busy = false }
      do {
        try await model.signIn(key: key)
        key = ""
      } catch {
        self.error = error.localizedDescription
      }
    }
  }
}

private struct AdvancedSettings: View {
  let model: AppModel
  @State private var origin = ""
  @State private var invalid = false

  var body: some View {
    let standard = model.server.flatMap { URL(string: $0.baseUrl) }.map(ClientOrigin.standard(for:))
      ?? ClientOrigin.hosted
    LabeledContent("Web app address") {
      TextField("Web app address", text: $origin, prompt: Text(standard))
        .labelsHidden()
        .textFieldStyle(.roundedBorder)
        .autocorrectionDisabled()
        .onSubmit(apply)
        .frame(maxWidth: 330)
    }
    Text(
      "Servers answer only the web app addresses listed in their ALLOWED_CLIENT_ORIGINS, and this Mac introduces itself as one. Leave it empty to use the hosted app (or the dev client for a localhost server). Press Return to apply."
    )
    .font(.callout)
    .foregroundStyle(invalid ? .red : .secondary)
    .onAppear { origin = model.webAppOrigin ?? "" }
    Button("Show Notebook Files in Finder") {
      NSWorkspace.shared.activateFileViewerSelecting([AppModel.dataDirectory])
    }
  }

  private func apply() {
    let trimmed = origin.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty {
      model.webAppOrigin = nil
    } else if let normalized = ClientOrigin.normalized(trimmed) {
      model.webAppOrigin = normalized
      origin = normalized
    } else {
      invalid = true
      return
    }
    invalid = false
    model.engine.resume()
  }
}
