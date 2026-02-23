package eu.kanade.tachiyomi.ui.player

import okhttp3.Headers
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class StreamRequestHeadersTest {

    @Test
    fun `merge gives priority to override headers`() {
        val base = Headers.Builder()
            .add("User-Agent", "base-agent")
            .add("Referer", "https://base.example")
            .build()
        val override = Headers.Builder()
            .add("User-Agent", "video-agent")
            .build()

        val merged = StreamRequestHeaders.merge(base, override, cookieHeader = null)

        assertEquals("video-agent", merged["User-Agent"])
        assertEquals("https://base.example", merged["Referer"])
    }

    @Test
    fun `merge injects cookie only when missing`() {
        val base = Headers.Builder()
            .add("User-Agent", "base-agent")
            .build()

        val merged = StreamRequestHeaders.merge(base, overrideHeaders = null, cookieHeader = "cf_clearance=abc123")

        assertEquals("cf_clearance=abc123", merged["Cookie"])
    }

    @Test
    fun `merge keeps explicit cookie header`() {
        val base = Headers.Builder()
            .add("Cookie", "session=source")
            .build()
        val override = Headers.Builder()
            .add("Cookie", "session=video")
            .build()

        val merged = StreamRequestHeaders.merge(base, override, cookieHeader = "cf_clearance=abc123")

        assertEquals("session=video", merged["Cookie"])
        assertEquals(1, merged.values("Cookie").size)
    }

    @Test
    fun `mpv formatter escapes commas`() {
        val headers = Headers.Builder()
            .add("Referer", "https://example.com/a,b")
            .build()

        val formatted = StreamRequestHeaders.toMpvHttpHeaderFields(headers)

        assertEquals("Referer: https://example.com/a\\,b", formatted)
    }
}
