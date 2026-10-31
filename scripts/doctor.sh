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
# ADMIN_EMAILS makes you an admin on your backend (the professor pages and #/admin). HOST_EMAILS
# opens nothing any more, so it isn't checked.
grep -qx ADMIN_EMAILS <<<"$vars" && ok "env ADMIN_EMAILS is set" || fail "env ADMIN_EMAILS is missing" "Run: npx convex env set ADMIN_EMAILS <your Gmail>   (without it nobody can open the professor pages or #/admin)"
grep -qx DECK_BRIDGE_KEY <<<"$vars" && ok "env DECK_BRIDGE_KEY is set" || fail "env DECK_BRIDGE_KEY is missing" "Run: npx convex env set DECK_BRIDGE_KEY <value>   (Sam gives you the value)"
grep -qx GEMINI_API_KEY <<<"$vars" && ok "env GEMINI_API_KEY is set" || warn "env GEMINI_API_KEY is missing" "Only needed if your team adds an AI feature."

echo "Build"
if npm run build >/tmp/rcc-live-build.log 2>&1; then ok "npm run build passes"; else fail "npm run build fails" "See /tmp/rcc-live-build.log"; fi

echo "Repo"
git remote get-url origin >/dev/null 2>&1 && git ls-remote --exit-code origin HEAD >/dev/null 2>&1 && ok "can reach GitHub" || fail "can't reach the repo on GitHub" "Ask Sam to add you as a collaborator, then sign in with: gh auth login"

echo
if [ "$bad" = 0 ]; then
  echo "Ready. Last check by hand: npm run dev, open http://localhost:5173/#/lab, and sign in with the test form (Google refuses localhost for now; the test form needs your backend's host in DEV_HOSTS in convex/auth.config.ts and convex/checkin/prof.ts)."
else
  echo "Fix the FIX lines above, then run scripts/doctor.sh again."
fi
exit "$bad"
