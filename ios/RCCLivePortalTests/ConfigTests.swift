import Foundation
import Testing
@testable import RCCLivePortal

@Suite("Which backend the app reads")
struct ConfigTests {
    @Test("sweep2-ios-3 a Release build takes only https backends; Debug also takes http, for a backend on this Mac")
    func httpsOnlyInRelease() {
        #expect(Config.accepts("https://utmost-ibis-818.convex.cloud", allowsHTTP: false))
        #expect(Config.accepts("HTTPS://quaint-swan-637.convex.cloud", allowsHTTP: false))
        // localtest.me resolves to 127.0.0.1; ATS's local-networking exception doesn't cover it,
        // and a Release build still read slides from it over plain http.
        #expect(!Config.accepts("http://localtest.me:3292", allowsHTTP: false))
        #expect(!Config.accepts("http://127.0.0.1:3210", allowsHTTP: false))
        #expect(Config.accepts("http://127.0.0.1:3210", allowsHTTP: true))
        #expect(!Config.accepts("ws://127.0.0.1:3210", allowsHTTP: true))
        #expect(!Config.accepts("https://", allowsHTTP: true))
        #expect(!Config.accepts("utmost-ibis-818.convex.cloud", allowsHTTP: true))
    }

    @Test("sweep2-ios-3 load drops an http backend when http isn't allowed and reads prod instead")
    func loadFallsBackToProd() throws {
        // ios/scripts/test.sh launches the app with -convexURL http://127.0.0.1:9, which wins over
        // these; either way the URL is plain http.
        let suite = "ConfigTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("http://localtest.me:3292", forKey: "convexURL")
        let env = ["CONVEX_URL": "http://localtest.me:3292"]

        #expect(Config.load(defaults: defaults, env: env, allowsHTTP: false).deploymentURL == Config.prodURL)
        #expect(Config.load(defaults: defaults, env: env, allowsHTTP: true).deploymentURL.hasPrefix("http://"))
        #expect(Config.debugBuild)  // the tests run in a Debug build
    }
}
