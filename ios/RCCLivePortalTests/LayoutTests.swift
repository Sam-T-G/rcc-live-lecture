// How tall the slide is on the real DeckView at every text size (sweep2-ios-2). The worst case:
// the connection bar is up ("No connection. Check your Wi-Fi or cell data."), the student reads
// an earlier slide after the deck moved on, so the notice and Back to live show, and a late card
// shows under them (the longest of the five lines, with a 9-letter name). At AX5 the header, the
// notice and Back to live used to grow with no cap and left the slide 57 of 402 pt in landscape
// and 110 of 874 in portrait, less than the slide's heading; with the bar up as well, the capped
// screen still left 112 of 402 in landscape and 280 of 874 in portrait (sweep2-ios-fixcheck-1).
// At iPhone SE's size, portrait's caps left the slide 24% of the height at AX2 to AX5 (T18).
// The tests host DeckView in a window at iPhone 17's size and at iPhone SE's, and measure the
// pager (the TabView's paging scroll view).
import Combine
import ConvexMobile
import SwiftUI
import Testing
import UIKit
@testable import RCCLivePortal

/// The three feeds and the connection state, sent by hand. AnnounceTests uses it too.
final class FixedSource: DeckSource {
    let cur = CurrentValueSubject<DeckStore.CurrentAnswer, ClientError>(nil)
    let sl = CurrentValueSubject<[Slide], ClientError>([])
    let lt = CurrentValueSubject<[LateArrival], ClientError>([])
    let ws = PassthroughSubject<WebSocketState, Never>()
    func current(channel: String) -> AnyPublisher<DeckStore.CurrentAnswer, ClientError> { cur.eraseToAnyPublisher() }
    func slides(channel: String) -> AnyPublisher<[Slide], ClientError> { sl.eraseToAnyPublisher() }
    func lateFeed(channel: String) -> AnyPublisher<[LateArrival], ClientError> { lt.eraseToAnyPublisher() }
    func connection() -> AnyPublisher<WebSocketState, Never> { ws.eraseToAnyPublisher() }

    /// The deck is on slide index `live` of 10, with every slide up to it shown.
    func deck(on live: Int) {
        sl.send((0...live).map(testSlide))
        cur.send(LiveSlide(slide: testSlide(live), count: 10))
    }
}

func testSlide(_ i: Int) -> Slide {
    Slide(index: i, beat: 0, title: "Recursion \(i + 1)", lines: ["A function that calls itself", "Base case stops it"], at: 1)
}

private func allViews(_ v: UIView) -> [UIView] { [v] + v.subviews.flatMap(allViews) }

/// A phone the layout tests host DeckView on: its screen in portrait, in points, and its safe
/// area in each orientation.
struct Phone: CustomStringConvertible {
    let description: String
    let portrait: CGSize
    let portraitInsets: EdgeInsets
    let landscapeInsets: EdgeInsets

    /// iPhone 17, 402 x 874 pt: the Dynamic Island and the home bar.
    static let iPhone17 = Phone(
        description: "iPhone 17", portrait: CGSize(width: 402, height: 874),
        portraitInsets: EdgeInsets(top: 62, leading: 0, bottom: 34, trailing: 0),
        landscapeInsets: EdgeInsets(top: 0, leading: 62, bottom: 21, trailing: 62))
    /// iPhone SE (2nd and 3rd generation), 375 x 667 pt: a 20 pt status bar in portrait, no home
    /// bar, and no status bar in landscape.
    static let iPhoneSE = Phone(
        description: "iPhone SE", portrait: CGSize(width: 375, height: 667),
        portraitInsets: EdgeInsets(top: 20, leading: 0, bottom: 0, trailing: 0),
        landscapeInsets: EdgeInsets())

    func size(landscape: Bool) -> CGSize {
        landscape ? CGSize(width: portrait.height, height: portrait.width) : portrait
    }

    func insets(landscape: Bool) -> EdgeInsets { landscape ? landscapeInsets : portraitInsets }
}

/// One DeckView in its own window at a phone's size (iPhone 17's unless `phone` says), portrait
/// or landscape.
@MainActor
struct Hosted {
    let src = FixedSource()
    let store: DeckStore
    let window: UIWindow
    let landscape: Bool
    let phone: Phone

    /// `startOnSlide` 3: the phone opens on slide 3 as if the student paged back (-startOnSlide).
    init(type: DynamicTypeSize = .large, landscape: Bool = false, phone: Phone = .iPhone17, startOnSlide: Int? = 3,
         announce: @escaping @MainActor (String) -> Void = DeckView.readOut) throws {
        self.landscape = landscape
        self.phone = phone
        store = DeckStore(config: Config(deploymentURL: "http://127.0.0.1:9", channel: "gdg", startOnSlide: startOnSlide), source: src)
        let size = phone.size(landscape: landscape)
        let insets = phone.insets(landscape: landscape)
        let root = DeckView(store: store, announce: announce)
            .environment(\.verticalSizeClass, landscape ? .compact : .regular)
            .dynamicTypeSize(type)
            .padding(insets)
            .frame(width: size.width, height: size.height)
            .ignoresSafeArea()
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = UIHostingController(rootView: root)
        window.isHidden = false
    }

    var height: CGFloat { phone.size(landscape: landscape).height }

    func pager() throws -> CGFloat {
        window.layoutIfNeeded()
        let pagers = allViews(window).compactMap { $0 as? UIScrollView }.filter { $0.isPagingEnabled }
        try #require(pagers.count == 1)
        return pagers[0].convert(pagers[0].bounds, to: window).height
    }
}

/// The pager's height on `phone`, portrait and landscape, with the connection bar, the notice,
/// Back to live and one late card on screen. Both windows run at once, so the 4-second offline
/// wait is paid once per text size.
@MainActor
private func pagerHeights(type: DynamicTypeSize, phone: Phone = .iPhone17) async throws -> [(landscape: Bool, height: CGFloat, pager: CGFloat)] {
    let screens = try [Hosted(type: type, landscape: false, phone: phone), Hosted(type: type, landscape: true, phone: phone)]
    defer { for s in screens { s.window.isHidden = true } }
    try await Task.sleep(for: .milliseconds(300))
    for s in screens { s.src.deck(on: 5) }
    try await Task.sleep(for: .milliseconds(400))
    // The deck moves on: the notice and the filled Back to live show.
    for s in screens { s.src.deck(on: 6) }
    try await Task.sleep(for: .milliseconds(400))
    // The connection drops: after 4 seconds the bar says so (DeckStore.startOfflineTimer).
    for s in screens { s.src.ws.send(.connecting) }
    try await Task.sleep(for: .milliseconds(4300))
    // LateBanner's first answer only marks what's there as seen; the second shows the card:
    // the longest of the five lines, with a 9-letter name and 2-digit minutes.
    let longest = try #require(LateLines.lines.indices.max {
        LateLines.lines[$0]("Alexandra", 12).count < LateLines.lines[$1]("Alexandra", 12).count
    })
    let id = try #require((0..<1000).lazy.map { "late-\($0)" }.first { LateLines.pick($0) == longest })
    for s in screens { s.src.lt.send([]) }
    try await Task.sleep(for: .milliseconds(100))
    for s in screens {
        s.src.lt.send([LateArrival(id: id, first: "Alexandra", lateMin: 12, at: LateCutoff.phoneClock())])
    }
    try await Task.sleep(for: .milliseconds(700))
    return try screens.map { s in
        #expect(s.store.load.problem == .offline)
        #expect(s.store.late.showing.count == 1)
        return (s.landscape, s.height, try s.pager())
    }
}

@Suite("Deck screen layout", .serialized)
@MainActor
struct LayoutTests {
    @Test(
        "sweep2-ios-2 the slide keeps at least a third of the screen's height at every text size, with the connection bar, the notice, Back to live and a late card",
        arguments: [
            DynamicTypeSize.large, .xLarge, .xxLarge, .xxxLarge,
            .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5,
        ]
    )
    func slideKeepsAThird(type: DynamicTypeSize) async throws {
        for (landscape, height, pager) in try await pagerHeights(type: type) {
            #expect(pager >= height / 3, "\(type) \(landscape ? "landscape" : "portrait"): the slide is \(Int(pager)) of \(Int(height)) pt")
        }
    }

    @Test(
        "T18 at iPhone SE size (375 x 667 pt) the slide keeps at least a third of the screen's height too, at every text size, in the same worst case",
        arguments: [
            DynamicTypeSize.large, .xLarge, .xxLarge, .xxxLarge,
            .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5,
        ]
    )
    func slideKeepsAThirdOnSE(type: DynamicTypeSize) async throws {
        for (landscape, height, pager) in try await pagerHeights(type: type, phone: .iPhoneSE) {
            #expect(pager >= height / 3, "iPhone SE \(type) \(landscape ? "landscape" : "portrait"): the slide is \(Int(pager)) of \(Int(height)) pt")
        }
    }
}
