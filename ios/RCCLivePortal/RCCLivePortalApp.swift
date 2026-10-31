import SwiftUI

@main
struct RCCLivePortalApp: App {
    /// nil while RCCLivePortalTests run inside the app, so a test run never connects to a
    /// backend (with no launch arguments that would be prod).
    @State private var store: DeckStore? = Self.runningTests ? nil : DeckStore(config: .load())

    var body: some Scene {
        WindowGroup {
            if let store {
                DeckView(store: store)
            }
        }
    }

    /// True when a test bundle is loaded into the app: Xcode injects XCTest before the app
    /// starts, and sets XCTestConfigurationFilePath when it runs the tests itself.
    static var runningTests: Bool {
        NSClassFromString("XCTestCase") != nil
            || ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
}
