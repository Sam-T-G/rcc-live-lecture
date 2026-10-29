import Foundation

/// Where the app reads slides from. Launch arguments win over environment variables,
/// which win over the defaults (prod, channel "gdg").
///
///   -convexURL http://127.0.0.1:3210     or  CONVEX_URL=...
///   -channel portal-ios-test             or  DECK_CHANNEL=...
///   -startOnSlide 2   (Debug builds only: open on slide 2, 1-based, to test browsing)
struct Config {
    static let prodURL = "https://utmost-ibis-818.convex.cloud"
    static let defaultChannel = "gdg"

    let deploymentURL: String
    let channel: String
    let startOnSlide: Int?

    static func load(
        defaults: UserDefaults = .standard,
        env: [String: String] = ProcessInfo.processInfo.environment
    ) -> Config {
        func pick(_ argKey: String, _ envKey: String) -> String? {
            let raw = defaults.string(forKey: argKey) ?? env[envKey]
            guard let value = raw?.trimmingCharacters(in: .whitespaces), !value.isEmpty else { return nil }
            return value
        }
        var start: Int? = nil
        #if DEBUG
        if let s = pick("startOnSlide", "START_ON_SLIDE"), let n = Int(s), n >= 1 { start = n }
        #endif
        return Config(
            deploymentURL: pick("convexURL", "CONVEX_URL") ?? prodURL,
            channel: pick("channel", "DECK_CHANNEL") ?? defaultChannel,
            startOnSlide: start
        )
    }
}
