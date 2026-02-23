package eu.kanade.tachiyomi.ui.player.loader

import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.ui.player.controls.components.sheets.HosterState
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class HosterLoaderTest {

    @Test
    fun `collectResolvedVideos keeps selection order and skips unresolved entries`() = runTest {
        val preferred = Video(videoUrl = "https://source/preferred", videoTitle = "preferred", preferred = true)
        val fallback = Video(videoUrl = "https://source/fallback", videoTitle = "fallback")
        val secondary = Video(videoUrl = "https://source/secondary", videoTitle = "secondary")

        val hosterStates = mutableListOf<HosterState>(
            HosterState.Ready(
                name = "Hoster A",
                videoList = listOf(preferred, fallback),
                videoState = listOf(Video.State.QUEUE, Video.State.QUEUE),
            ),
            HosterState.Ready(
                name = "Hoster B",
                videoList = listOf(secondary),
                videoState = listOf(Video.State.QUEUE),
            ),
        )

        val resolved = HosterLoader.collectResolvedVideos(hosterStates) { video ->
            when (video.videoTitle) {
                "preferred" -> null
                else -> video.copy(videoUrl = "resolved://${video.videoTitle}")
            }
        }

        assertEquals(listOf("resolved://fallback", "resolved://secondary"), resolved.map { it.videoUrl })
    }

    @Test
    fun `collectResolvedVideos deduplicates by resolved url`() = runTest {
        val first = Video(videoUrl = "https://source/first", videoTitle = "first")
        val second = Video(videoUrl = "https://source/second", videoTitle = "second")

        val hosterStates = mutableListOf<HosterState>(
            HosterState.Ready(
                name = "Hoster A",
                videoList = listOf(first, second),
                videoState = listOf(Video.State.QUEUE, Video.State.QUEUE),
            ),
        )

        val resolved = HosterLoader.collectResolvedVideos(hosterStates) {
            it.copy(videoUrl = "resolved://same")
        }

        assertEquals(1, resolved.size)
        assertEquals("resolved://same", resolved.first().videoUrl)
    }
}
