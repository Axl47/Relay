package eu.kanade.tachiyomi.ui.player

import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.source.online.HttpSource
import okhttp3.Headers
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

object StreamRequestHeaders {

    fun resolve(source: HttpSource, video: Video, streamUrl: String): Headers {
        val cookieHeader = streamUrl
            .toHttpUrlOrNull()
            ?.let { url ->
                source.client.cookieJar.loadForRequest(url)
                    .takeIf { it.isNotEmpty() }
                    ?.joinToString("; ") { cookie -> "${cookie.name}=${cookie.value}" }
            }

        return merge(
            baseHeaders = source.headers,
            overrideHeaders = video.headers,
            cookieHeader = cookieHeader,
        )
    }

    internal fun merge(
        baseHeaders: Headers,
        overrideHeaders: Headers?,
        cookieHeader: String?,
    ): Headers {
        val mergedBuilder = Headers.Builder().apply {
            addAll(baseHeaders)
        }

        overrideHeaders?.let { headers ->
            headers.names().forEach { name ->
                mergedBuilder.removeAll(name)
                headers.values(name).forEach { value ->
                    mergedBuilder.add(name, value)
                }
            }
        }

        if (!containsHeader(mergedBuilder.build(), "Cookie") && !cookieHeader.isNullOrBlank()) {
            mergedBuilder.add("Cookie", cookieHeader)
        }

        return mergedBuilder.build()
    }

    fun toMpvHttpHeaderFields(headers: Headers): String {
        return headers.toList()
            .joinToString(",") { (key, value) ->
                "$key: ${value.replace(",", "\\,")}"
            }
    }

    fun toFfmpegHeaderValue(headers: Headers): String? {
        if (headers.size == 0) return null
        return headers.toList().joinToString("") { (key, value) ->
            "$key: $value\r\n"
        }
    }

    private fun containsHeader(headers: Headers, headerName: String): Boolean {
        return headers.names().any { it.equals(headerName, ignoreCase = true) }
    }
}
