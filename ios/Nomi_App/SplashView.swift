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

            VStack(spacing: 24) {
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.22))
                        .frame(width: 184, height: 184)
                        .blur(radius: 1)

                    Image("NomiMascot")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 148, height: 148)
                        .shadow(color: .white.opacity(0.32), radius: 18, y: 8)
                        .shadow(color: .black.opacity(0.14), radius: 24, y: 14)
                }

                Text("Nomi Recall")
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Text("Capture what matters.")
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.82))
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
