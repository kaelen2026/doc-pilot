package dev.w3ctech.docpilot.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ScannerViewTest {
  @Test fun `只接受 DocPilot 深链或裸用户码`() {
    assertEquals("ABCD-1234", parseDeviceCode("docpilot://device-login?user_code=ABCD-1234"))
    assertEquals("ABCD-1234", parseDeviceCode("ABCD-1234"))
    assertNull(parseDeviceCode("https://evil.example/device-login?user_code=ABCD"))
  }
}
