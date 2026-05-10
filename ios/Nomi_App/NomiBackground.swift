import SwiftUI

struct NomiBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 1.0, green: 0.98, blue: 0.94),
                Color(red: 1.0, green: 0.93, blue: 0.96),
                Color(red: 0.98, green: 0.94, blue: 1.0)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}
