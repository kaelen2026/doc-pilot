import SwiftUI

/// 分格验证码输入(Input OTP):一个隐藏的 TextField 承接键盘与 `oneTimeCode` 自动填充,
/// 上层铺一排纸面格子展示每一位,当前待输格用 seal 描边。输满由调用方 onChange 自动验证。
struct OtpInputView: View {
    @Binding var code: String
    var length = LoginModel.otpLength
    var identifier = "login.otp"
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            // 真正的输入源:透明但可聚焦,承接系统验证码自动填充。
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .foregroundStyle(.clear)
                .tint(.clear)
                .accentColor(.clear)
                .opacity(0.02)
                .accessibilityIdentifier(identifier)
                .onChange(of: code) { _, value in
                    let digits = String(value.filter(\.isNumber).prefix(length))
                    if digits != code { code = digits }
                }

            HStack(spacing: 10) {
                ForEach(0..<length, id: \.self) { index in
                    box(at: index)
                }
            }
            .allowsHitTesting(false)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { focused = true }
    }

    private func box(at index: Int) -> some View {
        let characters = Array(code)
        let digit = index < characters.count ? String(characters[index]) : ""
        let isActive = focused && index == characters.count
        let isFilledCursor = focused && index == length - 1 && characters.count == length
        return Text(digit)
            .font(DesignTokens.display(26))
            .foregroundStyle(DesignTokens.ink)
            .frame(width: 46, height: 58)
            .background(DesignTokens.paperRaised, in: RoundedRectangle(cornerRadius: DesignTokens.radiusMd, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.radiusMd, style: .continuous)
                    .stroke(
                        (isActive || isFilledCursor) ? DesignTokens.seal : DesignTokens.hairline,
                        lineWidth: (isActive || isFilledCursor) ? 2 : 1
                    )
            )
    }
}
