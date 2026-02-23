package eu.kanade.tachiyomi.extension.util

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import eu.kanade.tachiyomi.R
import eu.kanade.tachiyomi.data.notification.Notifications
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.util.system.notificationBuilder
import eu.kanade.tachiyomi.util.system.setForegroundSafely
import eu.kanade.tachiyomi.util.system.workManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import logcat.LogPriority
import okhttp3.Headers
import tachiyomi.core.common.util.system.logcat
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

class ExtensionInstallJob(
    private val context: Context,
    workerParams: WorkerParameters,
) : androidx.work.CoroutineWorker(context, workerParams) {

    private val network: NetworkHelper = Injekt.get()

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val extensionName = inputData.getString(KEY_EXTENSION_NAME).orEmpty()
        val title = if (extensionName.isBlank()) {
            context.getString(R.string.app_name)
        } else {
            extensionName
        }
        val notification = context.notificationBuilder(Notifications.CHANNEL_EXTENSIONS_UPDATE) {
            setSmallIcon(R.mipmap.ic_launcher)
            setAutoCancel(false)
            setOngoing(true)
            setShowWhen(false)
            setContentTitle(title)
            setProgress(100, 0, true)
        }.build()

        return ForegroundInfo(
            Notifications.ID_EXTENSION_INSTALLER,
            notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            } else {
                0
            },
        )
    }

    override suspend fun doWork(): Result = coroutineScope {
        val apkUrl = inputData.getString(KEY_APK_URL).orEmpty()
        val pkgName = inputData.getString(KEY_PACKAGE_NAME).orEmpty()
        if (apkUrl.isBlank() || pkgName.isBlank()) {
            return@coroutineScope Result.failure(errorData("Missing extension install inputs"))
        }

        setForegroundSafely()

        val extDir = File(context.cacheDir, EXTENSION_DOWNLOAD_DIR).apply { mkdirs() }
        val partialApk = File(extDir, "$pkgName.apk.part")
        val finalApk = File(extDir, "$pkgName.apk")

        return@coroutineScope try {
            setProgress(progressData(PHASE_DOWNLOADING, 0))
            downloadWithResume(apkUrl, partialApk)

            setProgress(progressData(PHASE_INSTALLING, 100))
            withContext(Dispatchers.IO) {
                if (finalApk.exists()) {
                    finalApk.delete()
                }
                if (!partialApk.renameTo(finalApk)) {
                    partialApk.copyTo(finalApk, overwrite = true)
                    partialApk.delete()
                }
            }

            val installed = withContext(Dispatchers.IO) {
                ExtensionLoader.installPrivateExtensionFile(context, finalApk)
            }

            withContext(Dispatchers.IO) {
                finalApk.delete()
            }

            if (installed) {
                Result.success()
            } else {
                Result.failure(errorData("Failed to install extension package"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logcat(LogPriority.ERROR, e) { "Failed to install extension for $pkgName" }
            Result.failure(errorData(e.message ?: "Unknown extension install error"))
        }
    }

    private suspend fun downloadWithResume(url: String, partialApk: File) {
        val client = network.clientWithTimeOut(readTimeout = 60, callTimeout = 120)
        var attempt = 0

        while (attempt < MAX_DOWNLOAD_RETRY) {
            currentCoroutineContext().ensureActive()
            try {
                val existingSize = partialApk.takeIf(File::exists)?.length()?.coerceAtLeast(0L) ?: 0L
                val requestHeaders = Headers.Builder().apply {
                    if (existingSize > 0L) {
                        add("Range", "bytes=$existingSize-")
                    }
                }.build()
                val request = GET(url = url, headers = requestHeaders)
                client.newCall(request).execute().use { response ->
                    val isResumeResponse = response.code == PARTIAL_CONTENT_STATUS && existingSize > 0L
                    if (!response.isSuccessful && !isResumeResponse) {
                        throw IOException("Unexpected response code ${response.code}")
                    }

                    val startingBytes = if (isResumeResponse) existingSize else 0L
                    withContext(Dispatchers.IO) {
                        if (!isResumeResponse && existingSize > 0L && partialApk.exists()) {
                            partialApk.delete()
                        }
                        partialApk.parentFile?.mkdirs()
                    }

                    val body = response.body ?: throw IOException("Empty response body")
                    writeResponseBody(
                        bodyBytesLength = body.contentLength(),
                        startingBytes = startingBytes,
                        partialApk = partialApk,
                        input = body.byteStream(),
                    )
                }
                return
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                attempt++
                if (attempt >= MAX_DOWNLOAD_RETRY) {
                    throw e
                }
                delay((attempt * DOWNLOAD_RETRY_DELAY_MS).coerceAtMost(MAX_RETRY_DELAY_MS))
            }
        }
    }

    private suspend fun writeResponseBody(
        bodyBytesLength: Long,
        startingBytes: Long,
        partialApk: File,
        input: java.io.InputStream,
    ) {
        val totalBytes = if (bodyBytesLength > 0L) startingBytes + bodyBytesLength else -1L
        var downloadedBytes = startingBytes
        var lastProgress = if (totalBytes > 0L) {
            ((downloadedBytes * 100L) / totalBytes).toInt().coerceIn(0, 99)
        } else {
            0
        }
        setProgress(progressData(PHASE_DOWNLOADING, lastProgress))

        withContext(Dispatchers.IO) {
            input.use { stream ->
                partialApk.outputStream().buffered(DEFAULT_BUFFER_SIZE).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val read = stream.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        downloadedBytes += read

                        if (totalBytes > 0L) {
                            val progress = ((downloadedBytes * 100L) / totalBytes).toInt().coerceIn(0, 99)
                            if (progress != lastProgress) {
                                lastProgress = progress
                                setProgress(progressData(PHASE_DOWNLOADING, progress))
                            }
                        }
                    }
                    output.flush()
                }
            }
        }
    }

    companion object {
        private const val EXTENSION_DOWNLOAD_DIR = "extension_downloads"
        private const val MAX_DOWNLOAD_RETRY = 3
        private const val DOWNLOAD_RETRY_DELAY_MS = 1500L
        private const val MAX_RETRY_DELAY_MS = 5000L
        private const val PARTIAL_CONTENT_STATUS = 206

        const val KEY_APK_URL = "key_apk_url"
        const val KEY_PACKAGE_NAME = "key_package_name"
        const val KEY_EXTENSION_NAME = "key_extension_name"
        const val KEY_PHASE = "key_phase"
        const val KEY_PROGRESS = "key_progress"
        const val KEY_ERROR = "key_error"

        const val PHASE_DOWNLOADING = "downloading"
        const val PHASE_INSTALLING = "installing"

        fun workName(pkgName: String): String = "ExtensionInstall:$pkgName"

        fun enqueue(
            context: Context,
            apkUrl: String,
            packageName: String,
            extensionName: String,
        ) {
            val request = OneTimeWorkRequestBuilder<ExtensionInstallJob>()
                .setInputData(
                    workDataOf(
                        KEY_APK_URL to apkUrl,
                        KEY_PACKAGE_NAME to packageName,
                        KEY_EXTENSION_NAME to extensionName,
                    ),
                )
                .setBackoffCriteria(BackoffPolicy.LINEAR, 10, TimeUnit.SECONDS)
                .build()
            context.workManager.enqueueUniqueWork(
                workName(packageName),
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }

        private fun progressData(phase: String, progress: Int): Data {
            return workDataOf(
                KEY_PHASE to phase,
                KEY_PROGRESS to progress,
            )
        }

        private fun errorData(message: String): Data {
            return workDataOf(KEY_ERROR to message)
        }
    }
}
