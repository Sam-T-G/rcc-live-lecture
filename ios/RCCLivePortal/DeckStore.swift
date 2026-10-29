import Combine
import ConvexMobile
import Foundation
import Observation

/// One slide as the phone shows it: a heading and its visible lines.
struct Slide: Decodable, Equatable, Identifiable {
    let index: Int  // 0-based
    let beat: Int
    let title: String
    let lines: [String]
    let at: Double

    var id: Int { index }

    init(index: Int, beat: Int, title: String, lines: [String], at: Double) {
        self.index = index
        self.beat = beat
        self.title = title
        self.lines = lines
        self.at = at
    }

    private enum CodingKeys: String, CodingKey { case index, beat, title, lines, at }

    // Convex sends these as Float64, which can arrive as "3.0"; decode as Double and convert.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        index = Int(try c.decode(Double.self, forKey: .index))
        beat = Int(try c.decode(Double.self, forKey: .beat))
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
        count = Int(try c.decode(Double.self, forKey: .count))
    }
}

/// Reads the deck from Convex. Read only: this app never calls a mutation, so nothing a
/// student does on their phone reaches the professor's deck.
@MainActor
@Observable
final class DeckStore {
    /// nil until the first answer from `deck:current`.
    private(set) var loaded = false
    /// nil when the channel has no slide yet.
    private(set) var live: LiveSlide?
    private(set) var shown: [Slide] = []
    /// True once the connection has been down for a few seconds.
    private(set) var offline = false

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
                    // A server error ends the subscription; try again shortly.
                    MainActor.assumeIsolated { self?.retry(after: 3) { $0.subscribeCurrent() } }
                },
                receiveValue: { [weak self] value in
                    MainActor.assumeIsolated {
                        guard let self else { return }
                        self.live = value
                        self.loaded = true
                        // An answer from the server means the connection works, even if the
                        // socket state was reported before we started listening.
                        self.offlineTimer?.cancel()
                        self.offlineTimer = nil
                        self.offline = false
                    }
                })
    }

    private func subscribeSlides() {
        slidesSub = client
            .subscribe(to: "deck:slides", with: ["channel": config.channel], yielding: [Slide].self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] _ in
                    // If deck:slides isn't deployed yet, the app still shows the live slide.
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
            if !Task.isCancelled { self?.offline = true }
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
                        self.offline = false
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
