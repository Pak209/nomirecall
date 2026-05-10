import SwiftUI

struct SplashView: View {
    @State private var isVisible = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 1.0, green: 0.61, blue: 0.0),
                    Color(red: 1.0, green: 0.13, blue: 0.48),
                    Color(red: 0.38, green: 0.12, blue: 1.0)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 28) {
                Image("AppIcon")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 148, height: 148)
                    .clipShape(RoundedRectangle(cornerRadius: 36, style: .continuous))
                    .shadow(color: .black.opacity(0.18), radius: 28, y: 16)

                Text("Nomi")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
            .scaleEffect(isVisible ? 1 : 0.96)
            .opacity(isVisible ? 1 : 0)
            .animation(.easeOut(duration: 0.42), value: isVisible)
        }
        .onAppear {
            isVisible = true
        }
    }
}
