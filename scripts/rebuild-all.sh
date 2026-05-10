#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== Rebuilding Bifrost (all components) ==="
echo "Root: $ROOT"
echo

# 1. Frontend
echo "--- Step 1/3: Build frontend (Vite) ---"
cd "$ROOT/desktop"
npm install --silent
npm run build
echo "Frontend built OK"
echo

# 2. Agent daemon (requires nightly for MSRV compatibility)
echo "--- Step 2/3: Build bifrost-agentd ---"
cd "$ROOT"
rustup run nightly cargo build -p bifrost-agentd "$@"
echo "bifrost-agentd built OK"
echo

# 3. Desktop app (use tauri build to embed frontend assets, skip packaging)
echo "--- Step 3/3: Build bifrost-desktop ---"
cd "$ROOT/desktop/src-tauri"
if [ "${1:-}" = "--release" ]; then
    rustup run nightly cargo tauri build --no-bundle
else
    rustup run nightly cargo tauri build --debug --no-bundle
fi
echo "bifrost-desktop built OK"
echo

echo "=== All builds complete ==="
echo "Agent:    $ROOT/target/debug/bifrost-agentd"
echo "Desktop:  $ROOT/target/debug/bifrost-desktop"
echo
echo "Usage:"
echo "  1. Start agent:  ./target/debug/bifrost-agentd --data-dir /tmp/bifrost-test"
echo "  2. Copy token:   cat /tmp/bifrost-test/agent.key"
echo "  3. Start desktop: ./target/debug/bifrost-desktop"
