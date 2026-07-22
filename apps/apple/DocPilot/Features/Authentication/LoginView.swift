import SwiftUI

struct LoginView: View {
    @Bindable var model: LoginModel

    var body: some View {
        NavigationStack {
            emailStep
                .navigationDestination(isPresented: otpPresented) {
                    OtpView(model: model)
                }
        }
    }

    /// step 即导航状态:进入 .otp 推 OTP 页;从 OTP 页返回则退回邮箱步。
    private var otpPresented: Binding<Bool> {
        Binding(
            get: { model.step == .otp },
            set: { presented in if !presented { model.backToEmail() } }
        )
    }

    private var emailStep: some View {
        VStack(spacing: DesignTokens.spacingLg) {
            VStack(spacing: 6) {
                Text("DocPilot")
                    .font(DesignTokens.display(42, weight: .semibold))
                    .foregroundStyle(DesignTokens.ink)
                Text("AI 文档工作台,读得懂、问得到")
                    .font(.callout)
                    .foregroundStyle(DesignTokens.inkFaint)
            }
            .padding(.top, 56)

            VStack(spacing: DesignTokens.spacing) {
                TextField("邮箱", text: $model.email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .submitLabel(.next)
                    .onSubmit { if model.canSubmit { Task { await model.submit() } } }
                    .accessibilityIdentifier("login.email")
                    .padding(16)
                    .background(DesignTokens.paperRaised, in: RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous)
                            .stroke(DesignTokens.hairline, lineWidth: 1)
                    )

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(DesignTokens.seal)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await model.submit() }
                } label: {
                    Text("发送验证码")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .tint(DesignTokens.seal)
                .disabled(!model.canSubmit)
                .accessibilityIdentifier("login.submit")
            }
            Spacer()
        }
        .padding(.horizontal, DesignTokens.spacingLg)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DesignTokens.paper)
    }
}
