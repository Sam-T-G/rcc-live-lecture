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

    init(slide: Slide, count: Int) {
        self.slide = slide
        self.count = count
    }

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
    /// `deck:current` failures since its last answer. Each failure is retried after 3 seconds,
    /// or as soon as the connection comes back (Resubscriber).
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

/// The three subscriptions the app keeps open.
enum Feed: Hashable {
    case current, slides, lateFeed
}

/// Subscribes a failed feed again: after `delay`, or at once when the connection comes back,
/// whichever is first. A server error or an answer the app can't decode ends a ConvexMobile
/// subscription, and so does a connection that drops before the first answer (InternalError
/// "channel closed"). Every feed waits the same 3 seconds. deck:slides and lateFeed used to wait
/// 10 (F36), so a phone that opened while joining Wi-Fi couldn't page back, and lost late
/// arrivals, for 6 seconds after the live slide showed.
@MainActor
final class Resubscriber {
    nonisolated static let defaultDelay: Duration = .seconds(3)

    let delay: Duration
    private var pending: [Feed: (wait: Task<Void, Never>, run: @MainActor () -> Void)] = [:]

    init(delay: Duration = Resubscriber.defaultDelay) {
        self.delay = delay
    }

    /// The feeds waiting to subscribe again.
    var waiting: Set<Feed> { Set(pending.keys) }

    /// `feed` ended: run `run` after the delay, or sooner on a reconnect. A second call for the
    /// same feed replaces the first.
    func later(_ feed: Feed, _ run: @escaping @MainActor () -> Void) {
        pending[feed]?.wait.cancel()
        let delay = self.delay
        let wait = Task { @MainActor [weak self] in
            try? await Task.sleep(for: delay)
            if !Task.isCancelled { self?.fire(feed) }
        }
        pending[feed] = (wait, run)
    }

    /// The connection is back: every waiting feed subscribes again now.
    func connected() {
        for feed in Array(pending.keys) { fire(feed) }
    }

    private func fire(_ feed: Feed) {
        guard let p = pending.removeValue(forKey: feed) else { return }
        p.wait.cancel()
        p.run()
    }
}

/// Where DeckStore's three feeds and the connection state come from: a ConvexClient in the
/// app. RetryTests passes a fake, so it can end a feed and check that DeckStore sends it
/// through its Resubscriber, without opening a connection.
protocol DeckSource {
    func current(channel: String) -> AnyPublisher<DeckStore.CurrentAnswer, ClientError>
    func slides(channel: String) -> AnyPublisher<[Slide], ClientError>
    func lateFeed(channel: String) -> AnyPublisher<[LateArrival], ClientError>
    func connection() -> AnyPublisher<WebSocketState, Never>
}

extension ConvexClient: DeckSource {
    func current(channel: String) -> AnyPublisher<DeckStore.CurrentAnswer, ClientError> {
        subscribe(to: "deck:current", with: ["channel": channel], yielding: DeckStore.CurrentAnswer.self)
    }

    func slides(channel: String) -> AnyPublisher<[Slide], ClientError> {
        subscribe(to: "deck:slides", with: ["channel": channel], yielding: [Slide].self)
    }

    func lateFeed(channel: String) -> AnyPublisher<[LateArrival], ClientError> {
        subscribe(to: "checkin/attendance:lateFeed", with: ["channel": channel], yielding: [LateArrival].self)
    }

    func connection() -> AnyPublisher<WebSocketState, Never> { watchWebSocketState() }
}

/// Reads the deck from Convex. Read only: this app never calls a mutation, so nothing a
/// student does on their phone reaches the professor's deck.
@MainActor
@Observable
final class DeckStore {
    /// What `deck:current` answers: null before the first slide of a class and after End day.
    /// subscribeCurrent decodes with this type, and DecodingTests decodes "null" through it.
    typealias CurrentAnswer = LiveSlide?

    /// How many stores this process has made that connect to a backend (`init(config:)`).
    /// The app makes none while RCCLivePortalTests run (ScreenTests checks it), so a test run
    /// opens no connection. RetryTests' stores use a fake source and aren't counted.
    private(set) static var made = 0

    /// nil when the channel has no slide yet, and before the first answer.
    private(set) var live: LiveSlide?
    private(set) var shown: [Slide] = []
    private(set) var load = LoadState()
    /// The late check-in banner, read from the same channel.
    let late = LateBanner()

    let config: Config
    /// Every feed that ends waits here before it subscribes again (RetryTests reads it).
    @ObservationIgnored let retries: Resubscriber
    @ObservationIgnored private let source: DeckSource
    @ObservationIgnored private var bag = Set<AnyCancellable>()
    @ObservationIgnored private var currentSub: AnyCancellable?
    @ObservationIgnored private var slidesSub: AnyCancellable?
    @ObservationIgnored private var offlineTimer: Task<Void, Never>?

    /// The app's store: connects to `config.deploymentURL`.
    convenience init(config: Config) {
        DeckStore.made += 1
        self.init(config: config, source: ConvexClient(deploymentUrl: config.deploymentURL))
    }

    /// `retries` nil means the 3-second Resubscriber the app uses.
    init(config: Config, source: DeckSource, retries: Resubscriber? = nil) {
        self.config = config
        self.source = source
        self.retries = retries ?? Resubscriber()
        subscribeCurrent()
        subscribeSlides()
        subscribeLate()
        watchConnection()
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
        currentSub = source.current(channel: config.channel)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] _ in
                    // The subscription ended (see Resubscriber). Count it and subscribe again.
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        self.load.failed()
                        self.retries.later(.current) { [weak self] in self?.subscribeCurrent() }
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
        slidesSub = source.slides(channel: config.channel)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] _ in
                    // The live slide still shows without this list; paging back waits for it.
                    MainActor.assumeIsolated {
                        self?.retries.later(.slides) { [weak self] in self?.subscribeSlides() }
                    }
                },
                receiveValue: { [weak self] value in
                    MainActor.assumeIsolated { self?.shown = value }
                })
    }

    private func subscribeLate() {
        late.start(feed: source.lateFeed(channel: config.channel)) { [weak self] in
            self?.retries.later(.lateFeed) { [weak self] in self?.subscribeLate() }
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
        source.connection()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] state in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    switch state {
                    case .connected:
                        self.offlineTimer?.cancel()
                        self.offlineTimer = nil
                        self.load.offline = false
                        // A feed that failed while the phone was still joining Wi-Fi
                        // subscribes again now instead of after its wait.
                        self.retries.connected()
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
