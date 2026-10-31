#!/bin/bash
# Builds RCCLivePortalTests and runs them inside the app on a simulator, without
# `xcodebuild test`. On Xcode 27 beta, `xcodebuild test` waits about 12 minutes and fails with
# "The test runner hung before establishing connection." (its DTServiceHub never starts, so the
# suspended app is never resumed). This script injects XCTest into the app the way an .xctestrun
# does and starts it with `simctl launch`, so it works with or without that bug.
#
# The app gets -convexURL http://127.0.0.1:9, a closed port, so a test run reaches no backend
# even if the no-backend guard in RCCLivePortalApp.swift breaks.
#
# Usage, from anywhere:
#   ios/scripts/test.sh                  # simulator "iPhone 17"
#   SIM='iPhone 17 Pro' ios/scripts/test.sh
#   SIM=<udid> ios/scripts/test.sh       # a simulator you made for this
# Exits 0 only when the log says every test passed. The log is in ios/build/test.log.
set -euo pipefail

IOS="$(cd "$(dirname "$0")/.." && pwd)"
SIM="${SIM:-iPhone 17}"
DD="$IOS/build/DD"
LOG="$IOS/build/test.log"
BUILD_LOG="$IOS/build/build-for-testing.log"
mkdir -p "$IOS/build"

# A name or a udid; take the first available simulator that matches.
UDID="$(xcrun simctl list devices available | awk -v want="$SIM" '
  { line = $0; sub(/^ +/, "", line) }
  match(line, / \([0-9A-F-]{36}\)/) {
    name = substr(line, 1, RSTART - 1); id = substr(line, RSTART + 2, 36)
    if (name == want || id == want) { print id; exit }
  }')"
if [ -z "$UDID" ]; then
  echo "No available simulator named or with udid '$SIM'. Pick one from: xcrun simctl list devices available" >&2
  exit 2
fi

cd "$IOS"
xcodegen generate --quiet
echo "Building for testing on $SIM ($UDID); log: $BUILD_LOG"
if ! xcodebuild build-for-testing -project RCCLivePortal.xcodeproj -scheme RCCLivePortal \
    -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$DD" > "$BUILD_LOG" 2>&1; then
  tail -30 "$BUILD_LOG" >&2
  echo "build-for-testing failed; full log: $BUILD_LOG" >&2
  exit 1
fi

xcrun simctl bootstatus "$UDID" -b > /dev/null
PRODUCTS="$DD/Build/Products/Debug-iphonesimulator"
xcrun simctl install "$UDID" "$PRODUCTS/RCCLivePortal.app"

PLAT="$(xcode-select -p)/Platforms/iPhoneSimulator.platform/Developer"
export SIMCTL_CHILD_DYLD_INSERT_LIBRARIES="$PLAT/usr/lib/libXCTestBundleInject.dylib"
export SIMCTL_CHILD_DYLD_FRAMEWORK_PATH="$PRODUCTS:$PLAT/Library/Frameworks"
export SIMCTL_CHILD_DYLD_LIBRARY_PATH="$PRODUCTS:$PLAT/usr/lib"
export SIMCTL_CHILD_XCTestBundlePath="$PRODUCTS/RCCLivePortal.app/PlugIns/RCCLivePortalTests.xctest"
export SIMCTL_CHILD_XCInjectBundleInto=unused

# perl's alarm stops the run after 180 s if XCTest waits for an IDE that never connects.
set +e
perl -e 'alarm 180; exec @ARGV' xcrun simctl launch --console --terminate-running-process \
  "$UDID" com.samtg.rccliveportal -convexURL http://127.0.0.1:9 > "$LOG" 2>&1
set -e

grep -E '^(✘|✔ Test run|✘ Test run)' "$LOG" || true
if grep -q '^✔ Test run with .* passed' "$LOG" && ! grep -q '^✘' "$LOG"; then
  exit 0
fi
echo "Tests failed or didn't finish; full log: $LOG" >&2
exit 1
