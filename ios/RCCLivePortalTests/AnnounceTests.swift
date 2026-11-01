// What VoiceOver reads on the real DeckView as the deck moves (sweep2-ios-7). FollowTests checks
// Follow.announcement, the line; these check that DeckView reads it out, through the `announce`
// it's given, and reads nothing else (sweep2-ios-fixcheck-2).
import SwiftUI
import Testing
@testable import RCCLivePortal

/// Every line DeckView had VoiceOver read, in order.
@MainActor
private final class Heard {
    var lines: [String] = []
}

/// Waits for DeckStore's feeds (delivered on the main queue) and the view's onChange to run.
private func settle() async throws { try await Task.sleep(for: .milliseconds(400)) }

@Suite("VoiceOver on the deck screen", .serialized)
@MainActor
struct AnnounceTests {
    @Test("sweep2-ios-7 following the deck: the first slide says nothing, each move says 'Slide N of M'")
    func following() async throws {
        let heard = Heard()
        let screen = try Hosted(startOnSlide: nil, announce: { heard.lines.append($0) })
        defer { screen.window.isHidden = true }
        try await settle()

        screen.src.deck(on: 5)  // the first slide that comes in
        try await settle()
        #expect(heard.lines == [])

        screen.src.deck(on: 6)
        try await settle()
        #expect(heard.lines == ["Slide 7 of 10"])

        screen.src.deck(on: 7)
        try await settle()
        #expect(heard.lines == ["Slide 7 of 10", "Slide 8 of 10"])
    }

    @Test("sweep2-ios-7 reading an earlier slide: a deck move reads the notice once, never a slide count, until the deck goes back past it")
    func browsing() async throws {
        let heard = Heard()
        // -startOnSlide 3: the student is on slide 3 when the deck is on slide 6.
        let screen = try Hosted(startOnSlide: 3, announce: { heard.lines.append($0) })
        defer { screen.window.isHidden = true }
        try await settle()

        screen.src.deck(on: 5)
        try await settle()
        #expect(heard.lines == [])

        screen.src.deck(on: 6)  // the screen stays on slide 3; the notice shows
        try await settle()
        #expect(heard.lines == ["The professor is on slide 7 now."])

        screen.src.deck(on: 7)  // the notice was already up: nothing new
        try await settle()
        #expect(heard.lines == ["The professor is on slide 7 now."])

        screen.src.deck(on: 1)  // the deck goes back before slide 3: the screen follows it
        try await settle()
        #expect(heard.lines == ["The professor is on slide 7 now.", "Slide 2 of 10"])
    }
}
