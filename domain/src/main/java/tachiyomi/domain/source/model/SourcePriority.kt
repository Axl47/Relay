package tachiyomi.domain.source.model

data class SourcePriority(
    val animeId: Long,
    val sourceId: String,
    val priority: Long,
)
