#!/usr/bin/env bash
# Re-render the README screenshots from the real helm components (demo data).
# Needs: node, python3 + Pillow, Google Chrome, network for `npx @tailwindcss/cli`.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$root/tests/.tmp"; work="$(mktemp -d)"
CHROME="${CHROME:-google-chrome}"

HELM_SCREEN=1 node "$root/tests/smoke.mjs"

# The app ships Tailwind v4; compile the utilities these surfaces use.
cat > "$work/in.css" <<EOF
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@source "$tmp/*.html";
EOF
(cd "$work" && npm init -y >/dev/null && npm i -s tailwindcss@4 @tailwindcss/cli@4 >/dev/null && npx @tailwindcss/cli -i in.css -o tw.css >/dev/null 2>&1)

shot() { # name title width
  python3 "$root/tools/screens/frame.py" "$tmp/$1.html" "$work/$1.html" --title "$2" --width "$3" --css "$work/tw.css" ${4:+--pad "$4"}
  "$CHROME" --headless=new --no-sandbox --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="$(( $3 + 56 )),2400" --screenshot="$work/$1.png" "file://$work/$1.html" 2>/dev/null
  python3 "$root/tools/screens/trim.py" "$work/$1.png" "$root/docs/screens/$1.png"
}
mkdir -p "$root/docs/screens"
shot desk "Hermes · Desk" 1344
shot session-pane "Hermes · Session" 380 "14px 16px 18px"
shot needs-pane "Hermes · Needs you" 380 "14px 16px 18px"
echo "screens → docs/screens/"
