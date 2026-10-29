import SwiftUI

@main
struct RCCLivePortalApp: App {
    @State private var store = DeckStore(config: .load())

    var body: some Scene {
        WindowGroup {
            DeckView(store: store)
        }
    }
}
