import SwiftUI
import UIKit

/// One color from docs/design.md's color table, light and dark, as 0xRRGGBB.
struct Hex: Equatable {
    let light: UInt32
    let dark: UInt32

    /// Follows the phone's light or dark setting.
    var color: Color {
        Color(uiColor: UIColor { traits in Hex.rgb(traits.userInterfaceStyle == .dark ? dark : light) })
    }

    private static func rgb(_ hex: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1)
    }
}

/// The app's colors: the web's tokens (src/styles/tokens.css), since the app can't read the
/// stylesheets. Each line ends with its token; src/styles/ios.test.ts fails when a hex here
/// differs from tokens.css, or when a screen uses a system color instead of one of these.
enum Palette {
    static let accent = Hex(light: 0x00732D, dark: 0x96D6A0) // --accent
    static let accentText = Hex(light: 0xFFFFFF, dark: 0x003410) // --accent-text
    static let warn = Hex(light: 0xFFE5C0, dark: 0x624000) // --warn
    static let warnText = Hex(light: 0x4F3400, dark: 0xFCDEB5) // --warn-text
    static let lineStrong = Hex(light: 0x727873, dark: 0x919791) // --line-strong
    static let error = Hex(light: 0xC5150F, dark: 0xFFB3A8) // --error
    static let surface = Hex(light: 0xFFFFFF, dark: 0x1B211C) // --surface
}

/// The web's buttons on #/portal: `filled` is the main button (green, words in --accent-text),
/// otherwise an outline button (green edge and words, like .portal__tolive). Both are at least
/// 44 pt tall, the phone tap size in docs/design.md.
struct PortalButtonStyle: ButtonStyle {
    var filled: Bool

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 22, style: .continuous) }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(filled ? Palette.accentText.color : Palette.accent.color)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 18)
            .padding(.vertical, 6)
            .frame(minHeight: 44)
            // Round ends at one line (44 pt tall); at the large text sizes the words wrap and
            // the corners stay 22 pt instead of the shape turning into an oval.
            .background {
                if filled {
                    shape.fill(Palette.accent.color)
                } else {
                    shape.strokeBorder(Palette.accent.color, lineWidth: 1)
                }
            }
            .contentShape(shape)
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}
