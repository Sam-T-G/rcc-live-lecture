# RCC Live (iOS)

Students see the slide the professor is on, live, and can swipe back through slides already shown. The app only reads `deck:current` and `deck:slides`; it never writes to Convex.

Uses [ConvexMobile](https://github.com/get-convex/convex-swift) 0.8.2 (pinned in `project.yml`).

## Open

```sh
cd ios
xcodegen generate          # makes RCCLivePortal.xcodeproj from project.yml (not committed)
open RCCLivePortal.xcodeproj
```

## Run on the simulator against the local backend

In Xcode: Product > Scheme > Edit Scheme > Run > Arguments, tick `-convexURL http://127.0.0.1:3210` and `-channel portal-ios-test`, then run on any iPhone simulator.

From the command line:

```sh
xcodebuild -project RCCLivePortal.xcodeproj -scheme RCCLivePortal \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build/DD build
xcrun simctl install booted build/DD/Build/Products/Debug-iphonesimulator/RCCLivePortal.app
xcrun simctl launch booted com.samtg.rccliveportal -convexURL http://127.0.0.1:3210 -channel portal-ios-test
```

Move the test deck from the repo root:

```sh
npx convex run deck:set '{"channel":"portal-ios-test","index":1,"beat":0,"count":6,"title":"Slide 2","lines":["A line"]}'
```

`-startOnSlide 2` (Debug builds only) opens the app on slide 2, as if the student swiped back, so you can test the "Class is on slide N now" notice without tapping.

Environment variables work too: `CONVEX_URL`, `DECK_CHANNEL`, `START_ON_SLIDE`.

## Prod

Untick the arguments. With none set, the app reads `https://utmost-ibis-818.convex.cloud` on channel `gdg`. Until `deck:slides` is deployed to prod, the app shows only the live slide (no paging back).

Debug builds allow plain `http` to local addresses (`NSAllowsLocalNetworking` in `RCCLivePortal/ATS-Debug.plist`); Release builds have no exception.
