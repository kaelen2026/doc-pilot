package dev.w3ctech.docpilot.core

sealed interface PdfProblem {
  data object Type : PdfProblem
  data object TooLarge : PdfProblem
}

fun validatePdf(name: String, mime: String?, bytes: Long): PdfProblem? {
  if (!name.endsWith(".pdf", ignoreCase = true) && mime != "application/pdf") return PdfProblem.Type
  if (bytes > 50L * 1024 * 1024) return PdfProblem.TooLarge
  return null
}
