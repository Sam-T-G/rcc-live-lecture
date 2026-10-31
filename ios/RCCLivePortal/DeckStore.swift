import Combine
import ConvexMobile
import Foundation
import Observation

/// Convex sends numbers as Float64, which can arrive as "3.0", so the app decodes a Double and
/// converts it. A value no Int can hold, such as 1e300, throws a DecodingError, which ends the
/// subscription and gets retried, instead of crashing the app the way Int(Double) does (ios-4).
/// deck:set refuses such numbers now, but a row written before that check, or a backend that
/// doesn't have it yet, can still send one.
func wholeNumber<Key: CodingKey>(_ c: KeyedDecodingContainer<Key>, _ key: Key) throws -> Int {
    let d = try c.decode(Double.self, forKey: key)
    guard let n = Int(exactly: d.rounded()) else {
        throw DecodingError.dataCorruptedError(
            forKey: key, in: c, debugDescription: "\(d) is not a number the app can show")
    }
    return n
}

/// One slide as the phone shows it: a heading and its visible lines.
struct Slide: Decodable, Equatable, Identifiable {
    let index: Int  // 0-based
    let beat: Int
    let title: String
    let lines: [String]
    let at: Double

    var id: Int { index }

    /// The title to show, or nil when the slide has none. #/portal skips its heading then too.
    var heading: String? {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : title
    }

    init(index: Int, beat: Int, title: String, lines: [String], at: Double) {
        self.index = index
        self.beat = beat
        self.title = title
        self.lines = lines
        self.at = at
    }

    private enum CodingKeys: String, CodingKey { case index, beat, title, lines, at }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        index = try wholeNumber(c, .index)
        beat = try wholeNumber(c, .beat)
        title = try c.decode(String.self, forKey: .title)
        lines = try c.decode([String].self, forKey: .lines)
        at = try c.decode(Double.self, forKey: .at)
    }
}

/// `deck:current`: the slide the deck is on right now.
struct LiveSlide: Decodable, Equatable {
    let slide: Slide
    let count: Int

    private enum CodingKeys: String, CodingKey { case count }

    init(from decoder: Decoder) throws {
        slide = try Slide(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        count = try wholeNumber(c, .count)
    }
}

/// Why the slides aren't coming in, when they aren't.
enum Problem: Equatable {
    /// `deck:current` failed twice in a row: a server error or an answer the app can't read.
    case cantLoad
    /// No connection for 4 seconds.
    case offline
}

/// What the app knows about `deck:current` apart from the slide itself.
struct LoadState: Equatable {
    /// True once `deck:current` has answered at least once.
    private(set) var loaded = false
    /// `deck:current` failures since its last answer. Each failure is retried after 3 seconds.
    private(set) var failuresInARow = 0
    /// True once the connection has been down for 4 seconds.
    var offline = false

    mutating func answered() {
        loaded = true
        failuresInARow = 0
        offline = false
    }

    mutating func failed() { failuresInARow += 1 }

    /// After 2 failures in a row the screen says the slides can't load, where it used to spin
    /// forever with no words (ios-5).
    var problem: Problem? {
        if failuresInARow >= 2 { return .cantLoad }
        if offline { return .offline }
        return nil
    }
}

/// Reads the deck from Convex. Read only: this app never calls a mutation, so nothing a
/// student does on their phone reaches the professor's deck.
@MainActor
@Observable
final class DeckStore {
    /// nil when the channel has no slide yet, and before the first answer.
    private(set) var live: LiveSlide?
    private(set) var shown: [Slide] = []
    private(set) var load = LoadState()
    /// The late check-in banner, read from the same channel.
    let late = LateBanner()

    let config: Config
    @ObservationIgnored private let client: ConvexClient
    @ObservationIgnored private var bag = Set<AnyCancellable>()
    @ObservationIgnored private var currentSub: AnyCancellable?
    @ObservationIgnored private var slidesSub: AnyCancellable?
    @ObservationIgnored private var offlineTimer: Task<Void, Never>?

    init(config: Config) {
        self.config = config
        self.client = ConvexClient(deploymentUrl: config.deploymentURL)
        subscribeCurrent()
        subscribeSlides()
        watchConnection()
        late.start(client: client, channel: config.channel)
    }

    /// Pages a student can swipe through: every slide shown so far up to the live one, with
    /// the live slide as the room sees it now. Never past the live slide.
    var pages: [Slide] {
        guard let live else { return [] }
        var byIndex: [Int: Slide] = [:]
        for s in shown where s.index < live.slide.index { byIndex[s.index] = s }
        byIndex[live.slide.index] = live.slide
        return byIndex.values.sorted { $0.index < $1.index }
    }

    private func subscribeCurrent() {
        currentSub = client
            .subscribe(to: "deck:current", with: ["channel": config.channel], yielding: LiveSlide?.self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] _ in
                    // A server error, or an answer the app can't decode, ends the subscription.
                    // Count it and try again shortly.
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        self.load.failed()
                        self.retry(after: 3) { $0.subscribeCurrent() }
                    }
                },
                receiveValue: { [weak self] value in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        self.live = value
                        // An answer from the server means the connection works, even if the
                        // socket state was reported before we started listening.
                        self.load.answered()
                        self.offlineTimer?.cancel()
                        self.offlineTimer = nil
                    }
                })
    }

    private func subscribeSlides() {
        slidesSub = client
            .subscribe(to: "deck:slides", with: ["channel": config.channel], yielding: [Slide].self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] _ in
                    // The live slide still shows without this list; paging back waits for the retry.
                    MainActor.assumeIsolated { self?.retry(after: 10) { $0.subscribeSlides() } }
                },
                receiveValue: { [weak self] value in
                    MainActor.assumeIsolated { self?.shown = value }
                })
    }

    private func retry(after seconds: Double, _ body: @escaping @MainActor (DeckStore) -> Void) {
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            if let self { body(self) }
        }
    }

    private func startOfflineTimer() {
        offlineTimer?.cancel()
        // Short reconnects are normal; only say so after 4 seconds without a connection.
        offlineTimer = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { self?.load.offline = true }
        }
    }

    private func watchConnection() {
        // The first connect attempt may never report a state, so start counting at launch.
        startOfflineTimer()
        client.watchWebSocketState()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    switch state {
                    case .connected:
                        self.offlineTimer?.cancel()
                        self.offlineTimer = nil
                        self.load.offline = false
                    case .connecting:
                        // Retries report "connecting" again every few seconds; keep the
                        // timer from the first one so the notice still shows.
                        if self.offlineTimer == nil { self.startOfflineTimer() }
                    }
                }
            }
            .store(in: &bag)
    }
}
