import SwiftUI

struct LoadingView: View {
    var body: some View {
        ZStack {
            NomiBackground()

            VStack(spacing: 18) {
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.72))
                        .frame(width: 116, height: 116)
                        .shadow(color: .pink.opacity(0.12), radius: 24, y: 12)

                    Image("NomiMascot")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 92, height: 92)
                }

                Text("Loading Nomi")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)

                ProgressView()
                    .tint(.pink)
            }
        }
    }
}
