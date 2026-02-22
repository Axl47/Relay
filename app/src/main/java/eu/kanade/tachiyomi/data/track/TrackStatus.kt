package eu.kanade.tachiyomi.data.track

import androidx.annotation.StringRes
import eu.kanade.tachiyomi.R
import eu.kanade.tachiyomi.data.track.anilist.Anilist
import eu.kanade.tachiyomi.data.track.myanimelist.MyAnimeList

@Suppress("MagicNumber")
enum class TrackStatus(val int: Long, @StringRes val res: Int) {
    READING(1, R.string.reading),
    WATCHING(11, R.string.watching),
    REPEATING(2, R.string.repeating),
    REWATCHING(17, R.string.repeating_anime),
    PLAN_TO_READ(3, R.string.plan_to_read),
    PLAN_TO_WATCH(16, R.string.plan_to_watch),
    PAUSED(4, R.string.on_hold),
    COMPLETED(5, R.string.completed),
    DROPPED(6, R.string.dropped),
    OTHER(7, R.string.not_tracked),
    ;

    companion object {
        @Suppress("MagicNumber", "LongMethod", "CyclomaticComplexMethod")
        fun parseTrackerStatus(tracker: Long, statusLong: Long): TrackStatus? {
            return when (tracker) {
                (1L) -> {
                    when (statusLong) {
                        MyAnimeList.READING -> READING
                        MyAnimeList.WATCHING -> WATCHING
                        MyAnimeList.COMPLETED -> COMPLETED
                        MyAnimeList.ON_HOLD -> PAUSED
                        MyAnimeList.PLAN_TO_READ -> PLAN_TO_READ
                        MyAnimeList.PLAN_TO_WATCH -> PLAN_TO_WATCH
                        MyAnimeList.DROPPED -> DROPPED
                        MyAnimeList.REREADING -> REPEATING
                        MyAnimeList.REWATCHING -> REWATCHING
                        else -> null
                    }
                }
                TrackerManager.ANILIST -> {
                    when (statusLong) {
                        Anilist.READING -> READING
                        Anilist.WATCHING -> WATCHING
                        Anilist.REWATCHING -> REWATCHING
                        Anilist.PLAN_TO_READ -> PLAN_TO_READ
                        Anilist.PLAN_TO_WATCH -> PLAN_TO_WATCH
                        Anilist.REREADING -> REPEATING
                        Anilist.ON_HOLD -> PAUSED
                        Anilist.COMPLETED -> COMPLETED
                        Anilist.DROPPED -> DROPPED
                        else -> null
                    }
                }
                else -> null
            }
        }
    }
}
