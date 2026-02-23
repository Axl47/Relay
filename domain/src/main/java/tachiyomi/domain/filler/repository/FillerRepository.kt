package tachiyomi.domain.filler.repository

import tachiyomi.domain.episode.model.EpisodeType

interface FillerRepository {

    suspend fun getEpisodeTypes(malId: Long): Map<Double, EpisodeType>
}
