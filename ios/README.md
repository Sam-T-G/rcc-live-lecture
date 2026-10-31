# RCC Live (iOS)

Students see the slide the professor is on, live, and can swipe back through slides already shown. When someone checks in late, a banner with their first name shows for 8 seconds, with the same line the web shows. The app reads three public queries, `deck:current`, `deck:slides` and `checkin/attendance:lateFeed`, and never writes to Convex.

The app has no sign-in and no check-in pass. Students check in, answer quizzes and ask questions on the web, at #/checkin/student and #/live on the live site.

It uses [ConvexMobile](https://github.com/get-convex/convex-swift) 0.8.2, pinned in `project.yml`.

## Build and test

You need Xcode, xcodegen (`brew install xcodegen`) and a Mac with Apple Silicon. ConvexMobile's simulator library has arm64 code only, so `project.yml` sets `EXCLUDED_ARCHS[sdk=iphonesimulator*]: x86_64`. Without that line, a build for "Any iOS Simulator Device" (`generic/platform=iOS Simulator`) fails to link x86_64, and an Intel Mac can't build for the simulator at all.

```sh
ios/scripts/test.sh                      # from the repo root; runs on the simulator "iPhone 17"
SIM='iPhone 17 Pro' ios/scripts/test.sh  # another simulator, by name or udid
```

`scripts/test.sh` runs `xcodegen generate` (it makes RCCLivePortal.xcodeproj from project.yml; git ignores it, build/ and DerivedData/), builds for testing into `ios/build/DD`, installs the app on the simulator and starts it there with the tests loaded and `-convexURL http://127.0.0.1:9`, a closed port. It prints any failed test and the summary line, exits 0 only when every test passed, and keeps the log in `ios/build/test.log`. If your Xcode has no iPhone 17, use a name from `xcrun simctl list devices available`.

Use the script on Xcode 27 beta. There, `xcodebuild test` waits about 12 minutes and then fails with "The test runner hung before establishing connection." after repeated "DTServiceHubClient failed to bless service hub" lines, because the app it starts is never resumed. On a release Xcode without that bug, this works too:

```sh
cd ios && xcodegen generate
xcodebuild test -project RCCLivePortal.xcodeproj -scheme RCCLivePortal \
  -destination 'platform=iOS Simulator,name=iPhone 17'
```

RCCLivePortalTests checks the follow rule, which screen and words the app picks, number decoding, the retry wait, the late banner and its words. The tests run inside the app, which makes no DeckStore and opens no connection while they run (a test fails if it does), so they need no backend. `npm test` and CI don't build Swift, so run them before you push a change to `ios/` or to what `deck:current`, `deck:slides` or `lateFeed` return.

## Run against your dev backend

`<dev deployment>` below is your dev deployment's name, the one `npx convex dev` prints.

```sh
xcrun simctl boot 'iPhone 17'
xcodebuild -project RCCLivePortal.xcodeproj -scheme RCCLivePortal \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build/DD build
xcrun simctl install 'iPhone 17' build/DD/Build/Products/Debug-iphonesimulator/RCCLivePortal.app
xcrun simctl launch 'iPhone 17' com.samtg.rccliveportal -convexURL https://<dev deployment>.convex.cloud
```

In Xcode, the scheme has the same argument: Product > Scheme > Edit Scheme > Run > Arguments, put your deployment's name in `-convexURL https://<dev deployment>.convex.cloud` and tick it.

Move the deck from the repo root. `npx convex run` writes to the same dev deployment:

```sh
npx convex run deck:set '{"channel":"gdg","index":1,"beat":0,"count":6,"title":"Slide 2","lines":["A line"]}'
```

A late check-in on the same deployment and channel shows the banner in the app.

- `-channel <name>` reads another channel. The default is `gdg`, the same as the web.
- `-startOnSlide 2` (Debug builds only) opens the app on slide 2 as if the student had swiped back, so you can check "The professor is on slide N now." without swiping.
- Environment variables work too: `CONVEX_URL`, `DECK_CHANNEL`, `START_ON_SLIDE`.

## Prod

With no arguments the app reads `https://utmost-ibis-818.convex.cloud` on channel `gdg`, the same backend and channel as the live site.

Debug builds allow plain `http` to addresses on this Mac (`NSAllowsLocalNetworking` in `RCCLivePortal/ATS-Debug.plist`), for a backend at http://127.0.0.1:3210. Release builds have no exception.

## Real iPhones

Only the simulator is set up. A real iPhone or TestFlight needs a signing team (`DEVELOPMENT_TEAM` in `project.yml`) and an app icon, and the project has neither yet.
