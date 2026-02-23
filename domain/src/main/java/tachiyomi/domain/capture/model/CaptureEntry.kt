package tachiyomi.domain.capture.model

data class CaptureEntry(
    val id: Long,
    val animeId: Long,
    val episodeId: Long?,
    val type: CaptureType,
    val mediaUri: String?,
    val positionMs: Long,
    val note: String?,
    val createdAt: Long,
)
