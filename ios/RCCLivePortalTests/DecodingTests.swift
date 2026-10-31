import Foundation
import Testing
@testable import RCCLivePortal

/// ConvexMobile decodes every answer with a plain JSONDecoder, the same call these tests make.
private func json(_ text: String) -> Data { Data(text.utf8) }

@Suite("Decoding what Convex sends")
struct DecodingTests {
    @Test("ios-4 index 1e300 throws DecodingError instead of trapping; 3.0 decodes to 3")
    func hugeNumbersThrow() throws {
        let decoder = JSONDecoder()
        #expect(throws: DecodingError.self) {
            try decoder.decode(LiveSlide.self, from: json(#"{"index":1e300,"beat":0,"count":6,"title":"t","lines":[],"at":1}"#))
        }
        #expect(throws: DecodingError.self) {
            try decoder.decode(LiveSlide.self, from: json(#"{"index":3,"beat":0,"count":-1e300,"title":"t","lines":[],"at":1}"#))
        }
        #expect(throws: DecodingError.self) {
            try decoder.decode([Slide].self, from: json(#"[{"index":1,"beat":1e300,"title":"t","lines":[],"at":1}]"#))
        }

        let live = try decoder.decode(
            LiveSlide.self,
            from: json(#"{"index":3.0,"beat":1.0,"count":6.0,"title":"Slide 4","lines":["A line"],"at":1761771234567.0}"#))
        #expect(live.slide.index == 3)
        #expect(live.slide.beat == 1)
        #expect(live.count == 6)
        #expect(live.slide.lines == ["A line"])
    }

    @Test("F36 deck:current null decodes to no slide, as the type DeckStore subscribes with")
    func nullIsNoSlide() throws {
        // deck:current is null before the first slide of a class and after End day. DeckStore
        // subscribes with CurrentAnswer, so a change to a non-optional type fails here.
        let none: LiveSlide? = try JSONDecoder().decode(DeckStore.CurrentAnswer.self, from: json("null"))
        #expect(none == nil)
        let slide: LiveSlide? = try JSONDecoder().decode(
            DeckStore.CurrentAnswer.self,
            from: json(#"{"index":1,"beat":0,"count":6,"title":"Slide 2","lines":[],"at":1}"#))
        #expect(slide?.slide.index == 1)
    }

    @Test("ios-9 lateFeed rows decode; a lateMin no Int can hold throws")
    func lateFeedRows() throws {
        let rows = try JSONDecoder().decode(
            [LateArrival].self,
            from: json(#"[{"id":"k57d3n8y1b2c4f6g7h9j0m1p2q3r4s5t","first":"Ana","lateMin":12.0,"at":1761771234567.0}]"#))
        #expect(rows == [LateArrival(id: "k57d3n8y1b2c4f6g7h9j0m1p2q3r4s5t", first: "Ana", lateMin: 12, at: 1761771234567)])
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode([LateArrival].self, from: json(#"[{"id":"x","first":"Ana","lateMin":1e300,"at":1}]"#))
        }
    }
}
