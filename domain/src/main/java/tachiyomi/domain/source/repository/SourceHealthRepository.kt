package tachiyomi.domain.source.repository

import tachiyomi.domain.source.model.SourceHealth
import tachiyomi.domain.source.model.SourcePriority

interface SourceHealthRepository {

    suspend fun recordSuccess(sourceId: String, responseTimeMs: Long)

    suspend fun recordFailure(sourceId: String)

    suspend fun getHealth(sourceId: String): SourceHealth?

    suspend fun getPriorities(animeId: Long): List<SourcePriority>

    suspend fun setSourcePriority(animeId: Long, sourceId: String, priority: Long)

    suspend fun setSourcePriorities(animeId: Long, sourceIds: List<String>)

    suspend fun clearPriorities(animeId: Long)
}
