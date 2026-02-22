package eu.kanade.tachiyomi.ui.player.utils

import eu.kanade.tachiyomi.animesource.model.ChapterType
import eu.kanade.tachiyomi.animesource.model.TimeStamp
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import tachiyomi.domain.aniskip.model.SkipSegmentType
import tachiyomi.domain.aniskip.repository.AniSkipRepository
import uy.kohesive.injekt.injectLazy

@Deprecated("Use AniSkipRepository directly from the data/domain layer.")
class AniSkipApi {
    private val aniSkipRepository: AniSkipRepository by injectLazy()

    // credits: https://github.com/saikou-app/saikou/blob/main/app/src/main/java/ani/saikou/others/AniSkip.kt
    fun getResult(malId: Int, episodeNumber: Int, episodeLength: Long): List<TimeStamp>? {
        return runCatching {
            runBlocking {
                aniSkipRepository
                    .getSkipTimes(
                        malId = malId,
                        episodeNumber = episodeNumber,
                        episodeLength = episodeLength,
                    )
                    .map { segment ->
                        val type = when (segment.type) {
                            SkipSegmentType.OP -> SkipType.OP
                            SkipSegmentType.ED -> SkipType.ED
                            SkipSegmentType.RECAP -> SkipType.RECAP
                            SkipSegmentType.MIXED_OP -> SkipType.MIXED_OP
                            SkipSegmentType.MIXED_ED -> SkipType.MIXED_ED
                        }

                        TimeStamp(
                            start = segment.startMs / 1000.0,
                            end = segment.endMs / 1000.0,
                            name = type.getString(),
                            type = type.toChapterType(),
                        )
                    }
            }.takeIf { it.isNotEmpty() }
        }.getOrNull()
    }

    fun getMalIdFromAL(id: Long): Long {
        return runBlocking {
            aniSkipRepository.getMalIdFromAniList(id) ?: 0L
        }
    }
}

@Serializable
data class AniSkipResponse(
    val found: Boolean,
    val results: List<Stamp>?,
)

@Serializable
data class Stamp(
    val interval: AniSkipInterval,
    val skipType: SkipType,
)

@Serializable
enum class SkipType {
    @SerialName("op")
    OP,

    @SerialName("ed")
    ED,

    @SerialName("recap")
    RECAP,

    @SerialName("mixed-op")
    MIXED_OP,

    @SerialName("mixed-ed")
    MIXED_ED, ;

    fun getString(): String {
        return when (this) {
            OP -> "Opening"
            ED -> "Ending"
            RECAP -> "Recap"
            MIXED_OP -> "Mixed-op"
            MIXED_ED -> "Mixed-ed"
        }
    }

    fun toChapterType(): ChapterType {
        return when (this) {
            OP -> ChapterType.Opening
            ED -> ChapterType.Ending
            RECAP -> ChapterType.Recap
            MIXED_OP -> ChapterType.MixedOp
            MIXED_ED -> ChapterType.Ending
        }
    }
}

@Serializable
data class AniSkipInterval(
    val startTime: Double,
    val endTime: Double,
)
