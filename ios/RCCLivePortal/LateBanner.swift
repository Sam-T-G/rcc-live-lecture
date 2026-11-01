import Combine
import ConvexMobile
import Foundation
import Observation
import SwiftUI
import UIKit

// The late banner: when a student checks in late, every phone running the app shows their
// first name for 8 seconds, the same as the web's src/teams/checkin/LateBanner.tsx and late.ts.
// It reads `checkin/attendance:lateFeed`, a public query that sends first names only and leaves
// out students who turned the banner off.

/// One late arrival from lateFeed.
struct LateArrival: Decodable, Equatable, Identifiable {
    let id: String
    let first: String
    let lateMin: Int
    let at: Double

    init(id: String, first: String, lateMin: Int, at: Double) {
        self.id = id
        self.first = first
        self.lateMin = lateMin
        self.at = at
    }

    private enum CodingKeys: String, CodingKey { case id, first, lateMin, at }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        first = try c.decode(String.self, forKey: .first)
        lateMin = try wholeNumber(c, .lateMin)
        at = try c.decode(Double.self, forKey: .at)
    }
}

/// The banner's lines: the web's five (src/teams/checkin/late.ts), in the web's order, picked
/// the web's way, so a student gets the same line in the app, on #/portal and on the projector.
/// Change both files together.
enum LateLines {
    static let lines: [@Sendable (String, Int) -> String] = [
        { n, m in "🐢 \(n) just walked in, \(m) min late." },
        { n, m in "🚨 Late alert: \(n), \(m) min after start." },
        { n, m in "⏰ \(n) is here. Class started \(m) min ago." },
        { n, m in "⏰ \(n) walked in \(m) min late." },
        { n, m in "👀 Everyone say hi to \(n), \(m) min late." },
    ]

    /// The web's pick: a 32-bit hash of the arrival's id. JavaScript's `for (const c of id)`
    /// walks code points and `c.charCodeAt(0)` takes each one's first UTF-16 unit; so does this.
    static func pick(_ id: String) -> Int {
        var h: Int32 = 0
        for scalar in id.unicodeScalars {
            h = h &* 31 &+ Int32(String(scalar).utf16.first ?? 0)
        }
        return abs(Int(h)) % lines.count
    }

    static func line(for arrival: LateArrival) -> String {
        lines[pick(arrival.id)](arrival.first, arrival.lateMin)
    }
}

/// Picks the arrivals to show from each lateFeed answer, by the web's rule (newArrivals in
/// src/teams/checkin/late.ts). Change both together.
/// - The first answer after launch shows nothing and marks everything scanned before the phone's
///   clock then as seen, so an arrival from before launch never shows, even one the first answer
///   didn't hold (she had the opt-out ticked and unticks it later).
/// - After that, an arrival shows once: when it's newer than every one seen. lateFeed holds the
///   newest 5, so an older arrival comes back into it when someone ticks or unticks the opt-out;
///   comparing times keeps it from showing twice. Two scans can land in the same millisecond, so
///   the arrivals at exactly the newest time are kept too.
/// - An arrival scanned more than a minute before the phone's clock never shows: someone who had
///   the opt-out ticked and unticks it later.
/// The web judges times by the server's clock (checkin.attendance.clock); the app uses the
/// phone's, which iOS sets from the network unless someone turned that off.
struct LateCutoff {
    /// The web's RECENT_MS.
    static let recentMs: Double = 60_000
    /// The phone's clock in ms since 1970, the same scale as lateFeed's `at`.
    static func phoneClock() -> Double { Date().timeIntervalSince1970 * 1000 }

    private let now: () -> Double
    /// False until the first answer.
    private var started = false
    /// The newest arrival time seen, and the arrivals seen at exactly that time.
    private var at = -Double.infinity
    private var ids: Set<String> = []

    init(now: @escaping () -> Double = LateCutoff.phoneClock) {
        self.now = now
    }

    mutating func fresh(_ feed: [LateArrival]) -> [LateArrival] {
        let t = now()
        guard started else {
            started = true
            at = t
            ids = []
            see(feed)
            return []
        }
        let new = feed.filter {
            ($0.at > at || ($0.at == at && !ids.contains($0.id))) && $0.at >= t - Self.recentMs
        }
        see(new)
        return new
    }

    private mutating func see(_ rows: [LateArrival]) {
        for r in rows {
            if r.at > at {
                at = r.at
                ids = [r.id]
            } else if r.at == at {
                ids.insert(r.id)
            }
        }
    }
}

@MainActor
@Observable
final class LateBanner {
    nonisolated static let defaultHold: Duration = .seconds(8)

    /// The arrivals on screen now, newest first.
    private(set) var showing: [LateArrival] = []

    @ObservationIgnored private var cutoff: LateCutoff
    @ObservationIgnored private let hold: Duration
    @ObservationIgnored private var sub: AnyCancellable?

    /// `now`: the clock LateCutoff reads, the phone's unless a test passes its own.
    init(hold: Duration = LateBanner.defaultHold, now: @escaping () -> Double = LateCutoff.phoneClock) {
        self.hold = hold
        self.cutoff = LateCutoff(now: now)
    }

    /// Listens to lateFeed on the deck's channel (DeckSource.lateFeed). `ended` runs when the
    /// subscription ends; DeckStore subscribes again from there, with the same 3-second wait
    /// as the slides (Resubscriber).
    func start(feed: AnyPublisher<[LateArrival], ClientError>, ended: @escaping @MainActor () -> Void) {
        sub = feed
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in
                    MainActor.assumeIsolated { ended() }
                },
                receiveValue: { [weak self] feed in
                    MainActor.assumeIsolated { self?.take(feed) }
                })
    }

    /// One answer from lateFeed: each new arrival shows for 8 seconds, and VoiceOver reads
    /// the new lines out.
    func take(_ feed: [LateArrival]) {
        let fresh = cutoff.fresh(feed)
        guard !fresh.isEmpty else { return }
        showing.insert(contentsOf: fresh, at: 0)
        AccessibilityNotification.Announcement(fresh.map { LateLines.line(for: $0) }.joined(separator: " ")).post()
        let ids = Set(fresh.map(\.id))
        let hold = self.hold
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: hold)
            self?.showing.removeAll { ids.contains($0.id) }
        }
    }
}

/// The banner's colors, the web's .late__item (src/teams/checkin/checkin.css): the --error fill
/// with --surface words from src/styles/tokens.css, light and dark. RCCLivePortalTests checks
/// each pair is at least 4.5:1.
enum LateColors {
    static let fillLight: UInt32 = 0xC5150F
    static let wordsLight: UInt32 = 0xFFFFFF
    static let fillDark: UInt32 = 0xFFB3A8
    static let wordsDark: UInt32 = 0x1B211C

    static var fill: Color { dynamic(light: fillLight, dark: fillDark) }
    static var words: Color { dynamic(light: wordsLight, dark: wordsDark) }

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in rgb(traits.userInterfaceStyle == .dark ? dark : light) })
    }

    private static func rgb(_ hex: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1)
    }
}

/// The banner over every screen of the app: one card per new late arrival.
struct LateBannerView: View {
    let banner: LateBanner

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 8) {
            ForEach(banner.showing) { arrival in
                Text(LateLines.line(for: arrival))
                    .font(.title3.weight(.bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(LateColors.words)
                    .padding(.vertical, 14)
                    .padding(.horizontal, 18)
                    .frame(maxWidth: .infinity)
                    .background(LateColors.fill, in: RoundedRectangle(cornerRadius: 12))
                    .shadow(color: .black.opacity(0.25), radius: 12, y: 6)
                    .frame(maxWidth: 640)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        // Taps reach the screen under the banner.
        .allowsHitTesting(false)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: banner.showing)
    }
}
