import SwiftUI

/// 验证码页(独立页面):分格 Input OTP,输满 6 位自动验证,通过后由 RootView 依 session 跳转。
struct OtpView: View {
    @Bindable var model: LoginModel

    var body: some View {
        VStack(spacing: DesignTokens.spacingLg) {
            VStack(spacing: 6) {
                Text("输入验证码")
                    .font(DesignTokens.display(30, weight: .semibold))
                    .foregroundStyle(DesignTokens.ink)
                Text("验证码已发送至 \(model.email)")
                    .font(.callout)
                    .foregroundStyle(DesignTokens.inkFaint)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, 48)

            OtpInputView(code: $model.otp)
                .disabled(model.isSubmitting)
                .onChange(of: model.otp) { _, value in
                    if value.count == LoginModel.otpLength { Task { await model.submit() } }
                }

            // 固定高度状态槽:验证中 / 出错 / 占位,切换不跳动。
            Group {
                if model.isSubmitting {
                    Label("正在验证…", systemImage: "arrow.triangle.2.circlepath")
                        .font(.footnote)
                        .foregroundStyle(DesignTokens.inkFaint)
                } else if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(DesignTokens.seal)
                }
            }
            .frame(height: 20)

            HStack {
                Button("换个邮箱") { model.backToEmail() }
                Spacer()
                Button("重新发送") { Task { await model.resendOTP() } }
                    .disabled(model.isSubmitting)
            }
            .font(.subheadline)
            .tint(DesignTokens.seal)

            Spacer()
        }
        .padding(.horizontal, DesignTokens.spacingLg)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DesignTokens.paper)
        .navigationTitle("验证")
        .navigationBarTitleDisplayMode(.inline)
    }
}
