package tachiyomi.domain.episode.model

enum class EpisodeType {
    CANON,
    FILLER,
    MIXED,
    RECAP,
    UNKNOWN,
    ;

    companion object {
        fun fromDb(value: String?): EpisodeType {
            return when (value?.lowercase()) {
                "canon" -> CANON
                "filler" -> FILLER
                "mixed" -> MIXED
                "recap" -> RECAP
                else -> UNKNOWN
            }
        }
    }

    fun toDbValue(): String {
        return when (this) {
            CANON -> "canon"
            FILLER -> "filler"
            MIXED -> "mixed"
            RECAP -> "recap"
            UNKNOWN -> "canon"
        }
    }
}
