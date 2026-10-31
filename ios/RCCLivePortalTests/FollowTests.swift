import Testing
@testable import RCCLivePortal

/// Moves the deck to `live` the way deck:set does: every slide up to `live` has been shown,
/// so the phone can open each of them (DeckStore.pages).
private func deck(_ follow: inout Follow, to live: Int) {
    follow.deckMoved(live: live, pages: Array(0...live))
}

@Suite("Following the deck")
struct FollowTests {
    @Test("ios-1 professor goes back to the student's slide: following is true and the next move follows")
    func professorLandsOnStudentsSlide() {
        var f = Follow()
        for live in 0...5 { deck(&f, to: live) }  // the deck reaches slide 6 and the phone follows
        #expect(f.selection == 5)
        #expect(f.following)

        f.open(2, live: 5)  // the student swipes back to slide 3
        #expect(!f.following)

        for live in [4, 3, 2] { deck(&f, to: live) }  // the professor goes back to slide 3
        #expect(f.selection == 2)
        #expect(f.following)
        #expect(!f.showNotice(live: 2))

        deck(&f, to: 3)  // the professor moves on to slide 4
        #expect(f.selection == 3)
        #expect(f.following)
    }

    @Test("F36 the deck moves on while the student reads an earlier slide: the phone stays and shows the notice")
    func deckMovesOnWhileReading() {
        var f = Follow()
        for live in 0...5 { deck(&f, to: live) }
        f.open(2, live: 5)
        #expect(!f.showNotice(live: 5))

        deck(&f, to: 6)
        #expect(f.selection == 2)
        #expect(!f.following)
        #expect(f.showNotice(live: 6))

        f.goToLive(6)  // Back to live
        #expect(f.selection == 6)
        #expect(f.following)
        #expect(!f.showNotice(live: 6))
    }

    @Test("F36 the deck goes back past the student's slide: the phone follows it")
    func deckGoesBackPastTheStudent() {
        var f = Follow()
        for live in 0...5 { deck(&f, to: live) }
        f.open(4, live: 5)
        deck(&f, to: 1)
        #expect(f.selection == 1)
        #expect(f.following)
    }

    @Test("F36 swiping forward to the live slide follows the deck again")
    func swipeToLiveFollows() {
        var f = Follow()
        for live in 0...5 { deck(&f, to: live) }
        f.open(3, live: 5)
        f.open(5, live: 5)
        #expect(f.following)
        deck(&f, to: 6)
        #expect(f.selection == 6)
    }
}
