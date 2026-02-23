package tachiyomi.domain.capture.model

enum class CaptureType {
    BOOKMARK,
    SCREENSHOT,
    CLIP,
    ;

    companion object {
        fun fromDb(value: String): CaptureType {
            return when (value.lowercase()) {
                "bookmark" -> BOOKMARK
                "clip" -> CLIP
                else -> SCREENSHOT
            }
        }
    }

    fun toDbValue(): String {
        return when (this) {
            BOOKMARK -> "bookmark"
            SCREENSHOT -> "screenshot"
            CLIP -> "clip"
        }
    }
}
