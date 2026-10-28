#!/usr/bin/env bash
# Deploy from main: Convex functions to prod, then the app built against prod to GitHub Pages.
# Usage: scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { echo "deploy.sh: deploy from main (on $branch)" >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "deploy.sh: commit your changes first" >&2; exit 1; }

# Pushes convex/ to prod and runs the build with VITE_CONVEX_URL set to prod's URL.
npx convex deploy -y --cmd "npm run build" --cmd-url-env-var-name VITE_CONVEX_URL

# Publish dist/ as the gh-pages branch, replacing what was there.
tmp="$(mktemp -d)"
cp -R dist/. "$tmp/"
touch "$tmp/.nojekyll"
remote="$(git remote get-url origin)"
(
  cd "$tmp"
  git init -q -b gh-pages
  git add -A
  git commit -q -m "Deploy $(git -C "$OLDPWD" rev-parse --short HEAD)"
  git push -q -f "$remote" gh-pages
)
rm -rf "$tmp"
echo "Live: https://sam-t-g.github.io/rcc-live-lecture/ (Pages can take a minute)"
