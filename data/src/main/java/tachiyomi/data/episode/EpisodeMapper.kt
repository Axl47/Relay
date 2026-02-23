package tachiyomi.data.episode

import tachiyomi.domain.episode.model.Episode
import tachiyomi.domain.episode.model.EpisodeType

object EpisodeMapper {
    fun mapEpisode(
        id: Long,
        animeId: Long,
        url: String,
        name: String,
        scanlator: String?,
        seen: Boolean,
        bookmark: Boolean,
        // AM (FILLERMARK) -->
        fillermark: Boolean,
        // <-- AM (FILLERMARK)
        episodeType: String,
        lastSecondSeen: Long,
        totalSeconds: Long,
        episodeNumber: Double,
        sourceOrder: Long,
        dateFetch: Long,
        dateUpload: Long,
        lastModifiedAt: Long,
        version: Long,
        @Suppress("UNUSED_PARAMETER")
        isSyncing: Long,
    ): Episode = Episode(
        id = id,
        animeId = animeId,
        seen = seen,
        bookmark = bookmark,
        // AM (FILLERMARK) -->
        fillermark = fillermark,
        // <-- AM (FILLERMARK)
        episodeType = EpisodeType.fromDb(episodeType),
        lastSecondSeen = lastSecondSeen,
        totalSeconds = totalSeconds,
        dateFetch = dateFetch,
        sourceOrder = sourceOrder,
        url = url,
        name = name,
        dateUpload = dateUpload,
        episodeNumber = episodeNumber,
        scanlator = scanlator,
        lastModifiedAt = lastModifiedAt,
        version = version,
    )
}
