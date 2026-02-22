package tachiyomi.domain.aniskip.model

data class SkipSegment(
    val type: SkipSegmentType,
    val startMs: Long,
    val endMs: Long,
)

enum class SkipSegmentType {
    OP,
    ED,
    RECAP,
    MIXED_OP,
    MIXED_ED,
}
