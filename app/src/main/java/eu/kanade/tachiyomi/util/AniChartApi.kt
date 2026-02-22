package eu.kanade.tachiyomi.util
import eu.kanade.tachiyomi.data.track.anilist.Anilist
import eu.kanade.tachiyomi.data.track.myanimelist.MyAnimeList
import eu.kanade.tachiyomi.network.POST
import eu.kanade.tachiyomi.network.jsonMime
import eu.kanade.tachiyomi.source.model.SAnime
import eu.kanade.tachiyomi.ui.anime.track.TrackItem
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import tachiyomi.core.common.util.lang.withIOContext
import tachiyomi.domain.anime.model.Anime
import java.time.OffsetDateTime

class AniChartApi {
    private val client = OkHttpClient()

    internal suspend fun loadAiringTime(
        anime: Anime,
        trackItems: List<TrackItem>,
        manualFetch: Boolean,
    ): Pair<Int, Long> {
        var airingEpisodeData = Pair(anime.nextEpisodeToAir, anime.nextEpisodeAiringAt)
        if (anime.status == SAnime.COMPLETED.toLong() && !manualFetch) return airingEpisodeData

        return withIOContext {
            val matchingTrackItem = trackItems.firstOrNull {
                (it.tracker is Anilist && it.track != null) ||
                    (it.tracker is MyAnimeList && it.track != null)
            } ?: return@withIOContext Pair(1, 0L)

            matchingTrackItem.let { item ->
                item.track!!.let {
                    airingEpisodeData = when (item.tracker) {
                        is Anilist -> getAnilistAiringEpisodeData(it.remoteId)
                        is MyAnimeList -> getAnilistAiringEpisodeData(getAlIdFromMal(it.remoteId))
                        else -> Pair(1, 0L)
                    }
                }
            }
            return@withIOContext airingEpisodeData
        }
    }

    private suspend fun getAlIdFromMal(idMal: Long): Long {
        return withIOContext {
            val query = """
                query {
                    Media(idMal:$idMal,type: ANIME) {
                        id
                    }
                }
            """.trimMargin()

            val response = try {
                client.newCall(
                    POST(
                        "https://graphql.anilist.co",
                        body = buildJsonObject { put("query", query) }.toString()
                            .toRequestBody(jsonMime),
                    ),
                ).execute()
            } catch (e: Exception) {
                return@withIOContext 0L
            }
            return@withIOContext response.body.string().substringAfter("id\":")
                .substringBefore("}")
                .toLongOrNull() ?: 0L
        }
    }

    private suspend fun getAnilistAiringEpisodeData(id: Long): Pair<Int, Long> {
        return withIOContext {
            val query = """
                query {
                    Media(id:$id) {
                        nextAiringEpisode {
                            episode
                            airingAt
                        }
                    }
                }
            """.trimMargin()
            val response = try {
                client.newCall(
                    POST(
                        "https://graphql.anilist.co",
                        body = buildJsonObject { put("query", query) }.toString()
                            .toRequestBody(jsonMime),
                    ),
                ).execute()
            } catch (e: Exception) {
                return@withIOContext Pair(1, 0L)
            }
            val data = response.body.string()
            val episodeNumber = data.substringAfter("episode\":").substringBefore(",").toIntOrNull() ?: 1
            val airingAt = data.substringAfter("airingAt\":").substringBefore("}").toLongOrNull() ?: 0L

            return@withIOContext Pair(episodeNumber, airingAt)
        }
    }

    private fun toUnixTimestamp(dateFormat: String): Long {
        val offsetDateTime = OffsetDateTime.parse(dateFormat)
        val instant = offsetDateTime.toInstant()
        return instant.epochSecond
    }
}
