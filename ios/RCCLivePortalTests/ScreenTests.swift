import Testing
@testable import RCCLivePortal

@Suite("Screens and words")
struct ScreenTests {
    @Test("ios-5 two deck:current failures in a row show Can't load the slides. instead of a bare spinner")
    func twoFailuresInARow() {
        var load = LoadState()
        load.failed()
        #expect(load.problem == nil)  // one failure: still loading

        load.failed()
        #expect(load.problem == .cantLoad)
        #expect(Words.line(for: .cantLoad) == "Can't load the slides.")

        load.answered()
        #expect(load.loaded)
        #expect(load.problem == nil)

        load.failed()  // one failure after an answer isn't two in a row
        #expect(load.problem == nil)
    }

    @Test("ios-8 the app shows #/portal's words")
    func portalWords() {
        #expect(Words.professorOn(slide: 4) == "The professor is on slide 4 now.")
        #expect(Words.loading == "Loading the slides…")
        #expect(Words.waiting == "Waiting for the slides to start.")
        #expect(Words.slideOf(4, count: 6) == "Slide 4 of 6")
        #expect(Words.backToLive == "Back to live")
        #expect(Words.line(for: .offline) == "No connection. Check your Wi-Fi or cell data.")
    }

    @Test("ios-8 a slide with no title shows no title row")
    func noTitleNoRow() {
        #expect(Slide(index: 0, beat: 0, title: "", lines: ["A line"], at: 0).heading == nil)
        #expect(Slide(index: 0, beat: 0, title: "  ", lines: [], at: 0).heading == nil)
        #expect(Slide(index: 0, beat: 0, title: "Intro", lines: [], at: 0).heading == "Intro")
    }

    @Test("unit tests run inside the app without connecting it to a backend")
    func noBackendDuringTests() {
        #expect(RCCLivePortalApp.runningTests)
    }
}
