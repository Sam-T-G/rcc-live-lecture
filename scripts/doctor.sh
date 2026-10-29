#!/usr/bin/env bash
# Is this laptop ready to lead a team? Run from the repo: scripts/doctor.sh
# Checks the tools, your own Convex dev backend and its env vars, and that the app builds.
# Prints only names and yes/no, never secret values.
set -uo pipefail
cd "$(dirname "$0")/.."
bad=0
ok()   { printf '  ok    %s\n' "$1"; }
fail() { printf '  FIX   %s\n        %s\n' "$1" "$2"; bad=1; }
warn() { printf '  note  %s\n        %s\n' "$1" "$2"; }

echo "Tools"
major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$major" -ge 20 ] && ok "Node $(node -v)" || fail "Node 20 or newer" "Install it from nodejs.org, then run this again."
[ -d node_modules ] && ok "npm install done" || fail "npm install" "Run: npm install"
command -v claude >/dev/null && ok "Claude Code installed" || warn "Claude Code not found on PATH" "Install it, or run the agent another way you know works."

echo "Your Convex dev backend"
if [ -f .env.local ] && grep -q '^CONVEX_DEPLOYMENT=dev:' .env.local; then
  dep="$(grep '^CONVEX_DEPLOYMENT=' .env.local | sed 's/^CONVEX_DEPLOYMENT=dev://; s/ .*//')"
  ok "dev deployment: $dep   (tell Sam this name, for the slide feed)"
else
  fail "no dev deployment yet" "Run: npx convex dev   (log in, pick the existing project rcc-live-lecture), leave it running."
fi
vars="$(npx convex env list 2>/dev/null | sed 's/=.*//')"
for v in HOST_EMAILS DECK_BRIDGE_KEY; do
  grep -qx "$v" <<<"$vars" && ok "env $v is set" || fail "env $v is missing" "Run: npx convex env set $v <value>   (Sam gives you the values; HOST_EMAILS is your own Gmail)"
done
grep -qx GEMINI_API_KEY <<<"$vars" && ok "env GEMINI_API_KEY is set" || warn "env GEMINI_API_KEY is missing" "Only needed if your team adds an AI feature."

echo "Build"
if npm run build >/tmp/rcc-live-build.log 2>&1; then ok "npm run build passes"; else fail "npm run build fails" "See /tmp/rcc-live-build.log"; fi

echo "Repo"
git remote get-url origin >/dev/null 2>&1 && git ls-remote --exit-code origin HEAD >/dev/null 2>&1 && ok "can reach GitHub" || fail "can't reach the repo on GitHub" "Ask Sam to add you as a collaborator, then sign in with: gh auth login"

echo
if [ "$bad" = 0 ]; then
  echo "Ready. Last check by hand: npm run dev, open http://localhost:5173/#/lab, sign in with Google."
else
  echo "Fix the FIX lines above, then run scripts/doctor.sh again."
fi
exit "$bad"
