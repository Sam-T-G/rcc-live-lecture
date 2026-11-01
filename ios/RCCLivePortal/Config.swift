import Foundation

/// Where the app reads slides from. Launch arguments win over environment variables,
/// which win over the defaults (prod, channel "gdg", the same as the web).
///
///   -convexURL https://<dev deployment>.convex.cloud   or  CONVEX_URL=...
///   -channel gdg                                       or  DECK_CHANNEL=...
///   -startOnSlide 2   (Debug builds only: open on slide 2, 1-based, to test browsing)
struct Config {
    static let prodURL = "https://utmost-ibis-818.convex.cloud"
    static let defaultChannel = "gdg"

    #if DEBUG
    static let debugBuild = true
    #else
    static let debugBuild = false
    #endif

    let deploymentURL: String
    let channel: String
    let startOnSlide: Int?

    /// `allowsHTTP`: whether a plain-http backend URL is taken; only in Debug builds.
    static func load(
        defaults: UserDefaults = .standard,
        env: [String: String] = ProcessInfo.processInfo.environment,
        allowsHTTP: Bool = Config.debugBuild
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
        let url = pick("convexURL", "CONVEX_URL").flatMap { accepts($0, allowsHTTP: allowsHTTP) ? $0 : nil }
        return Config(
            deploymentURL: url ?? prodURL,
            channel: pick("channel", "DECK_CHANNEL") ?? defaultChannel,
            startOnSlide: start
        )
    }

    /// Whether the app may read slides from `url`: https, or http when `allowsHTTP` (Debug builds,
    /// for a backend on this Mac). App Transport Security doesn't cover ConvexMobile's websocket,
    /// so ATS never stops a plain-http backend, even in a Release build with no ATS exception;
    /// this check does (sweep2-ios-3). A URL it refuses falls back to prod.
    static func accepts(_ url: String, allowsHTTP: Bool) -> Bool {
        guard let parsed = URL(string: url), let host = parsed.host, !host.isEmpty,
              let scheme = parsed.scheme?.lowercased() else { return false }
        return scheme == "https" || (allowsHTTP && scheme == "http")
    }
}
