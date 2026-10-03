#!/usr/bin/env bash
# Builds mac/build/Dump.app: bundles the notebook engine, compiles a release binary, adds the
# icon, and signs it. With --install, also replaces /Applications/Dump.app and relaunches it.
#
# Signing: DUMP_SIGN_IDENTITY (from the environment or mac/.env.local, which is not committed)
# names a code signing identity, such as your Apple Development certificate. A stable identity
# keeps the Keychain's "Always Allow" for the owner key across rebuilds. Without one, the app is
# signed ad hoc and the Keychain asks again after each rebuild.
set -euo pipefail

mac="$(cd "$(dirname "$0")/.." && pwd)"
app="$mac/build/Dump.app"
if [[ -f "$mac/.env.local" ]]; then
  set -a
  source "$mac/.env.local"
  set +a
fi

(cd "$mac/.." && node mac/engine/build.mjs)
(cd "$mac" && swift build -c release --product Dump)
bin="$(cd "$mac" && swift build -c release --show-bin-path)"

rm -rf "$app" "$mac/build/AppIcon.iconset"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin/Dump" "$app/Contents/MacOS/Dump"
cp "$mac/build/engine.js" "$app/Contents/Resources/engine.js"
cp "$mac/Info.plist" "$app/Contents/Info.plist"
# The build's commit, so About and Finder's Get Info tell builds apart.
build="$(git -C "$mac" rev-parse --short HEAD 2>/dev/null || echo dev)"
plutil -replace CFBundleVersion -string "$build" "$app/Contents/Info.plist"
swift "$mac/scripts/render-icon.swift" "$mac/build/AppIcon.iconset"
iconutil -c icns "$mac/build/AppIcon.iconset" -o "$app/Contents/Resources/AppIcon.icns"

codesign --force --sign "${DUMP_SIGN_IDENTITY:--}" "$app"
echo "Built $app (signed: ${DUMP_SIGN_IDENTITY:-ad hoc})"

if [[ "${1:-}" == "--install" ]]; then
  target=/Applications/Dump.app
  # Any running copy saves its notebook on SIGTERM before quitting.
  if pkill -TERM -f '/Dump.app/Contents/MacOS/Dump$'; then
    for _ in {1..50}; do
      pgrep -f '/Dump.app/Contents/MacOS/Dump$' >/dev/null || break
      sleep 0.1
    done
  fi
  rm -rf "$target"
  ditto "$app" "$target"
  open "$target"
  echo "Installed and opened $target"
fi
