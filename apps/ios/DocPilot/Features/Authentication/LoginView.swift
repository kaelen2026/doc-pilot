import AuthenticationServices
import SwiftUI

struct LoginView: View {
    @Bindable var model: LoginModel
    @Environment(\.colorScheme) private var colorScheme

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
                methodPicker

                TextField("邮箱", text: $model.email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .submitLabel(.next)
                    .onSubmit(primarySubmit)
                    .accessibilityIdentifier("login.email")
                    .padding(16)
                    .background(DesignTokens.paperRaised, in: RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous)
                            .stroke(DesignTokens.hairline, lineWidth: 1)
                    )

                // 密码模式才出现密码框:AutoFill 走 .password,不自动大写。
                if model.method == .password {
                    SecureField("密码", text: $model.password)
                        .textInputAutocapitalization(.never)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .onSubmit { Task { await model.signInWithPassword() } }
                        .accessibilityIdentifier("login.password")
                        .padding(16)
                        .background(DesignTokens.paperRaised, in: RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous)
                                .stroke(DesignTokens.hairline, lineWidth: 1)
                        )
                }

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(DesignTokens.seal)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                primaryButton

                orDivider

                SignInWithAppleButton(.signIn) { request in
                    model.configureAppleRequest(request)
                } onCompletion: { result in
                    Task { await model.completeAppleSignIn(result) }
                }
                // 系统按钮随明暗切换(墨底/纸底皆有足够对比),圆角对齐邮箱输入框。
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radiusLg, style: .continuous))
                .disabled(model.isSubmitting)
                .accessibilityLabel("通过 Apple 登录")
                .accessibilityIdentifier("login.apple")
            }
            Spacer()
        }
        .padding(.horizontal, DesignTokens.spacingLg)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DesignTokens.paper)
    }

    /// 验证码 / 密码 方式切换:分段控件,切换只清错误、不清邮箱。
    private var methodPicker: some View {
        Picker("登录方式", selection: methodSelection) {
            ForEach(LoginModel.Method.allCases) { method in
                Text(method.label).tag(method)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("login.method")
    }

    private var methodSelection: Binding<LoginModel.Method> {
        Binding(get: { model.method }, set: { model.selectMethod($0) })
    }

    /// 主按钮:验证码模式发码,密码模式登录。文案与可用性随方式切换。
    @ViewBuilder private var primaryButton: some View {
        Button(action: primarySubmit) {
            Text(model.method == .otp ? "发送验证码" : "登录")
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.glassProminent)
        .tint(DesignTokens.seal)
        .disabled(model.method == .otp ? !model.canSubmit : !model.canSignInWithPassword)
        .accessibilityIdentifier("login.submit")
    }

    /// 邮箱页主动作:按当前方式分派——发码或密码登录。
    private func primarySubmit() {
        switch model.method {
        case .otp:
            if model.canSubmit { Task { await model.submit() } }
        case .password:
            Task { await model.signInWithPassword() }
        }
    }

    /// 「或」分隔:两侧发丝线,区隔邮箱登录与第三方登录。
    private var orDivider: some View {
        HStack(spacing: DesignTokens.spacingSm) {
            Rectangle().fill(DesignTokens.hairline).frame(height: 1)
            Text("或")
                .font(.footnote)
                .foregroundStyle(DesignTokens.inkFaint)
            Rectangle().fill(DesignTokens.hairline).frame(height: 1)
        }
        .padding(.vertical, 4)
    }
}
