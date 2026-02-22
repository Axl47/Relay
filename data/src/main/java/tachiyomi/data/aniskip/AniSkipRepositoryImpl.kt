package tachiyomi.data.aniskip

import tachiyomi.data.DatabaseHandler
import tachiyomi.domain.aniskip.model.SkipSegment
import tachiyomi.domain.aniskip.model.SkipSegmentType
import tachiyomi.domain.aniskip.repository.AniSkipRepository
import kotlin.time.Duration.Companion.days

class AniSkipRepositoryImpl(
    private val handler: DatabaseHandler,
    private val api: AniSkipApi,
) : AniSkipRepository {

    override suspend fun getSkipTimes(
        malId: Int,
        episodeNumber: Int,
        episodeLength: Long,
    ): List<SkipSegment> {
        val now = System.currentTimeMillis()
        val cached = handler.awaitList {
            aniskip_cacheQueries.getSegments(
                malId = malId.toLong(),
                episodeNumber = episodeNumber.toLong(),
            )
        }

        if (cached.isNotEmpty() && cached.all { now - it.fetched_at <= STALE_MS }) {
            return cached.map(::mapCachedToDomain)
        }

        val remote = runCatching {
            api.getSkipTimes(
                malId = malId,
                episodeNumber = episodeNumber,
                episodeLength = episodeLength,
            )
        }.getOrNull()

        if (remote != null) {
            handler.await(inTransaction = true) {
                aniskip_cacheQueries.clearSegments(
                    malId = malId.toLong(),
                    episodeNumber = episodeNumber.toLong(),
                )
                remote.forEach { segment ->
                    aniskip_cacheQueries.upsert(
                        malId = malId.toLong(),
                        episodeNumber = episodeNumber.toLong(),
                        skipType = segment.skipType,
                        startTimeMs = segment.startTimeMs,
                        endTimeMs = segment.endTimeMs,
                        fetchedAt = now,
                    )
                }
            }
            return remote.map(::mapRemoteToDomain)
        }

        return cached.map(::mapCachedToDomain)
    }

    override suspend fun getMalIdFromAniList(aniListId: Long): Long? {
        return runCatching {
            api.getMalIdFromAniList(aniListId)
        }.getOrNull()
    }

    private fun mapRemoteToDomain(segment: RemoteSkipSegment): SkipSegment {
        return SkipSegment(
            type = mapType(segment.skipType),
            startMs = segment.startTimeMs,
            endMs = segment.endTimeMs,
        )
    }

    private fun mapCachedToDomain(segment: tachiyomi.data.Aniskip_cache): SkipSegment {
        return SkipSegment(
            type = mapType(segment.skip_type),
            startMs = segment.start_time_ms,
            endMs = segment.end_time_ms,
        )
    }

    private fun mapType(value: String): SkipSegmentType {
        return when (value.lowercase()) {
            "op" -> SkipSegmentType.OP
            "ed" -> SkipSegmentType.ED
            "recap" -> SkipSegmentType.RECAP
            "mixed-op" -> SkipSegmentType.MIXED_OP
            "mixed-ed" -> SkipSegmentType.MIXED_ED
            else -> SkipSegmentType.OP
        }
    }

    companion object {
        private val STALE_MS = 7.days.inWholeMilliseconds
    }
}
