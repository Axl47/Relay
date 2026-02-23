package tachiyomi.data.filler

import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.network.awaitSuccess
import eu.kanade.tachiyomi.network.parseAs
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl

class FillerApi(
    private val networkService: NetworkHelper,
    private val json: Json,
) {

    suspend fun getEpisodes(
        malId: Long,
        page: Int,
    ): RemoteFillerPage {
        val url = "https://api.jikan.moe/v4/anime/$malId/episodes".toHttpUrl()
            .newBuilder()
            .addQueryParameter("page", page.toString())
            .build()

        return with(json) {
            networkService.client
                .newCall(GET(url))
                .awaitSuccess()
                .parseAs<RemoteFillerPage>()
        }
    }
}

@Serializable
data class RemoteFillerPage(
    val data: List<RemoteEpisode>,
    val pagination: RemotePagination? = null,
)

@Serializable
data class RemoteEpisode(
    @SerialName("mal_id")
    val malId: Long,
    val filler: Boolean? = null,
    val recap: Boolean? = null,
)

@Serializable
data class RemotePagination(
    @SerialName("has_next_page")
    val hasNextPage: Boolean = false,
)
