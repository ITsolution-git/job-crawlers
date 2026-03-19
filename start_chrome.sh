#!/bin/bash
set -euo pipefail

# Start Chrome/Chromium with remote debugging so Selenium can attach.
# Run this ONCE before running the scraper.
#
# Usage:
#   ./start_chrome.sh
#
# Then:
#   1. In the browser window that opens, go to https://www.ziprecruiter.com
#   2. Solve Cloudflare if prompted
#   3. Leave the browser open
#   4. In another terminal, run: python ziprecruiter.py

PROFILE_DIR="${HOME}/.chromium-scraper-profile"
PORT="9222"

mkdir -p "$PROFILE_DIR"

UNAME="$(uname -s)"
CHROME_BIN=""

if [[ "$UNAME" == "Darwin" ]]; then
  if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
    CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  elif [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
    CHROME_BIN="/Applications/Chromium.app/Contents/MacOS/Chromium"
  fi
else
  # Linux
  if command -v chromium >/dev/null 2>&1; then
    CHROME_BIN="$(command -v chromium)"
  elif command -v chromium-browser >/dev/null 2>&1; then
    CHROME_BIN="$(command -v chromium-browser)"
  elif command -v google-chrome >/dev/null 2>&1; then
    CHROME_BIN="$(command -v google-chrome)"
  elif command -v chrome >/dev/null 2>&1; then
    CHROME_BIN="$(command -v chrome)"
  fi
fi

if [[ -z "$CHROME_BIN" ]]; then
  echo "Could not find Chrome/Chromium binary automatically."
  echo "Edit $0 and set CHROME_BIN to your browser executable path."
  exit 1
fi

echo "Starting Chrome/Chromium with remote debugging on port ${PORT}..."
echo "Browser binary: $CHROME_BIN"
echo "Profile directory: $PROFILE_DIR"
echo ""
echo "Once the browser opens:"
echo "  1. Navigate to https://www.ziprecruiter.com"
echo "  2. Solve any Cloudflare challenge"
echo "  3. Leave the browser open"
echo "  4. In another terminal, run: python ziprecruiter.py"
echo ""

"$CHROME_BIN" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check &

echo "Browser started in background (PID: $!)"
echo "You can now run the scraper when ready."
