#!/bin/bash
# Start Chromium with remote debugging so Selenium can attach to it.
# Run this ONCE before running the scraper.
#
# Usage:
#   ./start_chrome.sh
#
# Then:
#   1. In the Chromium window that opens, go to https://www.ziprecruiter.com
#   2. Solve Cloudflare if prompted
#   3. Leave Chromium open
#   4. In another terminal, run: python ziprecruiter.py

PROFILE_DIR="/tmp/chromiumProfile"
PORT="9222"
OS_NAME="$(uname -s)"

if [[ "$OS_NAME" == "Darwin" ]]; then
    if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
        BROWSER_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    elif [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
        BROWSER_BIN="/Applications/Chromium.app/Contents/MacOS/Chromium"
    else
        echo "Could not find Chrome/Chromium app on macOS."
        echo "Install Google Chrome or Chromium in /Applications, then re-run."
        exit 1
    fi
else
    # Linux path (existing behavior)
    BROWSER_BIN="chromium"
fi

echo "Starting browser with remote debugging on port $PORT..."
echo "Browser binary: $BROWSER_BIN"
echo "Profile directory: $PROFILE_DIR"
echo ""
echo "Once Chromium opens:"
echo "  1. Navigate to https://www.ziprecruiter.com"
echo "  2. Solve any Cloudflare challenge"
echo "  3. Leave Chromium open"
echo "  4. In another terminal, run: python ziprecruiter.py"
echo ""

"$BROWSER_BIN" \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check &

echo "Browser started in background (PID: $!)"
echo "You can now run the scraper in this terminal when ready."
