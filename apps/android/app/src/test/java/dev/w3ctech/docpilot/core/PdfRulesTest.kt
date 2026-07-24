package dev.w3ctech.docpilot.core

import org.junit.Assert.assertEquals
import org.junit.Test

class PdfRulesTest {
  @Test
  fun `拒绝非 PDF 和超过 50MB 文件`() {
    assertEquals(PdfProblem.Type, validatePdf("note.txt", "text/plain", 12))
    assertEquals(PdfProblem.TooLarge, validatePdf("book.pdf", "application/pdf", 50L * 1024 * 1024 + 1))
  }

  @Test
  fun `接受上限内 PDF`() {
    assertEquals(null, validatePdf("book.pdf", "application/pdf", 50L * 1024 * 1024))
  }
}
