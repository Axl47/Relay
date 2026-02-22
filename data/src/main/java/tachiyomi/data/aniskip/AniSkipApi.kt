package tachiyomi.data.aniskip

import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.network.POST
import eu.kanade.tachiyomi.network.awaitSuccess
import eu.kanade.tachiyomi.network.jsonMime
import eu.kanade.tachiyomi.network.parseAs
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrl

class AniSkipApi(
    private val networkService: NetworkHelper,
    private val json: Json,
) {

    suspend fun getSkipTimes(
        malId: Int,
        episodeNumber: Int,
        episodeLength: Long,
    ): List<RemoteSkipSegment> {
        val url = "https://api.aniskip.com/v2/skip-times/$malId/$episodeNumber".toHttpUrl()
            .newBuilder()
            .addQueryParameter("types[]", "op")
            .addQueryParameter("types[]", "ed")
            .addQueryParameter("types[]", "recap")
            .addQueryParameter("types[]", "mixed-op")
            .addQueryParameter("types[]", "mixed-ed")
            .addQueryParameter("episodeLength", episodeLength.toString())
            .build()

        return with(json) {
            networkService.client
                .newCall(GET(url))
                .awaitSuccess()
                .parseAs<AniSkipResponse>()
                .results
                ?.map {
                    RemoteSkipSegment(
                        skipType = it.skipType,
                        startTimeMs = (it.interval.startTime * 1000).toLong(),
                        endTimeMs = (it.interval.endTime * 1000).toLong(),
                    )
                }
                .orEmpty()
        }
    }

    suspend fun getMalIdFromAniList(aniListId: Long): Long? {
        val query = """
            query{
                Media(id:$aniListId){idMal}
            }
        """.trimIndent()

        val payload = buildJsonObject {
            put("query", query)
        }

        return with(json) {
            networkService.client
                .newCall(
                    POST(
                        "https://graphql.anilist.co",
                        body = payload.toString().toRequestBody(jsonMime),
                    ),
                )
                .awaitSuccess()
                .parseAs<AniListResponse>()
                .data
                ?.media
                ?.idMal
        }
    }
}

data class RemoteSkipSegment(
    val skipType: String,
    val startTimeMs: Long,
    val endTimeMs: Long,
)

@Serializable
private data class AniSkipResponse(
    val results: List<AniSkipSegment>?,
)

@Serializable
private data class AniSkipSegment(
    val interval: AniSkipInterval,
    @SerialName("skipType")
    val skipType: String,
)

@Serializable
private data class AniSkipInterval(
    val startTime: Double,
    val endTime: Double,
)

@Serializable
private data class AniListResponse(
    val data: AniListMediaData?,
)

@Serializable
private data class AniListMediaData(
    @SerialName("Media")
    val media: AniListMedia?,
)

@Serializable
private data class AniListMedia(
    val idMal: Long?,
)
