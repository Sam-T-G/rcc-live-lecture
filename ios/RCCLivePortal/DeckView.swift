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
}

struct DeckView: View {
    let store: DeckStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var follow = Follow()
    @State private var pendingStart: Int?

    var body: some View {
        VStack(spacing: 0) {
            if store.load.loaded, let problem = store.load.problem {
                NoticeBar(problem: problem)
            }
            if let live = store.live {
                deck(live: live)
            } else if store.load.loaded {
                CenterMessage(text: Words.waiting)
            } else if let problem = store.load.problem {
                CenterMessage(text: Words.line(for: problem))
            } else {
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
        .background(Color(.systemBackground))
        .overlay(alignment: .top) { LateBannerView(banner: store.late) }
        .onAppear { pendingStart = store.config.startOnSlide }
        .onChange(of: store.live?.slide.index, initial: true) { _, newLive in
            guard let newLive else { return }
            if applyPendingStart() { return }
            move { $0.deckMoved(live: newLive, pages: store.pages.map(\.index)) }
        }
        .onChange(of: store.pages.map(\.index)) { _, pages in
            if applyPendingStart() { return }
            guard let live = store.live?.slide.index else { return }
            move { $0.deckMoved(live: live, pages: pages) }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: showNotice)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: store.load.problem)
    }

    private var showNotice: Bool { follow.showNotice(live: store.live?.slide.index) }

    @ViewBuilder
    private func deck(live: LiveSlide) -> some View {
        let pages = store.pages
        let onLive = follow.selection == live.slide.index
        let position = pages.firstIndex(where: { $0.index == follow.selection })

        HStack {
            Text(Words.slideOf(follow.selection + 1, count: max(live.count, live.slide.index + 1)))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                .monospacedDigit()
            Spacer()
            if onLive {
                LiveBadge()
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)

        TabView(selection: Binding(
            get: { follow.selection },
            set: { index in
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
            if showNotice {
                Text(Words.professorOn(slide: live.slide.index + 1))
                    .font(.subheadline.weight(.semibold))
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
                .accessibilityLabel("Previous slide")
                .disabled(position == nil || position == 0)

                Spacer()
                if !onLive {
                    Button(Words.backToLive) { goToLive() }
                        .buttonStyle(.borderedProminent)
                        .tint(showNotice ? .red : .accentColor)
                }
                Spacer()

                Button {
                    if let position, position + 1 < pages.count { go(to: pages[position + 1].index) }
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Next slide")
                .disabled(onLive)
            }
            .font(.title3.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(.bar)
        .onChange(of: showNotice) { _, shown in
            if shown {
                AccessibilityNotification.Announcement(Words.professorOn(slide: live.slide.index + 1)).post()
            }
        }
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
            Circle().fill(.white).frame(width: 7, height: 7)
            Text(Words.live)
        }
        .font(.subheadline.weight(.bold))
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.red))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Words.live)
    }
}

/// The bar over the last slide while the slides aren't coming in.
struct NoticeBar: View {
    let problem: Problem

    var body: some View {
        Label(Words.line(for: problem), systemImage: problem == .offline ? "wifi.slash" : "exclamationmark.triangle")
            .font(.subheadline.weight(.semibold))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
            .background(Color.orange.opacity(0.25))
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
