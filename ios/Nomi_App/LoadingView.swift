import SwiftUI

struct LoadingView: View {
    var body: some View {
        ZStack {
            NomiBackground()

            VStack(spacing: 18) {
                Image("AppIcon")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

                ProgressView()
                    .tint(.pink)
            }
        }
    }
}
