import SwiftUI

/// The words on the deck screens. They're #/portal's (src/portal/Page.tsx), so a student
/// reads the same lines in the app and on the web; change both together.
enum Words {
    static let loading = "Loading the slides…"
    static let waiting = "Waiting for the slides to start."
    static let cantLoad = "Can't load the slides."
    static let offline = "No connection. Check your Wi-Fi or cell data."
    static let backToLive = "Back to live"
    static let live = "Live"
    /// The arrows' VoiceOver labels: #/portal's "← Back" and "Next →" buttons, without the arrows.
    static let back = "Back"
    static let next = "Next"

    /// `slide` is 1-based, as the room counts.
    static func professorOn(slide: Int) -> String { "The professor is on slide \(slide) now." }
    static func slideOf(_ slide: Int, count: Int) -> String { "Slide \(slide) of \(count)" }

    static func line(for problem: Problem) -> String {
        switch problem {
        case .cantLoad: return cantLoad
        case .offline: return offline
        }
    }
}

/// Which slide is on screen while the deck moves. Same rules as #/portal: the phone follows
/// the deck until the student pages back, and follows again once the professor lands on (or
/// goes back past) the slide the student is reading. A struct, so tests can drive it.
struct Follow: Equatable {
    /// The slide index on screen.
    private(set) var selection = 0
    /// True while the student is on the live slide; the screen then moves with the deck.
    private(set) var following = true
    /// The live slide index when the student left it. The notice shows once the deck moves past it.
    private(set) var liveWhenLeft: Int?

    /// The student swiped or tapped to `index`.
    mutating func open(_ index: Int, live: Int) {
        guard index != selection else { return }
        selection = index
        if index == live {
            following = true
            liveWhenLeft = nil
        } else {
            if following { liveWhenLeft = live }
            following = false
        }
    }

    /// The deck moved to `live`, or the slides the phone can open changed (`pages`, by index).
    /// Follow when the student is following, when the professor lands on the student's slide
    /// (ios-1: without this the phone stayed behind on the professor's next move), or when the
    /// student's slide is gone because the deck went back before it.
    mutating func deckMoved(live: Int, pages: [Int]) {
        if following || live == selection || !pages.contains(selection) { goToLive(live) }
    }

    mutating func goToLive(_ live: Int) {
        following = true
        liveWhenLeft = nil
        selection = live
    }

    /// Debug only (-startOnSlide): open on `index` as if the student had swiped back to it.
    mutating func startBrowsing(at index: Int, live: Int) {
        selection = index
        following = false
        liveWhenLeft = live
    }

    /// True once the deck has moved on from the slide it was on when the student left.
    func showNotice(live: Int?) -> Bool {
        guard let live, !following, let left = liveWhenLeft else { return false }
        return live != left
    }

    /// The line over the buttons while the student reads an earlier slide and the deck has
    /// moved on, or nil. DeckView shows exactly this text.
    func notice(live: Int?) -> String? {
        guard let live, showNotice(live: live) else { return nil }
        return Words.professorOn(slide: live + 1)
    }

    /// What VoiceOver reads after the deck moved and the screen was on slide index `before`:
    /// "Slide N of M" when the screen moved with the deck, as #/portal's count does with
    /// aria-live="polite" (sweep2-ios-7). nil when the screen stayed: the student is reading an
    /// earlier slide, and the notice is read out instead.
    func announcement(from before: Int, count: Int) -> String? {
        selection == before ? nil : Words.slideOf(selection + 1, count: count)
    }
}

/// What the deck screen shows, picked from the store. DeckView switches on it, so ScreenTests
/// checks the screen's choice and its words.
struct DeckScreen: Equatable {
    enum Main: Equatable {
        /// The spinner and "Loading the slides…".
        case loading
        /// Words in the middle of the screen, and no slide.
        case message(String)
        /// The slides, on the live one or one the student paged back to.
        case deck(LiveSlide)
    }

    /// The bar over the slides once they have loaded and then stopped coming in.
    let bar: Problem?
    let main: Main

    init(bar: Problem?, main: Main) {
        self.bar = bar
        self.main = main
    }

    init(live: LiveSlide?, load: LoadState) {
        bar = load.loaded ? load.problem : nil
        if let live {
            main = .deck(live)
        } else if load.loaded {
            main = .message(Words.waiting)
        } else if let problem = load.problem {
            // ios-5: before the first answer, failures say so in words instead of a bare spinner.
            main = .message(Words.line(for: problem))
        } else {
            main = .loading
        }
    }

    /// True when the slides are on screen.
    var showsDeck: Bool {
        if case .deck = main { return true }
        return false
    }
}

struct DeckView: View {
    let store: DeckStore
    /// Has VoiceOver read a line out: the slide count when the screen moves with the deck, and
    /// the notice when the deck moves on without it. AnnounceTests passes its own to hear them.
    var announce: @MainActor (String) -> Void = DeckView.readOut

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.verticalSizeClass) private var verticalSize

    @State private var follow = Follow()
    @State private var pendingStart: Int?
    /// True while the deck screen is under `shortHeight` tall (see `largestType`).
    @State private var short = false

    static func readOut(_ line: String) {
        AccessibilityNotification.Announcement(line).post()
    }

    /// The largest text size for everything on the deck screen but the slide: the bar, the slide
    /// count, the notice, Back to live and the arrows. At AX5 they took all but 57 of iPhone 17's
    /// 402 pt in landscape and 110 of 874 in portrait, with a late card (sweep2-ios-2). With the
    /// connection bar up as well, a cap of AX2 still left the slide 280 of 874 pt in portrait at
    /// AX3 to AX5 (sweep2-ios-fixcheck-1), so portrait stops at AX1 and the late card at AX2
    /// (LateBannerView.largestType). With these caps, and the bar in the header row in landscape,
    /// the slide keeps at least a third of the height at every size in the worst case: 366 of 874
    /// and 148 of 402 at AX5 (LayoutTests). The slide itself keeps every size, and VoiceOver reads
    /// the full words either way.
    /// On a 375 pt wide phone the same words wrap onto more lines, and portrait's caps left an
    /// iPhone SE's slide 160 of 667 pt at AX2 to AX5 (T18). So a `short` screen, under
    /// `shortHeight`, takes landscape's caps in portrait too: this stops at xxxLarge and the late
    /// card at AX1 (`largestLateType`). The SE's slide then keeps 276 of 667 pt at AX1 to AX5
    /// (LayoutTests), and an iPhone 13 mini's 357 of 812 (it had 241).
    static func largestType(verticalSize: UserInterfaceSizeClass?, short: Bool = false) -> DynamicTypeSize {
        verticalSize == .compact || short ? .xxxLarge : .accessibility1
    }

    /// The largest text size for the late card: AX1 on a short screen, as in landscape; otherwise
    /// only the card's own cap (LateBannerView.largestType).
    static func largestLateType(short: Bool) -> DynamicTypeSize {
        short ? .accessibility1 : .accessibility5
    }

    /// The deck screen's height inside the safe area under which it is short: an iPhone SE has
    /// 647 pt in portrait and an iPhone 13 mini 728; an iPhone 16e has 763 and an iPhone 17 778.
    nonisolated static let shortHeight: CGFloat = 740

    private var largest: DynamicTypeSize { DeckView.largestType(verticalSize: verticalSize, short: short) }
    /// An iPhone in landscape: about 360 pt of height for everything.
    private var compact: Bool { verticalSize == .compact }

    var body: some View {
        let screen = DeckScreen(live: store.live, load: store.load)
        VStack(spacing: 0) {
            // In landscape the deck screen shows the bar in its header row instead: a full-width
            // bar there took 43 pt and left the slide 112 of 402 pt (sweep2-ios-fixcheck-1).
            if let problem = screen.bar, !(compact && screen.showsDeck) {
                NoticeBar(problem: problem)
                    .dynamicTypeSize(...largest)
            }
            switch screen.main {
            case .deck(let live):
                deck(live: live, bar: compact ? screen.bar : nil)
            case .message(let text):
                CenterMessage(text: text)
            case .loading:
                Spacer()
                VStack(spacing: 16) {
                    ProgressView()
                    Text(Words.loading)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .padding(24)
                Spacer()
            }
        }
        .background(Palette.bg.color) // #/portal's page color, not the system's white or black
        // The late banner takes its own room under the buttons, so it never covers the slide
        // count, the Live badge, the bar or the slide (sweep1-ios-1). #/portal does the same.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LateBannerView(banner: store.late)
                .dynamicTypeSize(...DeckView.largestLateType(short: short))
        }
        // Arrows and anything else that takes the tint: the web's green, never system blue.
        .tint(Palette.accent.color)
        .onAppear { pendingStart = store.config.startOnSlide }
        .onChange(of: store.live?.slide.index, initial: true) { oldLive, newLive in
            guard let newLive else { return }
            if applyPendingStart() { return }
            // The first slide that comes in isn't read out, as a page's first render isn't.
            followDeck(live: newLive, pages: store.pages.map(\.index), aloud: oldLive != nil && oldLive != newLive)
        }
        .onChange(of: store.pages.map(\.index)) { _, pages in
            if applyPendingStart() { return }
            guard let live = store.live?.slide.index else { return }
            followDeck(live: live, pages: pages, aloud: true)
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: showNotice)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: store.load.problem)
        // The whole screen's height, the late banner's room included, so the caps don't change
        // when a card comes or goes.
        .onGeometryChange(for: Bool.self) { $0.size.height < DeckView.shortHeight } action: { short = $0 }
    }

    private var notice: String? { follow.notice(live: store.live?.slide.index) }
    private var showNotice: Bool { notice != nil }

    /// `bar`: the connection problem to show in the header row (landscape only), or nil.
    @ViewBuilder
    private func deck(live: LiveSlide, bar: Problem?) -> some View {
        let pages = store.pages
        let onLive = follow.selection == live.slide.index
        let position = pages.firstIndex(where: { $0.index == follow.selection })

        HStack(spacing: 12) {
            Text(Words.slideOf(follow.selection + 1, count: DeckView.count(live)))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .fixedSize()
            Spacer(minLength: 0)
            if let bar {
                NoticeBar(problem: bar, inRow: true)
            }
            if onLive {
                LiveBadge()
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .dynamicTypeSize(...largest)

        TabView(selection: Binding(
            get: { follow.selection },
            set: { index in
                // The deck went back before the slide on screen, so that page is gone and the
                // TabView picked a neighbour on its own. That's no swipe: followDeck moves to the
                // live slide and reads it out. Taken as a swipe, VoiceOver said nothing (AnnounceTests).
                guard store.pages.contains(where: { $0.index == follow.selection }) else { return }
                if let liveIndex = store.live?.slide.index { follow.open(index, live: liveIndex) }
            }
        )) {
            ForEach(pages) { slide in
                SlidePage(slide: slide)
                    .tag(slide.index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))

        VStack(spacing: 0) {
            if let notice {
                Text(notice)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                    .accessibilityAddTraits(.updatesFrequently)
            }
            HStack(spacing: 12) {
                Button {
                    if let position, position > 0 { go(to: pages[position - 1].index) }
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(Words.back)
                .disabled(position == nil || position == 0)

                Spacer()
                if !onLive {
                    // Outlined while the professor is still on the slide the student left, the
                    // main green button once the professor moves on, as on #/portal.
                    Button(Words.backToLive) { goToLive() }
                        .buttonStyle(PortalButtonStyle(filled: showNotice))
                }
                Spacer()

                Button {
                    if let position, position + 1 < pages.count { go(to: pages[position + 1].index) }
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(Words.next)
                .disabled(onLive)
            }
            .font(.title3.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        // The notice and Back to live wrap instead of cutting off at the large text sizes, up to
        // `largest`; the slide above takes what height is left (it scrolls).
        .dynamicTypeSize(...largest)
        .fixedSize(horizontal: false, vertical: true)
        .background(.bar)
        .onChange(of: showNotice) { _, shown in
            if shown, let notice { announce(notice) }
        }
    }

    /// The slide count the header shows: the deck's count, or more if the deck is past it.
    static func count(_ live: LiveSlide) -> Int { max(live.count, live.slide.index + 1) }

    /// The deck moved to `live` or its shown slides changed: follow it by Follow's rules, and
    /// when the screen moved with it and `aloud`, VoiceOver reads the new "Slide N of M".
    private func followDeck(live: Int, pages: [Int], aloud: Bool) {
        let before = follow.selection
        var after = follow
        after.deckMoved(live: live, pages: pages)
        move { $0.deckMoved(live: live, pages: pages) }
        guard aloud, let current = store.live,
              let line = after.announcement(from: before, count: DeckView.count(current)) else { return }
        announce(line)
    }

    /// Changes `follow` with the page-turn animation, or with none when Reduce Motion is on.
    private func move(_ change: (inout Follow) -> Void) {
        if reduceMotion {
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) { change(&follow) }
        } else {
            withAnimation(.easeInOut(duration: 0.25)) { change(&follow) }
        }
    }

    private func go(to index: Int) {
        guard let liveIndex = store.live?.slide.index else { return }
        move { $0.open(index, live: liveIndex) }
    }

    private func goToLive() {
        guard let liveIndex = store.live?.slide.index else { return }
        move { $0.goToLive(liveIndex) }
    }

    /// Debug only (-startOnSlide N): open on slide N once it has been shown, as if the student
    /// had swiped back to it.
    private func applyPendingStart() -> Bool {
        guard let n = pendingStart, let live = store.live else { return false }
        let target = n - 1
        guard target < live.slide.index, store.pages.contains(where: { $0.index == target }) else {
            if target >= live.slide.index { pendingStart = nil }
            return false
        }
        pendingStart = nil
        follow.startBrowsing(at: target, live: live.slide.index)
        return true
    }
}

struct SlidePage: View {
    let slide: Slide

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let heading = slide.heading {
                    Text(heading)
                        .font(.largeTitle.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                }
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(slide.lines.enumerated()), id: \.offset) { _, line in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text("•").foregroundStyle(.secondary).accessibilityHidden(true)
                            Text(line).fixedSize(horizontal: false, vertical: true)
                        }
                        .font(.title3)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
    }
}

struct LiveBadge: View {
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(Palette.accentText.color).frame(width: 7, height: 7)
            Text(Words.live)
        }
        .font(.subheadline.weight(.bold))
        .foregroundStyle(Palette.accentText.color)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(Palette.accent.color))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Words.live)
    }
}

/// The bar over the last slide while the slides aren't coming in. `inRow`: a one-line tag in
/// the deck's header row, next to the slide count, which the deck screen uses in landscape.
struct NoticeBar: View {
    let problem: Problem
    var inRow = false

    var body: some View {
        let label = Label(Words.line(for: problem), systemImage: problem == .offline ? "wifi.slash" : "exclamationmark.triangle")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.warnText.color)
        if inRow {
            label
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.vertical, 4)
                .padding(.horizontal, 10)
                .background(Capsule().fill(Palette.warn.color))
                // A tinted fill that marks a state gets a --line-strong edge (docs/design.md).
                .overlay(Capsule().strokeBorder(Palette.lineStrong.color, lineWidth: 1))
        } else {
            label
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .padding(.horizontal, 16)
                .background(Palette.warn.color)
                .overlay(alignment: .bottom) { Palette.lineStrong.color.frame(height: 1) }
        }
    }
}

struct CenterMessage: View {
    let text: String

    var body: some View {
        Spacer()
        Text(text)
            .font(.title2.weight(.semibold))
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
            .padding(24)
        Spacer()
    }
}
