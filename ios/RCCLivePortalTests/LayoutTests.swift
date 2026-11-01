// How tall the slide is on the real DeckView at every text size (sweep2-ios-2). The worst case:
// the student reads an earlier slide after the deck moved on, so the notice and Back to live
// show, and a late card shows under them. At AX5 the header, the notice and Back to live used
// to grow with no cap and left the slide 57 of 402 pt in landscape and 110 of 874 in portrait,
// less than the slide's heading. The test hosts DeckView in a window at iPhone 17's size and
// measures the pager (the TabView's paging scroll view).
import Combine
import ConvexMobile
import SwiftUI
import Testing
import UIKit
@testable import RCCLivePortal

private final class FixedSource: DeckSource {
    let cur = CurrentValueSubject<DeckStore.CurrentAnswer, ClientError>(nil)
    let sl = CurrentValueSubject<[Slide], ClientError>([])
    let lt = CurrentValueSubject<[LateArrival], ClientError>([])
    func current(channel: String) -> AnyPublisher<DeckStore.CurrentAnswer, ClientError> { cur.eraseToAnyPublisher() }
    func slides(channel: String) -> AnyPublisher<[Slide], ClientError> { sl.eraseToAnyPublisher() }
    func lateFeed(channel: String) -> AnyPublisher<[LateArrival], ClientError> { lt.eraseToAnyPublisher() }
    func connection() -> AnyPublisher<WebSocketState, Never> { PassthroughSubject().eraseToAnyPublisher() }
}

private func slide(_ i: Int) -> Slide {
    Slide(index: i, beat: 0, title: "Recursion \(i + 1)", lines: ["A function that calls itself", "Base case stops it"], at: 1)
}

private func all(_ v: UIView) -> [UIView] { [v] + v.subviews.flatMap(all) }

/// The pager's height on an iPhone 17 (402 x 874 pt) with the notice, Back to live and one late
/// card on screen.
@MainActor
private func pagerHeight(type: DynamicTypeSize, landscape: Bool) async throws -> CGFloat {
    let src = FixedSource()
    // -startOnSlide 3: the phone opens on slide 3 as if the student paged back.
    let store = DeckStore(config: Config(deploymentURL: "http://127.0.0.1:9", channel: "gdg", startOnSlide: 3), source: src)
    let size = landscape ? CGSize(width: 874, height: 402) : CGSize(width: 402, height: 874)
    // iPhone 17's safe area: the Dynamic Island and the home bar.
    let insets = landscape
        ? EdgeInsets(top: 0, leading: 62, bottom: 21, trailing: 62)
        : EdgeInsets(top: 62, leading: 0, bottom: 34, trailing: 0)
    let root = DeckView(store: store)
        .environment(\.verticalSizeClass, landscape ? .compact : .regular)
        .dynamicTypeSize(type)
        .padding(insets)
        .frame(width: size.width, height: size.height)
        .ignoresSafeArea()
    let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
    let window = UIWindow(windowScene: scene)
    window.frame = CGRect(origin: .zero, size: size)
    window.rootViewController = UIHostingController(rootView: root)
    window.isHidden = false
    defer { window.isHidden = true }
    try await Task.sleep(for: .milliseconds(300))
    src.sl.send((0...5).map(slide))
    src.cur.send(LiveSlide(slide: slide(5), count: 10))
    try await Task.sleep(for: .milliseconds(400))
    // The deck moves on: the notice and the filled Back to live show.
    src.sl.send((0...6).map(slide))
    src.cur.send(LiveSlide(slide: slide(6), count: 10))
    try await Task.sleep(for: .milliseconds(400))
    // LateBanner's first answer only marks what's there as seen; the second shows the card.
    src.lt.send([])
    try await Task.sleep(for: .milliseconds(100))
    src.lt.send([LateArrival(id: "k57d3n8y1b2c4f6g7h9j0m1p2q3r4s5t", first: "Ana", lateMin: 3, at: LateCutoff.phoneClock())])
    try await Task.sleep(for: .milliseconds(700))
    window.layoutIfNeeded()
    #expect(store.late.showing.count == 1)
    let pagers = all(window).compactMap { $0 as? UIScrollView }.filter { $0.isPagingEnabled }
    try #require(pagers.count == 1)
    return pagers[0].convert(pagers[0].bounds, to: window).height
}

@Suite("Deck screen layout", .serialized)
@MainActor
struct LayoutTests {
    @Test(
        "sweep2-ios-2 the slide keeps at least a third of the screen's height at every text size, with the notice, Back to live and a late card",
        arguments: [DynamicTypeSize.large, .xxxLarge, .accessibility1, .accessibility3, .accessibility5]
    )
    func slideKeepsAThird(type: DynamicTypeSize) async throws {
        for landscape in [false, true] {
            let height: CGFloat = landscape ? 402 : 874
            let pager = try await pagerHeight(type: type, landscape: landscape)
            #expect(pager >= height / 3,"\(type) \(landscape ? "landscape" : "portrait"): the slide is \(Int(pager)) of \(Int(height)) pt")
        }
    }
}
