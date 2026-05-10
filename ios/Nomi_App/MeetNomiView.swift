import SwiftUI

struct MeetNomiView: View {
    @EnvironmentObject private var appSession: AppSession
    @State private var isCompleting = false

    var body: some View {
        ZStack {
            NomiBackground()

            VStack(spacing: 28) {
                Spacer()

                Image("AppIcon")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 132, height: 132)
                    .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
                    .shadow(color: .pink.opacity(0.25), radius: 24, y: 12)

                VStack(spacing: 12) {
                    Text("Meet Nomi")
                        .font(.system(size: 42, weight: .bold, design: .rounded))

                    Text("Your memory companion for notes, links, images, voice thoughts, and the ideas you want to find again.")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                Spacer()

                Button {
                    complete()
                } label: {
                    HStack {
                        if isCompleting {
                            ProgressView()
                                .tint(.white)
                        }

                        Text("Continue")
                            .fontWeight(.bold)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(NomiPrimaryButtonStyle())
                .disabled(isCompleting)
            }
            .padding(24)
        }
    }

    private func complete() {
        isCompleting = true

        Task {
            await appSession.completeOnboarding()
            isCompleting = false
        }
    }
}
