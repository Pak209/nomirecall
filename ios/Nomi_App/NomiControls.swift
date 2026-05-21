import SwiftUI

extension Color {
    static let nomiInk = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.96, green: 0.96, blue: 0.98, alpha: 1)
            : UIColor(red: 0.10, green: 0.10, blue: 0.13, alpha: 1)
    })
    static let nomiMuted = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.62, green: 0.60, blue: 0.68, alpha: 1)
            : UIColor(red: 0.58, green: 0.55, blue: 0.62, alpha: 1)
    })
    static let nomiOrange = Color(red: 1.00, green: 0.50, blue: 0.11)
    static let nomiCoral = Color(red: 1.00, green: 0.35, blue: 0.31)
    static let nomiPink = Color(red: 1.00, green: 0.15, blue: 0.46)
    static let nomiPurple = Color(red: 0.50, green: 0.28, blue: 1.00)
    static let nomiCream = Color(red: 1.00, green: 0.96, blue: 0.92)
    static let nomiCard = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 1.0, alpha: 0.075)
            : UIColor(white: 1.0, alpha: 0.90)
    })
    static let nomiCardStrong = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 1.0, alpha: 0.105)
            : UIColor(white: 1.0, alpha: 0.94)
    })
    static let nomiField = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 1.0, alpha: 0.10)
            : UIColor(white: 1.0, alpha: 0.82)
    })
    static let nomiStroke = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 1.0, alpha: 0.12)
            : UIColor(white: 0.0, alpha: 0.06)
    })
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
            .background(Color.nomiField)
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
            .background(Color.nomiField)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.nomiStroke, lineWidth: 1)
            )
    }
}

struct NomiAvatarView: View {
    let name: String?
    let imageURL: URL?
    var size: CGFloat = 44
    var fontSize: CGFloat = 15

    var body: some View {
        ZStack {
            if let imageURL {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        initialsView
                    }
                }
            } else {
                initialsView
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.72), lineWidth: 2))
        .shadow(color: Color.black.opacity(0.05), radius: 8, y: 4)
    }

    private var initialsView: some View {
        ZStack {
            LinearGradient(
                colors: [Color.nomiPink.opacity(0.18), Color.nomiOrange.opacity(0.18)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Text(initials)
                .font(.system(size: fontSize, weight: .black, design: .rounded))
                .foregroundStyle(Color.nomiPink)
        }
    }

    private var initials: String {
        let trimmed = (name ?? "Nomi").trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: " ")
        let value = parts.prefix(2).compactMap { $0.first }.map(String.init).joined()
        return value.isEmpty ? "N" : value.uppercased()
    }
}
