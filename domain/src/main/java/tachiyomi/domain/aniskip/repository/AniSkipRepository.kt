package tachiyomi.domain.aniskip.repository

import tachiyomi.domain.aniskip.model.SkipSegment

interface AniSkipRepository {

    suspend fun getSkipTimes(
        malId: Int,
        episodeNumber: Int,
        episodeLength: Long,
    ): List<SkipSegment>

    suspend fun getMalIdFromAniList(aniListId: Long): Long?
}
