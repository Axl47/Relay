package tachiyomi.domain.source.model

data class SourceHealth(
    val sourceId: String,
    val lastCheck: Long,
    val status: Status,
    val avgResponseMs: Long,
    val failureCount: Long,
    val lastFailure: Long,
) {
    enum class Status {
        UNKNOWN,
        HEALTHY,
        DEGRADED,
        DEAD,
    }

    val healthScore: Int
        get() = when (status) {
            Status.HEALTHY -> 3
            Status.UNKNOWN -> 2
            Status.DEGRADED -> 1
            Status.DEAD -> 0
        }
}
