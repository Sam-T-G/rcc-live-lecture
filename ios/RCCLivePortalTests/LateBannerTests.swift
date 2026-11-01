import Foundation
import Testing
@testable import RCCLivePortal

private let ana = LateArrival(id: "k57d3n8y1b2c4f6g7h9j0m1p2q3r4s5t", first: "Ana", lateMin: 3, at: 1_000)
private let ben = LateArrival(id: "jd7a2k9x0r8b3m4n5p6q7r8s9t0u1v2w", first: "Ben", lateMin: 12, at: 2_000)
private let cy = LateArrival(id: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", first: "Cy", lateMin: 15, at: 3_000)

/// WCAG 2 contrast ratio of two sRGB colors written as 0xRRGGBB.
private func contrast(_ a: UInt32, _ b: UInt32) -> Double {
    func channel(_ v: UInt32) -> Double {
        let c = Double(v) / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    func luminance(_ hex: UInt32) -> Double {
        0.2126 * channel((hex >> 16) & 0xFF) + 0.7152 * channel((hex >> 8) & 0xFF) + 0.0722 * channel(hex & 0xFF)
    }
    let (x, y) = (luminance(a), luminance(b))
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)
}

/// A phone clock a test sets by hand, in ms since 1970.
@MainActor
private final class TestClock {
    var ms: Double
    init(_ ms: Double) { self.ms = ms }
}

private let minute = 60_000.0
private let t2130 = 1_793_914_200_000.0  // 2026-11-05 21:30 UTC, as in late.opened.test.ts
private func arrival(_ name: String, _ at: Double) -> LateArrival {
    LateArrival(id: name, first: name, lateMin: 10, at: at)
}

@Suite("Late banner")
@MainActor
struct LateBannerTests {
    // Existing tests below pass `now: { 0 }`: the phone's clock reads 0 ms, before every arrival
    // in them, so only the newest-seen rule decides what shows.

    @Test("CKP-fixcheck-2 an arrival from before launch that comes into the feed later doesn't show (she unticks the opt-out); a new one does")
    func beforeLaunchUntick() {
        // Xena is scanned 10 min late at 21:40 with the opt-out ticked. Yuri launches the app at 21:42: the feed is empty.
        let clock = TestClock(t2130 + 12 * minute)
        let banner = LateBanner(hold: .seconds(60), now: { clock.ms })
        banner.take([])
        // At 21:48 Xena unticks it, so the feed has her row again.
        clock.ms = t2130 + 18 * minute
        banner.take([arrival("Xena", t2130 + 10 * minute)])
        #expect(banner.showing.isEmpty)
        // Zed walks in late at 21:50: he shows, once.
        clock.ms = t2130 + 20 * minute + 500
        let zed = arrival("Zed", t2130 + 20 * minute)
        banner.take([zed, arrival("Xena", t2130 + 10 * minute)])
        #expect(banner.showing.map(\.first) == ["Zed"])
        banner.take([zed, arrival("Xena", t2130 + 10 * minute)])
        #expect(banner.showing.map(\.first) == ["Zed"])
    }

    @Test("CKP-fixcheck-1 an arrival scanned 30 s before launch that comes into the feed 20 s after doesn't show")
    func justBeforeLaunch() {
        let clock = TestClock(t2130)
        let banner = LateBanner(hold: .seconds(60), now: { clock.ms })
        banner.take([])
        clock.ms = t2130 + 20_000
        banner.take([arrival("Xena", t2130 - 30_000)])
        #expect(banner.showing.isEmpty)
    }

    @Test("CKP-risk-3 only arrivals scanned in the last minute are new: an unticked opt-out 8 min after the scan doesn't show")
    func olderThanAMinute() {
        // The app launches at 21:25. Xena is scanned at 21:31 with the opt-out ticked and unticks it at 21:39.
        let clock = TestClock(t2130 - 5 * minute)
        let banner = LateBanner(hold: .seconds(60), now: { clock.ms })
        banner.take([])
        clock.ms = t2130 + 9 * minute
        banner.take([arrival("Xena", t2130 + minute)])
        #expect(banner.showing.isEmpty)
        // An arrival exactly a minute old still shows; one a millisecond older doesn't.
        clock.ms = t2130 + 10 * minute
        banner.take([arrival("Dee", t2130 + 9 * minute), arrival("Xena", t2130 + minute)])
        #expect(banner.showing.map(\.first) == ["Dee"])
        clock.ms = t2130 + 11 * minute + 1
        banner.take([arrival("Eve", t2130 + 10 * minute), arrival("Dee", t2130 + 9 * minute)])
        #expect(banner.showing.map(\.first) == ["Dee"])
    }
    @Test("ios-9 arrivals in the feed at launch never show; a later arrival shows once")
    func newArrivalShowsOnce() {
        let banner = LateBanner(hold: .seconds(60), now: { 0 })
        banner.take([ana])  // the first answer after launch: Ana walked in before the app opened
        #expect(banner.showing.isEmpty)

        banner.take([ben, ana])  // Ben checks in late
        #expect(banner.showing.map(\.first) == ["Ben"])

        banner.take([ben, ana])  // the same answer again
        #expect(banner.showing.map(\.first) == ["Ben"])

        banner.take([cy, ben, ana])
        #expect(banner.showing.map(\.first) == ["Cy", "Ben"])
    }

    @Test("ios-9 a student who turns the banner off and on again doesn't show twice")
    func optOutAndBackOn() {
        let banner = LateBanner(hold: .seconds(60), now: { 0 })
        banner.take([])  // launch: nobody late yet
        banner.take([ben])  // Ben checks in late
        banner.take([])  // Ben turns the banner off, so lateFeed leaves him out
        banner.take([ben])  // and back on: he's in the feed again with his old time
        #expect(banner.showing.map(\.first) == ["Ben"])
    }

    @Test("ios-9 an older arrival that comes back into the 5-row feed doesn't show")
    func olderArrivalBackInFeed() {
        let rows = (0..<6).map { LateArrival(id: "id\($0)", first: "S\($0)", lateMin: $0 + 1, at: Double(1_000 + $0)) }
        let banner = LateBanner(hold: .seconds(60), now: { 0 })
        banner.take(Array(rows[1...5].reversed()))  // launch: the newest 5, so S0 is out of the feed
        banner.take(Array(rows[0...4].reversed()))  // S5 turns the banner off and S0 moves back in
        #expect(banner.showing.isEmpty)
    }

    @Test("ios-9 two arrivals in the same millisecond both show, as on the web")
    func sameMillisecond() {
        let first = LateArrival(id: "id1", first: "Ana", lateMin: 5, at: 5_000)
        let second = LateArrival(id: "id2", first: "Ben", lateMin: 5, at: 5_000)
        let banner = LateBanner(hold: .seconds(60), now: { 0 })
        banner.take([])
        banner.take([first])
        banner.take([second, first])  // Ben's scan landed in the same millisecond as Ana's
        #expect(banner.showing.map(\.first) == ["Ben", "Ana"])
    }

    @Test("ios-9 a name leaves the screen after the hold, 8 seconds in the app")
    func leavesAfterTheHold() async throws {
        #expect(LateBanner.defaultHold == .seconds(8))
        let banner = LateBanner(hold: .milliseconds(100), now: { 0 })
        banner.take([])
        banner.take([ben])
        #expect(banner.showing.count == 1)
        try await Task.sleep(for: .milliseconds(600))
        #expect(banner.showing.isEmpty)
    }

    @Test("ios-9 a student gets the same line as on the web")
    func sameLineAsTheWeb() {
        // Picks from line() in src/teams/checkin/LateBanner.tsx, run in Node on 2026-10-31.
        let web: [(String, Int)] = [
            ("", 0), ("a", 2), ("k57d3n8y1b2c4f6g7h9j0m1p2q3r4s5t", 2),
            ("jd7a2k9x0r8b3m4n5p6q7r8s9t0u1v2w", 1), ("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", 3),
            ("n2", 0), ("t7", 1), ("r5", 2), ("m1", 3), ("s6", 4), ("é😀x", 0),
        ]
        for (id, pick) in web {
            #expect(LateLines.pick(id) == pick, "id \(id)")
        }
        #expect(LateLines.line(for: ana) == "⏰ Ana is here. Class started 3 min ago.")
        #expect(LateLines.line(for: ben) == "🚨 Late alert: Ben, 12 min after start.")
        #expect(LateLines.line(for: cy) == "⏰ Cy walked in 15 min late.")
    }

    @Test("DESIGN AA: the banner's words are at least 4.5:1 on its fill, light and dark")
    func bannerContrast() {
        #expect(abs(contrast(0xFFFFFF, 0x000000) - 21) < 0.01)
        #expect(contrast(LateColors.wordsLight, LateColors.fillLight) >= 4.5)
        #expect(contrast(LateColors.wordsDark, LateColors.fillDark) >= 4.5)
    }
}
