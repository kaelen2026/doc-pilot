package dev.w3ctech.docpilot.core

data class SseFrame(val event: String, val data: String)

class SseParser {
  private var buffer = ""

  fun feed(chunk: String): List<SseFrame> {
    buffer += chunk.replace("\r\n", "\n")
    val frames = mutableListOf<SseFrame>()
    while (true) {
      val end = buffer.indexOf("\n\n")
      if (end < 0) break
      val block = buffer.substring(0, end)
      buffer = buffer.substring(end + 2)
      var event = "message"
      val data = mutableListOf<String>()
      block.lineSequence().forEach { line ->
        when {
          line.startsWith("event:") -> event = line.substringAfter(":").trimStart()
          line.startsWith("data:") -> data += line.substringAfter(":").trimStart()
        }
      }
      if (data.isNotEmpty()) frames += SseFrame(event, data.joinToString("\n"))
    }
    return frames
  }
}
