import Testing
@testable import RCCLivePortal

private let slide4 = LiveSlide(slide: Slide(index: 3, beat: 0, title: "Slide 4", lines: [], at: 1), count: 6)

@Suite("Screens and words")
struct ScreenTests {
    @Test("ios-5 two deck:current failures in a row show Can't load the slides. instead of a bare spinner")
    func twoFailuresInARow() {
        var load = LoadState()
        #expect(DeckScreen(live: nil, load: load) == DeckScreen(bar: nil, main: .loading))

        load.failed()  // one failure: still loading
        #expect(DeckScreen(live: nil, load: load) == DeckScreen(bar: nil, main: .loading))

        load.failed()
        #expect(DeckScreen(live: nil, load: load) == DeckScreen(bar: nil, main: .message("Can't load the slides.")))

        load.answered()  // deck:current answered null: no slide yet
        #expect(load.loaded)
        #expect(DeckScreen(live: nil, load: load) == DeckScreen(bar: nil, main: .message("Waiting for the slides to start.")))

        load.failed()  // one failure after an answer isn't two in a row
        #expect(DeckScreen(live: slide4, load: load) == DeckScreen(bar: nil, main: .deck(slide4)))

        load.failed()  // two in a row after the slides loaded: the bar over the last slide
        #expect(DeckScreen(live: slide4, load: load) == DeckScreen(bar: .cantLoad, main: .deck(slide4)))
        #expect(Words.line(for: .cantLoad) == "Can't load the slides.")
    }

    @Test("ios-5 no connection before the first answer says so in the middle; after it, in the bar")
    func offline() {
        var load = LoadState()
        load.offline = true
        #expect(DeckScreen(live: nil, load: load)
            == DeckScreen(bar: nil, main: .message("No connection. Check your Wi-Fi or cell data.")))
        load.answered()
        load.offline = true
        #expect(DeckScreen(live: slide4, load: load) == DeckScreen(bar: .offline, main: .deck(slide4)))
    }

    @Test("ios-8 the app shows #/portal's words, including the notice when the deck moves on")
    func portalWords() {
        var f = Follow()
        for live in 0...5 { f.deckMoved(live: live, pages: Array(0...live)) }
        f.open(2, live: 5)
        #expect(f.notice(live: 5) == nil)  // the deck hasn't moved since the student swiped back
        f.deckMoved(live: 6, pages: Array(0...6))
        #expect(f.notice(live: 6) == "The professor is on slide 7 now.")
        f.goToLive(6)
        #expect(f.notice(live: 6) == nil)

        #expect(Words.professorOn(slide: 4) == "The professor is on slide 4 now.")
        #expect(Words.loading == "Loading the slides…")
        #expect(Words.waiting == "Waiting for the slides to start.")
        #expect(Words.slideOf(4, count: 6) == "Slide 4 of 6")
        #expect(Words.backToLive == "Back to live")
        #expect(Words.line(for: .offline) == "No connection. Check your Wi-Fi or cell data.")
    }

    /// Checks the value SlidePage reads (`if let heading = slide.heading`), not the rendered view.
    @Test("ios-8 a slide with no title has no heading for SlidePage to show")
    func noTitleNoHeading() {
        #expect(Slide(index: 0, beat: 0, title: "", lines: ["A line"], at: 0).heading == nil)
        #expect(Slide(index: 0, beat: 0, title: "  ", lines: [], at: 0).heading == nil)
        #expect(Slide(index: 0, beat: 0, title: "Intro", lines: [], at: 0).heading == "Intro")
    }

    @Test("unit tests run inside the app without connecting it to a backend")
    @MainActor
    func noBackendDuringTests() {
        #expect(RCCLivePortalApp.runningTests)
        // The app was launched before the tests started; with the guard in RCCLivePortalApp
        // it made no DeckStore, so it opened no connection.
        #expect(DeckStore.made == 0)
    }
}
