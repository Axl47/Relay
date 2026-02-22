package eu.kanade.domain.anime.interactor

import tachiyomi.core.common.util.lang.toLong
import tachiyomi.domain.aniskip.model.AniSkipPreference
import tachiyomi.domain.anime.model.Anime
import tachiyomi.domain.anime.model.AnimeUpdate
import tachiyomi.domain.anime.repository.AnimeRepository
import kotlin.math.pow

class SetAnimeViewerFlags(
    private val animeRepository: AnimeRepository,
) {

    suspend fun awaitSetSkipIntroLength(id: Long, flag: Long) {
        val anime = animeRepository.getAnimeById(id)
        animeRepository.update(
            AnimeUpdate(
                id = id,
                viewerFlags = anime.viewerFlags
                    .setFlag(flag, Anime.ANIME_INTRO_MASK)
                    // Disable skip intro button if length is set to 0
                    .setFlag((flag == 0L).toLong().addHexZeros(14), Anime.ANIME_INTRO_DISABLE_MASK),
            ),
        )
    }

    suspend fun awaitSetNextEpisodeAiring(id: Long, flags: Pair<Int, Long>) {
        awaitSetNextEpisodeToAir(id, flags.first.toLong().addHexZeros(zeros = 2))
        awaitSetNextEpisodeAiringAt(id, flags.second.addHexZeros(zeros = 6))
    }

    suspend fun awaitSetAniSkipPreference(id: Long, preference: AniSkipPreference) {
        val anime = animeRepository.getAnimeById(id)
        animeRepository.update(
            AnimeUpdate(
                id = id,
                viewerFlags = anime.viewerFlags.setFlag(
                    preference.toViewerFlag(),
                    Anime.ANIME_ANISKIP_PREF_MASK,
                ),
            ),
        )
    }

    private suspend fun awaitSetNextEpisodeToAir(id: Long, flag: Long) {
        val anime = animeRepository.getAnimeById(id)
        animeRepository.update(
            AnimeUpdate(
                id = id,
                viewerFlags = anime.viewerFlags.setFlag(flag, Anime.ANIME_AIRING_EPISODE_MASK),
            ),
        )
    }

    private suspend fun awaitSetNextEpisodeAiringAt(id: Long, flag: Long) {
        val anime = animeRepository.getAnimeById(id)
        animeRepository.update(
            AnimeUpdate(
                id = id,
                viewerFlags = anime.viewerFlags.setFlag(flag, Anime.ANIME_AIRING_TIME_MASK),
            ),
        )
    }

    private fun Long.setFlag(flag: Long, mask: Long): Long {
        return this and mask.inv() or (flag and mask)
    }

    private fun Long.addHexZeros(zeros: Int): Long {
        val hex = 16.0
        return this.times(hex.pow(zeros)).toLong()
    }

    private fun AniSkipPreference.toViewerFlag(): Long {
        return when (this) {
            AniSkipPreference.AUTO -> Anime.ANIME_ANISKIP_PREF_AUTO
            AniSkipPreference.BUTTON -> 0L
            AniSkipPreference.OFF -> Anime.ANIME_ANISKIP_PREF_OFF
        }
    }
}
