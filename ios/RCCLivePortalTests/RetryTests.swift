import Testing
@testable import RCCLivePortal

/// Counts how often a feed was subscribed again.
@MainActor
private final class Runs {
    var count: [Feed: Int] = [:]
    func add(_ feed: Feed) { count[feed, default: 0] += 1 }
}

@Suite("Trying a failed feed again")
@MainActor
struct RetryTests {
    @Test("F36 deck:current, deck:slides and lateFeed all wait 3 seconds before trying again")
    func sameWaitForEveryFeed() {
        #expect(Resubscriber.defaultDelay == .seconds(3))
    }

    @Test("F36 a failed feed tries again as soon as the connection comes back, once")
    func tryAgainOnConnect() {
        let runs = Runs()
        let retries = Resubscriber(delay: .seconds(60))
        retries.later(.slides) { runs.add(.slides) }
        retries.later(.lateFeed) { runs.add(.lateFeed) }
        #expect(retries.waiting == [.slides, .lateFeed])
        #expect(runs.count.isEmpty)

        retries.connected()  // Wi-Fi joins at 4 s: both feeds subscribe again now, not at 60 s
        #expect(runs.count == [.slides: 1, .lateFeed: 1])
        #expect(retries.waiting.isEmpty)

        retries.connected()  // a second connect with nothing waiting runs nothing
        #expect(runs.count == [.slides: 1, .lateFeed: 1])
    }

    @Test("F36 without a reconnect, a failed feed tries again after the wait, once")
    func tryAgainAfterTheWait() async throws {
        let runs = Runs()
        let retries = Resubscriber(delay: .milliseconds(50))
        retries.later(.current) { runs.add(.current) }
        retries.later(.current) { runs.add(.current) }  // a second failure replaces the first wait
        try await Task.sleep(for: .milliseconds(400))
        #expect(runs.count == [.current: 1])
        retries.connected()
        #expect(runs.count == [.current: 1])
    }
}
