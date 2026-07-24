package dev.w3ctech.docpilot.core

import org.junit.Assert.assertEquals
import org.junit.Test

class SseParserTest {
  @Test
  fun `跨分片解析事件`() {
    val parser = SseParser()
    assertEquals(emptyList<SseFrame>(), parser.feed("event: message.delta\ndata: {\"te"))
    assertEquals(
      listOf(SseFrame("message.delta", "{\"text\":\"你好\"}")),
      parser.feed("xt\":\"你好\"}\n\n"),
    )
  }

  @Test
  fun `忽略注释并以 message 作为默认事件`() {
    val parser = SseParser()
    assertEquals(listOf(SseFrame("message", "ok")), parser.feed(": ping\ndata: ok\n\n"))
  }
}
