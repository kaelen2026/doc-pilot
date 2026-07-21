import SwiftUI

struct LoginView: View {
    @Bindable var model: LoginModel

    var body: some View {
        Form {
            Section {
                TextField("邮箱", text: $model.email)
#if os(iOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
#endif
                    .textContentType(.emailAddress)
                    .disabled(model.step == .otp)
                    .accessibilityIdentifier("login.email")
                if model.step == .otp {
                    SecureField("验证码", text: $model.otp)
                        .textContentType(.oneTimeCode)
                        .accessibilityIdentifier("login.otp")
                }
            } header: {
                Text("登录 DocPilot")
            } footer: {
                if let errorMessage = model.errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
            Button(model.step == .email ? "发送验证码" : "登录") {
                Task { await model.submit() }
            }
            .disabled(!model.canSubmit)
            .accessibilityIdentifier("login.submit")
        }
        .formStyle(.grouped)
        .frame(maxWidth: 520)
        .background(DesignTokens.paper)
    }
}
