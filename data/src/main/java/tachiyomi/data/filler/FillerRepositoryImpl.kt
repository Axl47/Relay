package tachiyomi.data.filler

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import tachiyomi.data.DatabaseHandler
import tachiyomi.domain.episode.model.EpisodeType
import tachiyomi.domain.filler.repository.FillerRepository
import kotlin.time.Duration.Companion.days

class FillerRepositoryImpl(
    private val handler: DatabaseHandler,
    private val api: FillerApi,
) : FillerRepository {

    override suspend fun getEpisodeTypes(malId: Long): Map<Double, EpisodeType> {
        val now = System.currentTimeMillis()
        val cached = handler.awaitList { filler_cacheQueries.getByMalId(malId) }
        if (cached.isNotEmpty() && cached.all { now - it.fetched_at <= STALE_MS }) {
            return cached.associate { it.episode_number to EpisodeType.fromDb(it.episode_type) }
        }

        val remoteEpisodes = runCatching { fetchAllEpisodes(malId) }.getOrNull()
        if (remoteEpisodes != null) {
            handler.await(inTransaction = true) {
                filler_cacheQueries.clearByMalId(malId)
                remoteEpisodes.forEach { episode ->
                    filler_cacheQueries.upsert(
                        malId = malId,
                        episodeNumber = episode.malId.toDouble(),
                        episodeType = episode.toEpisodeType().toDbValue(),
                        fetchedAt = now,
                    )
                }
            }

            return remoteEpisodes.associate { it.malId.toDouble() to it.toEpisodeType() }
        }

        return cached.associate { it.episode_number to EpisodeType.fromDb(it.episode_type) }
    }

    private suspend fun fetchAllEpisodes(malId: Long): List<RemoteEpisode> {
        val items = mutableListOf<RemoteEpisode>()
        var page = 1
        while (true) {
            throttleLock.withLock {
                val elapsed = System.currentTimeMillis() - lastRequestAtMs
                val delayMs = (MIN_REQUEST_SPACING_MS - elapsed).coerceAtLeast(0L)
                if (delayMs > 0) delay(delayMs)
                lastRequestAtMs = System.currentTimeMillis()
            }

            val response = api.getEpisodes(malId = malId, page = page)
            items += response.data
            if (response.pagination?.hasNextPage != true) break
            page++
        }
        return items
    }

    private fun RemoteEpisode.toEpisodeType(): EpisodeType {
        return when {
            recap == true -> EpisodeType.RECAP
            filler == true -> EpisodeType.FILLER
            else -> EpisodeType.CANON
        }
    }

    companion object {
        private val STALE_MS = 7.days.inWholeMilliseconds
        private const val MIN_REQUEST_SPACING_MS = 333L

        private val throttleLock = Mutex()
        private var lastRequestAtMs = 0L
    }
}
