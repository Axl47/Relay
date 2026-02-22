package tachiyomi.data.source

import tachiyomi.data.DatabaseHandler
import tachiyomi.domain.source.model.SourceHealth
import tachiyomi.domain.source.model.SourcePriority
import tachiyomi.domain.source.repository.SourceHealthRepository

class SourceHealthRepositoryImpl(
    private val handler: DatabaseHandler,
) : SourceHealthRepository {

    override suspend fun recordSuccess(sourceId: String, responseTimeMs: Long) {
        handler.await {
            source_healthQueries.upsertSuccess(
                sourceId = sourceId,
                now = System.currentTimeMillis(),
                responseTimeMs = responseTimeMs,
            )
        }
    }

    override suspend fun recordFailure(sourceId: String) {
        handler.await {
            source_healthQueries.upsertFailure(
                sourceId = sourceId,
                now = System.currentTimeMillis(),
            )
        }
    }

    override suspend fun getHealth(sourceId: String): SourceHealth? {
        return handler.awaitOneOrNull {
            source_healthQueries.get(sourceId)
        }?.let {
            SourceHealth(
                sourceId = it.source_id,
                lastCheck = it.last_check,
                status = mapStatus(it.status),
                avgResponseMs = it.avg_response_ms,
                failureCount = it.failure_count,
                lastFailure = it.last_failure,
            )
        }
    }

    override suspend fun getPriorities(animeId: Long): List<SourcePriority> {
        return handler.awaitList {
            anime_source_priorityQueries.getByAnimeId(animeId)
        }.map {
            SourcePriority(
                animeId = it.anime_id,
                sourceId = it.source_id,
                priority = it.priority,
            )
        }
    }

    override suspend fun setSourcePriority(animeId: Long, sourceId: String, priority: Long) {
        handler.await {
            anime_source_priorityQueries.upsert(
                animeId = animeId,
                sourceId = sourceId,
                priority = priority,
            )
        }
    }

    override suspend fun setSourcePriorities(animeId: Long, sourceIds: List<String>) {
        handler.await(inTransaction = true) {
            anime_source_priorityQueries.clearByAnimeId(animeId)
            sourceIds.forEachIndexed { index, sourceId ->
                anime_source_priorityQueries.upsert(
                    animeId = animeId,
                    sourceId = sourceId,
                    priority = index.toLong(),
                )
            }
        }
    }

    override suspend fun clearPriorities(animeId: Long) {
        handler.await {
            anime_source_priorityQueries.clearByAnimeId(animeId)
        }
    }

    private fun mapStatus(value: String): SourceHealth.Status {
        return when (value.lowercase()) {
            "healthy" -> SourceHealth.Status.HEALTHY
            "degraded" -> SourceHealth.Status.DEGRADED
            "dead" -> SourceHealth.Status.DEAD
            else -> SourceHealth.Status.UNKNOWN
        }
    }
}
