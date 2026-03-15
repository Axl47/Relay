package eu.kanade.tachiyomi.network.interceptor

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.ContextCompat
import eu.kanade.tachiyomi.network.AndroidCookieJar
import eu.kanade.tachiyomi.util.system.isOutdated
import eu.kanade.tachiyomi.util.system.toast
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import tachiyomi.core.common.i18n.stringResource
import tachiyomi.i18n.MR
import java.io.IOException
import java.util.concurrent.CountDownLatch

class CloudflareInterceptor(
    private val context: Context,
    private val cookieManager: AndroidCookieJar,
    defaultUserAgentProvider: () -> String,
) : WebViewInterceptor(context, defaultUserAgentProvider) {

    private val executor = ContextCompat.getMainExecutor(context)

    override fun shouldIntercept(response: Response): Boolean {
        return response.challengeProtection() != null
    }

    override fun intercept(
        chain: Interceptor.Chain,
        request: Request,
        response: Response,
    ): Response {
        val protection = response.challengeProtection() ?: return response
        try {
            response.close()
            val oldCookies = protection.cookieSnapshot(cookieManager, request.url)
            cookieManager.remove(request.url, protection.cookiesToClear, 0)
            resolveWithWebView(request, protection, oldCookies)

            return chain.proceed(request)
        }
        // Because OkHttp's enqueue only handles IOExceptions, wrap the exception so that
        // we don't crash the entire app
        catch (e: CloudflareBypassException) {
            throw IOException(context.stringResource(MR.strings.information_cloudflare_bypass_failure), e)
        } catch (e: Exception) {
            throw IOException(e)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun resolveWithWebView(
        originalRequest: Request,
        protection: AntiBotProtection,
        oldCookies: Set<Pair<String, String>>,
    ) {
        // We need to lock this thread until the WebView finds the challenge solution url, because
        // OkHttp doesn't support asynchronous interceptors.
        val latch = CountDownLatch(1)

        var webview: WebView? = null

        var challengeFound = false
        var cloudflareBypassed = false
        var isWebViewOutdated = false

        val requestUrl = originalRequest.url
        val origRequestUrl = requestUrl.toString()
        val headers = parseHeaders(originalRequest.headers)

        executor.execute {
            webview = createWebView(originalRequest)

            webview?.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    if (protection.isBypassed(cookieManager, requestUrl, oldCookies)) {
                        cloudflareBypassed = true
                        latch.countDown()
                    }

                    if (url == origRequestUrl && !challengeFound) {
                        // The first request didn't return the challenge, abort.
                        latch.countDown()
                    }
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) {
                        if (error.errorCode in ERROR_CODES) {
                            // Found the Cloudflare challenge page.
                            challengeFound = true
                        } else {
                            // Unlock thread, the challenge wasn't found.
                            latch.countDown()
                        }
                    }
                }
            }

            webview?.loadUrl(origRequestUrl, headers)
        }

        latch.awaitFor30Seconds()

        executor.execute {
            if (!cloudflareBypassed) {
                isWebViewOutdated = webview?.isOutdated() == true
            }

            webview?.run {
                stopLoading()
                destroy()
            }
        }

        // Throw exception if we failed to bypass Cloudflare
        if (!cloudflareBypassed) {
            // Prompt user to update WebView if it seems too outdated
            if (isWebViewOutdated) {
                context.toast(MR.strings.information_webview_outdated, Toast.LENGTH_LONG)
            }

            throw CloudflareBypassException()
        }
    }
}

private val ERROR_CODES = listOf(403, 503)

private enum class AntiBotProtection(
    val serverHeaders: Set<String>,
    val cookiesToClear: List<String>?,
) {
    CLOUDFLARE(
        serverHeaders = setOf("cloudflare-nginx", "cloudflare"),
        cookiesToClear = listOf("cf_clearance"),
    ) {
        override fun isBypassed(
            cookieManager: AndroidCookieJar,
            requestUrl: okhttp3.HttpUrl,
            oldCookies: Set<Pair<String, String>>,
        ): Boolean {
            val newCookies = cookieSnapshot(cookieManager, requestUrl)
            return newCookies.isNotEmpty() && newCookies != oldCookies
        }

        override fun matchesCookie(name: String): Boolean = name == "cf_clearance"
    },
    DDOS_GUARD(
        serverHeaders = setOf("ddos-guard"),
        cookiesToClear = null,
    ) {
        override fun isBypassed(
            cookieManager: AndroidCookieJar,
            requestUrl: okhttp3.HttpUrl,
            oldCookies: Set<Pair<String, String>>,
        ): Boolean {
            return cookieSnapshot(cookieManager, requestUrl).isNotEmpty()
        }

        override fun matchesCookie(name: String): Boolean = name.startsWith("__ddg")
    },
    ;

    abstract fun matchesCookie(name: String): Boolean

    abstract fun isBypassed(
        cookieManager: AndroidCookieJar,
        requestUrl: okhttp3.HttpUrl,
        oldCookies: Set<Pair<String, String>>,
    ): Boolean

    fun cookieSnapshot(
        cookieManager: AndroidCookieJar,
        requestUrl: okhttp3.HttpUrl,
    ): Set<Pair<String, String>> {
        return cookieManager.get(requestUrl)
            .filter { matchesCookie(it.name) }
            .map { it.name to it.value }
            .toSet()
    }
}

private fun Response.challengeProtection(): AntiBotProtection? {
    if (code !in ERROR_CODES) return null

    val server = header("Server")?.lowercase() ?: return null
    return AntiBotProtection.entries.firstOrNull { server in it.serverHeaders }
}

private class CloudflareBypassException : Exception()
