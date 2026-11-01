import Combine
import ConvexMobile
import Foundation
import Testing
@testable import RCCLivePortal

/// Counts how often a feed was subscribed again.
@MainActor
private final class Runs {
    var count: [Feed: Int] = [:]
    func add(_ feed: Feed) { count[feed, default: 0] += 1 }
}

/// A DeckSource with no backend. Each subscribe gets its own subject, so a test can end the
/// newest subscription of a feed, and `subscribed` counts the subscribes per feed.
private final class FakeSource: DeckSource {
    var subscribed: [Feed: Int] = [:]
    private(set) var currents: [PassthroughSubject<DeckStore.CurrentAnswer, ClientError>] = []
    private(set) var slideLists: [PassthroughSubject<[Slide], ClientError>] = []
    private(set) var lates: [PassthroughSubject<[LateArrival], ClientError>] = []
    let state = PassthroughSubject<WebSocketState, Never>()

    func current(channel: String) -> AnyPublisher<DeckStore.CurrentAnswer, ClientError> {
        subscribed[.current, default: 0] += 1
        currents.append(PassthroughSubject())
        return currents.last!.eraseToAnyPublisher()
    }

    func slides(channel: String) -> AnyPublisher<[Slide], ClientError> {
        subscribed[.slides, default: 0] += 1
        slideLists.append(PassthroughSubject())
        return slideLists.last!.eraseToAnyPublisher()
    }

    func lateFeed(channel: String) -> AnyPublisher<[LateArrival], ClientError> {
        subscribed[.lateFeed, default: 0] += 1
        lates.append(PassthroughSubject())
        return lates.last!.eraseToAnyPublisher()
    }

    func connection() -> AnyPublisher<WebSocketState, Never> { state.eraseToAnyPublisher() }

    /// Ends the newest subscription of `feed` the way ConvexMobile does on a server error.
    func fail(_ feed: Feed) {
        let error = ClientError.ServerError(msg: "test")
        switch feed {
        case .current: currents.last!.send(completion: .failure(error))
        case .slides: slideLists.last!.send(completion: .failure(error))
        case .lateFeed: lates.last!.send(completion: .failure(error))
        }
    }
}

/// A closed port, the same as ios/scripts/test.sh passes; FakeSource never uses it.
private let config = Config(deploymentURL: "http://127.0.0.1:9", channel: "gdg", startOnSlide: nil)

/// Waits up to 2 seconds for `done`. DeckStore takes each feed's events on the main queue,
/// which runs while this test sleeps.
@MainActor
private func waitFor(_ done: () -> Bool) async throws {
    for _ in 0..<200 where !done() {
        try await Task.sleep(for: .milliseconds(10))
    }
}

@Suite("Trying a failed feed again")
@MainActor
struct RetryTests {
    @Test("F36 deck:current, deck:slides and lateFeed all wait 3 seconds before trying again")
    func sameWaitForEveryFeed() async throws {
        #expect(Resubscriber.defaultDelay == .seconds(3))

        let fake = FakeSource()
        let store = DeckStore(config: config, source: fake)
        #expect(store.retries.delay == .seconds(3))
        #expect(fake.subscribed == [.current: 1, .slides: 1, .lateFeed: 1])

        // A 10-second wait of its own, outside the store's Resubscriber, fails here.
        fake.fail(.current)
        fake.fail(.slides)
        fake.fail(.lateFeed)
        try await waitFor { store.retries.waiting.count == 3 }
        #expect(store.retries.waiting == [.current, .slides, .lateFeed])
        #expect(store.load.failuresInARow == 1)
        #expect(fake.subscribed == [.current: 1, .slides: 1, .lateFeed: 1])

        fake.state.send(.connected)  // Wi-Fi joins: all three subscribe again now, not at 3 s
        try await waitFor { store.retries.waiting.isEmpty }
        #expect(store.retries.waiting.isEmpty)
        #expect(fake.subscribed == [.current: 2, .slides: 2, .lateFeed: 2])
    }

    @Test("F36 deck:slides and lateFeed subscribe again after the store's wait, with no reconnect")
    func storeRetriesAfterTheWait() async throws {
        let fake = FakeSource()
        let store = DeckStore(config: config, source: fake, retries: Resubscriber(delay: .milliseconds(50)))
        fake.fail(.slides)
        fake.fail(.lateFeed)
        try await waitFor { fake.subscribed[.slides] == 2 && fake.subscribed[.lateFeed] == 2 }
        #expect(fake.subscribed == [.current: 1, .slides: 2, .lateFeed: 2])
        #expect(store.retries.waiting.isEmpty)
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
