import SwiftUI

struct DeckView: View {
    let store: DeckStore

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The slide index on screen.
    @State private var selection = 0
    /// True while the student is on the live slide; the screen then moves with the deck.
    @State private var following = true
    /// The live slide index when the student left it. The notice shows once the deck moves past it.
    @State private var liveWhenLeft: Int?
    @State private var pendingStart: Int?

    var body: some View {
        VStack(spacing: 0) {
            if store.offline && store.loaded {
                OfflineBar()
            }
            if let live = store.live {
                deck(live: live)
            } else if store.loaded {
                CenterMessage(text: "Waiting for the slides to start")
            } else if store.offline {
                CenterMessage(text: "Can't reach the class")
            } else {
                Spacer()
                ProgressView()
                Spacer()
            }
        }
        .background(Color(.systemBackground))
        .onAppear { pendingStart = store.config.startOnSlide }
        .onChange(of: store.live?.slide.index, initial: true) { _, newLive in
            guard newLive != nil else { return }
            if applyPendingStart() { return }
            if following || !store.pages.contains(where: { $0.index == selection }) {
                // Following, or the deck went back before the slide the student was on.
                goToLive()
            }
        }
        .onChange(of: store.pages.map(\.index)) { _, _ in
            _ = applyPendingStart()
        }
        .onChange(of: selection) { _, newValue in
            guard let liveIndex = store.live?.slide.index else { return }
            if newValue == liveIndex {
                following = true
                liveWhenLeft = nil
            } else {
                if following { liveWhenLeft = liveIndex }
                following = false
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: showNotice)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: store.offline)
    }

    private var showNotice: Bool {
        guard let live = store.live, !following, let left = liveWhenLeft else { return false }
        return live.slide.index != left
    }

    @ViewBuilder
    private func deck(live: LiveSlide) -> some View {
        let pages = store.pages
        let onLive = selection == live.slide.index
        let position = pages.firstIndex(where: { $0.index == selection })

        HStack {
            Text("Slide \(selection + 1) of \(max(live.count, live.slide.index + 1))")
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

        TabView(selection: $selection) {
            ForEach(pages) { slide in
                SlidePage(slide: slide)
                    .tag(slide.index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))

        VStack(spacing: 0) {
            if showNotice {
                Text("Class is on slide \(live.slide.index + 1) now")
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
                    Button("Back to live") { goToLive() }
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
                AccessibilityNotification.Announcement("Class is on slide \(live.slide.index + 1) now").post()
            }
        }
    }

    private func go(to index: Int) {
        if reduceMotion {
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) { selection = index }
        } else {
            withAnimation(.easeInOut(duration: 0.25)) { selection = index }
        }
    }

    private func goToLive() {
        guard let liveIndex = store.live?.slide.index else { return }
        following = true
        liveWhenLeft = nil
        if selection != liveIndex { go(to: liveIndex) }
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
        following = false
        liveWhenLeft = live.slide.index
        selection = target
        return true
    }
}

struct SlidePage: View {
    let slide: Slide

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(slide.title)
                    .font(.largeTitle.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
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
            Text("Live")
        }
        .font(.subheadline.weight(.bold))
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.red))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Live")
    }
}

struct OfflineBar: View {
    var body: some View {
        Label("Can't reach the class", systemImage: "wifi.slash")
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
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
