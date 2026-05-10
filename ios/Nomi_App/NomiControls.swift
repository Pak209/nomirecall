import SwiftUI

extension Color {
    static let nomiInk = Color(red: 0.10, green: 0.10, blue: 0.13)
    static let nomiMuted = Color(red: 0.58, green: 0.55, blue: 0.62)
    static let nomiOrange = Color(red: 1.00, green: 0.50, blue: 0.11)
    static let nomiCoral = Color(red: 1.00, green: 0.35, blue: 0.31)
    static let nomiPink = Color(red: 1.00, green: 0.15, blue: 0.46)
    static let nomiPurple = Color(red: 0.50, green: 0.28, blue: 1.00)
    static let nomiCream = Color(red: 1.00, green: 0.96, blue: 0.92)
}

struct NomiPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.white)
            .padding(.vertical, 13)
            .padding(.horizontal, 16)
            .background(
                LinearGradient(
                    colors: [.orange, .pink],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(configuration.isPressed ? 0.82 : 1.0)
    }
}

struct NomiSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.pink)
            .padding(.vertical, 11)
            .padding(.horizontal, 16)
            .background(.white.opacity(0.86))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(.pink.opacity(0.2), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.78 : 1.0)
    }
}

extension View {
    func nomiTextField() -> some View {
        self
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(.white.opacity(0.9))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            )
    }
}
