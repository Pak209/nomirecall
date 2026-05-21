import SwiftUI

struct NomiBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        LinearGradient(
            colors: colorScheme == .dark ? darkColors : lightColors,
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var lightColors: [Color] {
        [
            Color(red: 1.0, green: 0.98, blue: 0.94),
            Color(red: 1.0, green: 0.93, blue: 0.96),
            Color(red: 0.98, green: 0.94, blue: 1.0)
        ]
    }

    private var darkColors: [Color] {
        [
            Color(red: 0.015, green: 0.017, blue: 0.025),
            Color(red: 0.035, green: 0.030, blue: 0.050),
            Color(red: 0.012, green: 0.018, blue: 0.030)
        ]
    }
}
