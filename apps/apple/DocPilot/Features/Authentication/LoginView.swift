import SwiftUI

struct LoginView: View {
    @Bindable var model: LoginModel

    var body: some View {
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
                VStack(alignment: .leading, spacing: 10) {
                    TextField("邮箱", text: $model.email)
#if os(iOS)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
#endif
                        .textContentType(.emailAddress)
                        .disabled(model.step == .otp)
                        .accessibilityIdentifier("login.email")
                    if model.step == .otp {
                        Divider().overlay(DesignTokens.hairline)
                        SecureField("验证码", text: $model.otp)
                            .textContentType(.oneTimeCode)
                            .accessibilityIdentifier("login.otp")
                    }
                }
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
                    Text(model.step == .email ? "发送验证码" : "登录")
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
