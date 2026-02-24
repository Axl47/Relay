package eu.kanade.tachiyomi.data.download

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.FFprobeSession
import com.arthenica.ffmpegkit.Level
import com.arthenica.ffmpegkit.LogCallback
import com.arthenica.ffmpegkit.ReturnCode
import com.arthenica.ffmpegkit.SessionState
import com.arthenica.ffmpegkit.StatisticsCallback
import com.hippo.unifile.UniFile
import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.data.download.model.Download
import eu.kanade.tachiyomi.data.library.LibraryUpdateNotifier
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.HttpException
import eu.kanade.tachiyomi.network.ProgressListener
import eu.kanade.tachiyomi.network.awaitSuccess
import eu.kanade.tachiyomi.network.newCachelessCallWithProgress
import eu.kanade.tachiyomi.data.notification.NotificationHandler
import eu.kanade.tachiyomi.data.torrentServer.service.TorrentServerService
import eu.kanade.tachiyomi.source.UnmeteredSource
import eu.kanade.tachiyomi.source.online.HttpSource
import eu.kanade.tachiyomi.torrentServer.TorrentServerApi
import eu.kanade.tachiyomi.torrentServer.TorrentServerUtils
import eu.kanade.tachiyomi.ui.player.StreamRequestHeaders
import eu.kanade.tachiyomi.ui.player.controls.components.sheets.HosterState
import eu.kanade.tachiyomi.ui.player.controls.components.sheets.getChangedAt
import eu.kanade.tachiyomi.ui.player.loader.EpisodeLoader
import eu.kanade.tachiyomi.ui.player.loader.HosterLoader
import eu.kanade.tachiyomi.util.storage.DiskUtil
import eu.kanade.tachiyomi.util.storage.toFFmpegString
import eu.kanade.tachiyomi.util.system.copyToClipboard
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.transformLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withContext
import logcat.LogPriority
import tachiyomi.core.common.i18n.stringResource
import tachiyomi.core.common.storage.extension
import tachiyomi.core.common.util.lang.launchIO
import tachiyomi.core.common.util.lang.withUIContext
import tachiyomi.core.common.util.system.logcat
import tachiyomi.domain.anime.model.Anime
import tachiyomi.domain.download.service.DownloadPreferences
import tachiyomi.domain.episode.model.Episode
import tachiyomi.domain.source.service.SourceManager
import tachiyomi.i18n.MR
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import uy.kohesive.injekt.injectLazy
import kotlin.coroutines.cancellation.CancellationException
import kotlin.coroutines.coroutineContext
import javax.net.ssl.SSLHandshakeException

/**
 * This class is the one in charge of downloading episodes.
 *
 * Its queue contains the list of episodes to download. In order to download them, the downloader
 * subscription must be running and the list of episodes must be sent to them by [downloaderJob].
 *
 * The queue manipulation must be done in one thread (currently the main thread) to avoid unexpected
 * behavior, but it's safe to read it from multiple threads.
 */
class Downloader(
    private val context: Context,
    private val provider: DownloadProvider,
    private val cache: DownloadCache,
    private val sourceManager: SourceManager = Injekt.get(),
) {
    /**
     * Store for persisting downloads across restarts.
     */
    private val store = DownloadStore(context)

    /**
     * Queue where active downloads are kept.
     */
    private val _queueState = MutableStateFlow<List<Download>>(emptyList())
    val queueState = _queueState.asStateFlow()

    /**
     * Notifier for the downloader state and progress.
     */
    private val notifier by lazy { DownloadNotifier(context) }

    /**
     * Coroutine scope used for download job scheduling
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Job object for download queue management
     */
    private var downloaderJob: Job? = null

    /**
     * Preference for user's choice of external downloader
     */
    private val preferences: DownloadPreferences by injectLazy()

    /**
     * Whether the downloader is running.
     */
    val isRunning: Boolean
        get() = downloaderJob?.isActive ?: false

    /**
     * Whether FFmpeg is running.
     */
    @Volatile
    var isFFmpegRunning: Boolean = false

    init {
        scope.launch {
            val episodes = async { store.restore() }
            addAllToQueue(episodes.await())
        }
    }

    /**
     * Starts the downloader. It doesn't do anything if it's already running or there isn't anything
     * to download.
     *
     * @return true if the downloader is started, false otherwise.
     */
    fun start(): Boolean {
        if (isRunning || queueState.value.isEmpty()) {
            return false
        }

        val pending = queueState.value.filter { it.status != Download.State.DOWNLOADED }
        pending.forEach { if (it.status != Download.State.QUEUE) it.status = Download.State.QUEUE }

        launchDownloaderJob()

        return pending.isNotEmpty()
    }

    /**
     * Stops the downloader.
     */
    fun stop(reason: String? = null) {
        cancelDownloaderJob()
        queueState.value
            .filter { it.status == Download.State.DOWNLOADING }
            .forEach { it.status = Download.State.ERROR }

        if (reason != null) {
            notifier.onWarning(reason)
            return
        }

        if (queueState.value.isNotEmpty()) {
            notifier.onPaused()
        } else {
            notifier.onComplete()
        }

        DownloadJob.stop(context)
    }

    /**
     * Pauses the downloader
     */
    fun pause() {
        cancelDownloaderJob()
        queueState.value
            .filter { it.status == Download.State.DOWNLOADING }
            .forEach { it.status = Download.State.QUEUE }
    }

    /**
     * Removes everything from the queue.
     */
    fun clearQueue() {
        cancelDownloaderJob()

        internalClearQueue()
        notifier.dismissProgress()
    }

    /**
     * Prepares the jobs to start downloading.
     */
    private fun launchDownloaderJob() {
        if (isRunning) return

        downloaderJob = scope.launch {
            val activeDownloadsFlow = queueState.transformLatest { queue ->
                while (true) {
                    val activeDownloads = queue.asSequence()
                        .filter {
                            it.status.value <= Download.State.DOWNLOADING.value
                        } // Ignore completed downloads, leave them in the queue
                        .groupBy { it.source }
                        .toList().take(3) // Concurrently download from 5 different sources
                        .map { (_, downloads) -> downloads.first() }
                    emit(activeDownloads)

                    if (activeDownloads.isEmpty()) break

                    // Suspend until a download enters the ERROR state
                    val activeDownloadsErroredFlow =
                        combine(activeDownloads.map(Download::statusFlow)) { states ->
                            states.contains(Download.State.ERROR)
                        }.filter { it }
                    activeDownloadsErroredFlow.first()
                }

                if (areAllDownloadsFinished()) stop()
            }.distinctUntilChanged()

            // Use supervisorScope to cancel child jobs when the downloader job is cancelled
            supervisorScope {
                val downloadJobs = mutableMapOf<Download, Job>()

                activeDownloadsFlow.collectLatest { activeDownloads ->
                    val downloadJobsToStop = downloadJobs.filter { it.key !in activeDownloads }
                    downloadJobsToStop.forEach { (download, job) ->
                        job.cancel()
                        downloadJobs.remove(download)
                    }

                    val downloadsToStart = activeDownloads.filter { it !in downloadJobs }
                    downloadsToStart.forEach { download ->
                        downloadJobs[download] = launchDownloadJob(download)
                    }
                }
            }
        }
    }

    /**
     * Launch the job responsible for download a single video
     */
    private fun CoroutineScope.launchDownloadJob(download: Download) = launchIO {
        // This try-catch manages the job cancellation
        try {
            downloadEpisode(download)

            // Remove successful download from queue
            if (download.status == Download.State.DOWNLOADED) {
                removeFromQueue(download)
            }
        } catch (e: Throwable) {
            if (e is CancellationException) {
                notifier.onError("Download cancelled")
            } else {
                notifier.onError(e.message)
                logcat(LogPriority.ERROR, e)
            }
        }
    }

    /**
     * Destroys the downloader subscriptions.
     */
    private fun cancelDownloaderJob() {
        isFFmpegRunning = false
        FFmpegKitConfig.getSessions().filter {
            it.isFFmpeg && (it.state == SessionState.CREATED || it.state == SessionState.RUNNING)
        }.forEach {
            it.cancel()
        }

        downloaderJob?.cancel()
        downloaderJob = null
    }

    /**
     * Creates a download object for every episode and adds them to the downloads queue.
     *
     * @param anime the anime of the episodes to download.
     * @param episodes the list of episodes to download.
     * @param autoStart whether to start the downloader after enqueing the episodes.
     */
    fun queueEpisodes(
        anime: Anime,
        episodes: List<Episode>,
        autoStart: Boolean,
        changeDownloader: Boolean = false,
        video: Video? = null,
    ) {
        if (episodes.isEmpty()) return

        val source = sourceManager.get(anime.source) as? HttpSource ?: return
        try {
            provider.getAnimeDir(anime.title, source)
        } catch (e: Exception) {
            notifier.onError(e.message ?: "Invalid download location", animeTitle = anime.title, animeId = anime.id)
            return
        }
        val wasEmpty = queueState.value.isEmpty()

        val episodesToQueue = episodes.asSequence()
            // Filter out those already downloaded.
            .filter { provider.findEpisodeDir(it.name, it.scanlator, anime.title, source) == null }
            // Add episodes to queue from the start.
            .sortedByDescending { it.sourceOrder }
            // Filter out those already enqueued.
            .filter { episode -> queueState.value.none { it.episode.id == episode.id } }
            // Create a download for each one.
            .map { Download(source, anime, it, changeDownloader, video) }
            .toList()

        if (episodesToQueue.isNotEmpty()) {
            addAllToQueue(episodesToQueue)

            // Start downloader if needed
            if (autoStart && wasEmpty) {
                val queuedDownloads =
                    queueState.value.count { it: Download -> it.source !is UnmeteredSource }
                val maxDownloadsFromSource = queueState.value
                    .groupBy { it.source }
                    .filterKeys { it !is UnmeteredSource }
                    .maxOfOrNull { it.value.size }
                    ?: 0
                // TODO: show warnings in stable
                if (
                    queuedDownloads > DOWNLOADS_QUEUED_WARNING_THRESHOLD ||
                    maxDownloadsFromSource > EPISODES_PER_SOURCE_QUEUE_WARNING_THRESHOLD
                ) {
                    notifier.onWarning(
                        context.stringResource(MR.strings.download_queue_size_warning),
                        WARNING_NOTIF_TIMEOUT_MS,
                        NotificationHandler.openUrl(
                            context,
                            LibraryUpdateNotifier.HELP_WARNING_URL,
                        ),
                    )
                }
                DownloadJob.start(context)
            }
        }
    }

    /**
     * Download the video associated with download object
     *
     * @param download the episode to be downloaded.
     */
    private suspend fun downloadEpisode(download: Download) {
        // This try catch manages errors during download
        try {
            val animeDir = provider.getAnimeDir(download.anime.title, download.source)

            val availSpace = DiskUtil.getAvailableStorageSpace(animeDir)
            if (availSpace != -1L && availSpace < MIN_DISK_SPACE) {
                throw Exception(context.stringResource(MR.strings.download_insufficient_space))
            }

            val episodeDirname = provider.getEpisodeDirName(download.episode.name, download.episode.scanlator)
            val tmpDir = animeDir.createDirectory(episodeDirname + TMP_DIR_SUFFIX)!!
            val failureReasons = mutableListOf<String>()
            var candidateResolverState: CandidateResolverState? = null
            var preferredCandidate: Video? = download.video?.takeIf { it.videoUrl.isNotBlank() }
            val attemptedCandidateUrls = mutableSetOf<String>()
            var attempts = 0
            var candidateSucceeded = false
            while (true) {
                val candidateResult = if (preferredCandidate != null) {
                    val candidate = preferredCandidate!!
                    preferredCandidate = null
                    CandidateResolutionResult.Success(candidate)
                } else {
                    if (candidateResolverState == null) {
                        candidateResolverState = withTimeout(TOTAL_RESOLVE_TIMEOUT_MS) {
                            createCandidateResolverState(download, attemptedCandidateUrls)
                        }
                    }

                    try {
                        withTimeout(CANDIDATE_RESOLVE_TIMEOUT_MS) {
                            resolveNextVideoCandidate(download, candidateResolverState!!)
                        }
                    } catch (_: TimeoutCancellationException) {
                        CandidateResolutionResult.Failure("Timed out while resolving video links")
                    }
                }

                when (candidateResult) {
                    is CandidateResolutionResult.Exhausted -> break
                    is CandidateResolutionResult.Failure -> {
                        failureReasons += candidateResult.reason
                        continue
                    }
                    is CandidateResolutionResult.Success -> {
                        val candidate = candidateResult.video
                        attempts += 1
                        candidate.videoUrl.takeIf { it.isNotBlank() }?.let { attemptedCandidateUrls.add(it) }
                        download.video = candidate
                        download.status = Download.State.DOWNLOADING
                        download.progress = 0
                        notifier.onProgressChange(download)

                        try {
                            getOrDownloadVideoFile(
                                download = download,
                                tmpDir = tmpDir,
                                notifyOnError = false,
                            )
                            candidateSucceeded = true
                            break
                        } catch (e: Exception) {
                            val reason = formatTransferFailure(e)
                            failureReasons += reason
                            notifier.onWarning("Source failed (attempt $attempts), trying next candidate...")
                        }
                    }
                }
            }

            if (!candidateSucceeded) {
                val reason = failureReasons.lastOrNull()
                val suffix = if (reason.isNullOrBlank()) "" else " Last error: $reason"
                throw Exception("All video candidates failed.$suffix")
            }

            ensureSuccessfulAnimeDownload(download, animeDir, tmpDir, episodeDirname)
        } catch (e: Exception) {
            download.status = Download.State.ERROR
            notifier.onError(
                formatDownloadError(e),
                download.episode.name,
                download.anime.title,
                download.anime.id,
            )
        } finally {
            notifier.dismissProgress()
        }
    }

    private suspend fun createCandidateResolverState(
        download: Download,
        seenUrls: Set<String>,
    ): CandidateResolverState {
        return try {
            val hosters = EpisodeLoader.getHosters(download.episode, download.anime, download.source)
            if (hosters.isEmpty()) throw Exception(context.stringResource(MR.strings.video_list_empty_error))

            val hosterStates = withContext(Dispatchers.IO) {
                hosters.map { hoster ->
                    async { EpisodeLoader.loadHosterVideos(download.source, hoster) }
                }.awaitAll().toMutableList()
            }

            if (HosterLoader.selectBestVideo(hosterStates).first == -1) {
                throw Exception(context.stringResource(MR.strings.video_list_empty_error))
            }

            CandidateResolverState(
                hosterStates = hosterStates,
                seenUrls = seenUrls.toMutableSet(),
            )
        } catch (e: Exception) {
            logcat(LogPriority.ERROR, e)
            throw Exception(formatCandidateResolutionError(e))
        }
    }

    private suspend fun resolveNextVideoCandidate(
        download: Download,
        state: CandidateResolverState,
    ): CandidateResolutionResult {
        while (true) {
            val (hosterIndex, videoIndex) = HosterLoader.selectBestVideo(state.hosterStates)
            if (hosterIndex == -1) {
                return CandidateResolutionResult.Exhausted
            }

            val hosterState = state.hosterStates[hosterIndex] as? HosterState.Ready
                ?: return CandidateResolutionResult.Exhausted

            val candidateVideo = hosterState.videoList[videoIndex]
            state.hosterStates[hosterIndex] = hosterState.getChangedAt(
                videoIndex,
                candidateVideo,
                Video.State.LOAD_VIDEO,
            )

            val resolvedVideo = try {
                HosterLoader.getResolvedVideo(download.source, candidateVideo)
            } catch (e: Exception) {
                state.markCandidateFailed(hosterIndex, videoIndex, candidateVideo)
                return CandidateResolutionResult.Failure(formatCandidateResolutionError(e))
            }

            state.markCandidateFailed(hosterIndex, videoIndex, candidateVideo)

            val resolvedUrl = resolvedVideo?.videoUrl?.takeIf { it.isNotBlank() }
            if (resolvedUrl == null) {
                return CandidateResolutionResult.Failure("Resolved video URL is empty")
            }
            if (!state.seenUrls.add(resolvedUrl)) {
                continue
            }

            return CandidateResolutionResult.Success(resolvedVideo.copy(initialized = true))
        }
    }

    /**
     * Gets the video file if already downloaded, otherwise downloads it
     *
     * @param download the download of the video.
     * @param tmpDir the temporary directory of the download.
     */
    private suspend fun getOrDownloadVideoFile(
        download: Download,
        tmpDir: UniFile,
        notifyOnError: Boolean = true,
    ): Video {
        val video = download.video!!

        video.status = Video.State.LOAD_VIDEO

        var progressJob: Job? = null

        // Get filename from download info
        val filename = DiskUtil.buildValidFilename(download.episode.name)
        val tempOutputName = "${filename}_tmp.mkv"

        // Delete temp file if it exists
        tmpDir.findFile(tempOutputName)?.delete()

        // Try to find the video file
        val videoFile = tmpDir.listFiles()?.firstOrNull { it.name!!.startsWith("$filename.mkv") }

        try {
            // If the video is already downloaded, do nothing. Otherwise download from network
            val file = when {
                videoFile != null -> videoFile
                else -> {
                    notifier.onProgressChange(download)

                    download.status = Download.State.DOWNLOADING
                    download.progress = 0

                    // If videoFile is not existing then download it
                    if (preferences.useExternalDownloader().get() == download.changeDownloader) {
                        progressJob = scope.launch {
                            while (download.status == Download.State.DOWNLOADING) {
                                delay(50)
                                notifier.onProgressChange(download)
                            }
                        }

                        downloadVideo(download, tmpDir, filename)
                    } else {
                        val betterFileName = DiskUtil.buildValidFilename(
                            "${download.anime.title} - ${download.episode.name}",
                        )
                        downloadVideoExternal(download.video!!, download.source, tmpDir, betterFileName)
                    }
                }
            }

            video.videoUrl = file.uri.path ?: ""
            download.progress = 100
            video.status = Video.State.READY
            progressJob?.cancel()
        } catch (e: Exception) {
            video.status = Video.State.ERROR
            if (notifyOnError) {
                notifier.onError(e.message, download.episode.name, download.anime.title, download.anime.id)
            }
            progressJob?.cancel()

            logcat(LogPriority.ERROR, e)

            throw e
        }

        return video
    }

    /**
     * Define a retry routine in order to accommodate some errors that can be raised
     *
     * @param download the download reference
     * @param tmpDir the directory where placing the file
     * @param filename the name to give to download file
     */
    private suspend fun downloadVideo(
        download: Download,
        tmpDir: UniFile,
        filename: String,
    ): UniFile {
        var file: UniFile? = null

        val downloadScope = CoroutineScope(coroutineContext)
        for (tries in 1..3) {
            if (downloadScope.isActive) {
                file = try {
                    val video = download.video!!
                    when {
                        isTor(video) -> torrentDownload(download, tmpDir, filename)
                        shouldUseFfmpeg(video) -> ffmpegDownload(download, tmpDir, filename)
                        else -> {
                            try {
                                httpDownload(download, tmpDir, filename)
                            } catch (_: ManifestStreamException) {
                                ffmpegDownload(download, tmpDir, filename)
                            }
                        }
                    }
                } catch (e: Exception) {
                    notifier.onError(
                        (formatDownloadError(e)) + ", retrying..",
                        download.episode.name,
                        download.anime.title,
                        download.anime.id,
                    )
                    delay(2 * 1000L)
                    null
                }
            }
            // If download has been completed successfully we break from retry loop
            if (file != null) break
        }

        return if (downloadScope.isActive) {
            file ?: throw Exception("Downloaded file not found")
        } else {
            throw Exception("Download has been stopped")
        }
    }

    private suspend fun httpDownload(
        download: Download,
        tmpDir: UniFile,
        filename: String,
    ): UniFile {
        val video = download.video!!
        val tempOutputName = "${filename}_tmp.mkv"
        tmpDir.findFile(tempOutputName)?.delete()
        val outputFile = tmpDir.createFile(tempOutputName) ?: throw Exception("Unable to create temp output file")
        val headers = StreamRequestHeaders.resolve(download.source, video, video.videoUrl)
        val request = GET(video.videoUrl, headers)

        val progressListener = object : ProgressListener {
            override fun update(bytesRead: Long, contentLength: Long, done: Boolean) {
                if (contentLength <= 0L) return
                val progress = ((bytesRead.toDouble() / contentLength.toDouble()) * 100).toInt()
                download.progress = progress.coerceIn(0, 99)
                if (done) {
                    download.progress = 99
                }
            }
        }

        try {
            download.source.client
                .newCachelessCallWithProgress(request, progressListener)
                .awaitSuccess()
                .use { response ->
                    val contentType = response.header("Content-Type").orEmpty()
                    if (isManifestContentType(contentType)) {
                        throw ManifestStreamException("Manifest stream detected ($contentType)")
                    }

                    outputFile.openOutputStream()?.use { output ->
                        response.body.byteStream().use { input ->
                            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                            while (true) {
                                val read = input.read(buffer)
                                if (read == -1) break
                                output.write(buffer, 0, read)
                            }
                            output.flush()
                        }
                    } ?: throw Exception("Unable to open output stream")
                }

            return tmpDir.findFile(tempOutputName)?.apply {
                renameTo("$filename.mkv")
            } ?: throw Exception("Downloaded file not found")
        } catch (e: Exception) {
            tmpDir.findFile(tempOutputName)?.delete()
            throw e
        }
    }

    private fun isTor(video: Video): Boolean {
        return (video.videoUrl.startsWith("magnet") || video.videoUrl.endsWith(".torrent"))
    }

    private fun shouldUseFfmpeg(video: Video): Boolean {
        if (video.audioTracks.isNotEmpty() || video.subtitleTracks.isNotEmpty()) {
            return true
        }

        return isManifestUrl(video.videoUrl)
    }

    private fun isManifestUrl(url: String): Boolean {
        val normalized = url.lowercase()
        return normalized.contains(".m3u8") ||
            normalized.contains(".mpd") ||
            normalized.contains("format=m3u8") ||
            normalized.contains("manifest")
    }

    private fun isManifestContentType(contentType: String): Boolean {
        val normalized = contentType.lowercase()
        return normalized.contains("application/x-mpegurl") ||
            normalized.contains("application/vnd.apple.mpegurl") ||
            normalized.contains("application/dash+xml")
    }

    private fun torrentDownload(
        download: Download,
        tmpDir: UniFile,
        filename: String,
    ): UniFile {
        val video = download.video!!
        TorrentServerService.start()
        TorrentServerService.wait(10)
        val currentTorrent = TorrentServerApi.addTorrent(video.videoUrl, video.quality, "", "", false)
        var index = 0
        if (video.videoUrl.contains("index=")) {
            index = try {
                video.videoUrl.substringAfter("index=")
                    .substringBefore("&").toInt()
            } catch (_: Exception) {
                0
            }
        }
        val torrentUrl = TorrentServerUtils.getTorrentPlayLink(currentTorrent, index)
        video.videoUrl = torrentUrl
        return ffmpegDownload(download, tmpDir, filename)
    }

    // ffmpeg is always on safe mode
    private fun ffmpegDownload(
        download: Download,
        tmpDir: UniFile,
        filename: String,
    ): UniFile {
        val video = download.video!!

        isFFmpegRunning = true

        // always delete tmp file
        val tempOutputName = "${filename}_tmp.mkv"
        tmpDir.findFile(tempOutputName)?.delete()
        val videoFile = tmpDir.createFile(tempOutputName)!!

        val ffmpegFilename = { videoFile.uri.toFFmpegString(context) }

        val headers = StreamRequestHeaders.resolve(download.source, video, video.videoUrl)
        val ffmpegHeaderValue = StreamRequestHeaders.toFfmpegHeaderValue(headers)

        val ffmpegOptions = getFFmpegOptions(video, ffmpegHeaderValue, ffmpegFilename())
        val ffprobeCommand = { file: String, headerValue: String? ->
            getFFprobeOptions(file, headerValue)
        }

        var duration = 0L

        val logCallback = LogCallback { log ->
            if (log.level <= Level.AV_LOG_WARNING) {
                log.message?.let {
                    logcat(LogPriority.ERROR) { it }
                }
            }
        }

        val statCallback = StatisticsCallback { s ->
            val outTime = (s.time / 1000.0).toLong()

            if (duration != 0L && outTime > 0) {
                download.progress = (100 * outTime / duration).toInt()
            }
        }

        val session = FFmpegSession.create(ffmpegOptions, {}, logCallback, statCallback)
        val inputDuration = if (video.videoUrl.startsWith("http")) {
            0F
        } else {
            getDuration(ffprobeCommand(video.videoUrl, ffmpegHeaderValue)) ?: 0F
        }

        duration = inputDuration.toLong()

        if (!isFFmpegRunning) {
            throw Exception("ffmpeg was cancelled")
        }
        FFmpegKitConfig.ffmpegExecute(session)

        return if (ReturnCode.isSuccess(session.returnCode)) {
            val file = tmpDir.findFile(tempOutputName)?.apply {
                renameTo("$filename.mkv")
            }

            file ?: throw Exception("Downloaded file not found")
        } else {
            session.failStackTrace?.let { trace ->
                logcat(LogPriority.ERROR) { trace }
            }
            val relevantLogs = session.allLogsAsString
                .lineSequence()
                .map { it.trim() }
                .filter { it.isNotBlank() }
                .filter {
                    it.contains("error", ignoreCase = true) ||
                        it.contains("failed", ignoreCase = true) ||
                        it.contains("ssl", ignoreCase = true) ||
                        it.contains("tls", ignoreCase = true) ||
                        it.contains("http", ignoreCase = true)
                }
                .toList()
                .takeLast(3)
                .joinToString(" | ")
            val suffix = if (relevantLogs.isNotBlank()) ": $relevantLogs" else ""
            throw Exception("FFmpeg failed (code=${session.returnCode})$suffix")
        }
    }

    private fun getFFmpegOptions(
        video: Video,
        headerValue: String?,
        ffmpegFilename: String,
    ): Array<String> {
        val args = mutableListOf<String>()

        fun addInput(url: String) {
            if (url.startsWith("http") && !headerValue.isNullOrBlank()) {
                args += listOf("-headers", headerValue)
            }
            args += listOf("-i", url)
        }

        addInput(video.videoUrl)
        video.subtitleTracks.forEach { addInput(it.url) }
        video.audioTracks.forEach { addInput(it.url) }

        args += listOf("-map", "0:v")
        video.audioTracks.indices.forEach { index ->
            // Input index starts at 1 because input 0 is the main video stream.
            val inputIndex = 1 + video.subtitleTracks.size + index
            args += listOf("-map", "$inputIndex:a")
        }
        args += listOf("-map", "0:a?", "-map", "0:s?", "-map", "0:t?")
        video.subtitleTracks.indices.forEach { index ->
            args += listOf("-map", "${index + 1}:s")
        }
        args += listOf("-f", "matroska", "-c:a", "copy", "-c:v", "copy", "-c:s", "copy")
        video.subtitleTracks.forEachIndexed { index, track ->
            args += listOf("-metadata:s:s:$index", "title=${track.lang}")
        }
        video.audioTracks.forEachIndexed { index, track ->
            args += listOf("-metadata:s:a:$index", "title=${track.lang}")
        }
        args += listOf(ffmpegFilename, "-y")

        return args.toTypedArray()
    }

    private fun getFFprobeOptions(
        file: String,
        headerValue: String?,
    ): Array<String> {
        val args = mutableListOf<String>()
        if (file.startsWith("http") && !headerValue.isNullOrBlank()) {
            args += listOf("-headers", headerValue)
        }
        args += listOf(
            "-v",
            "quiet",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            file,
        )
        return args.toTypedArray()
    }

    private fun getDuration(ffprobeCommand: Array<String>): Float? {
        val session = FFprobeSession.create(ffprobeCommand)
        FFmpegKitConfig.ffprobeExecute(session)
        return session.allLogsAsString.trim().toFloatOrNull()
    }

    private fun Throwable.rootCause(): Throwable {
        var cause: Throwable = this
        while (cause.cause != null && cause.cause !== cause) {
            cause = cause.cause!!
        }
        return cause
    }

    private fun formatDownloadError(error: Throwable): String {
        val root = error.rootCause()
        val rootMessage = root.message?.takeIf { it.isNotBlank() }
        return if (rootMessage != null) {
            "${root::class.java.simpleName}: $rootMessage"
        } else {
            error.message?.takeIf { it.isNotBlank() } ?: root::class.java.simpleName
        }
    }

    private fun formatCandidateResolutionError(error: Throwable): String {
        val root = error.rootCause()
        return when (root) {
            is TimeoutCancellationException -> "Timed out while resolving video links"
            is SSLHandshakeException -> "SSLHandshakeException: ${root.message ?: "Chain validation failed"}"
            is HttpException -> "HTTP ${root.code} while resolving video links"
            else -> {
                val message = root.message?.takeIf { it.isNotBlank() } ?: error.message
                val suffix = message?.let { ": $it" }.orEmpty()
                context.stringResource(MR.strings.video_list_empty_error) + suffix
            }
        }
    }

    private fun formatTransferFailure(error: Throwable): String {
        val root = error.rootCause()
        return when (root) {
            is SSLHandshakeException -> "SSLHandshakeException: ${root.message ?: "Chain validation failed"}"
            is HttpException -> "HTTP ${root.code} while downloading stream"
            is TimeoutCancellationException -> "Timed out while downloading stream"
            else -> {
                val message = error.message?.takeIf { it.isNotBlank() } ?: root.message
                message ?: root::class.java.simpleName
            }
        }
    }

    private fun CandidateResolverState.markCandidateFailed(
        hosterIndex: Int,
        videoIndex: Int,
        video: Video,
    ) {
        val current = hosterStates[hosterIndex] as? HosterState.Ready ?: return
        hosterStates[hosterIndex] = current.getChangedAt(videoIndex, video, Video.State.ERROR)
    }

    private data class CandidateResolverState(
        val hosterStates: MutableList<HosterState>,
        val seenUrls: MutableSet<String> = mutableSetOf(),
    )

    private sealed interface CandidateResolutionResult {
        data class Success(val video: Video) : CandidateResolutionResult
        data class Failure(val reason: String) : CandidateResolutionResult
        data object Exhausted : CandidateResolutionResult
    }

    private class ManifestStreamException(message: String) : Exception(message)

    /**
     * Returns the observable which downloads the video with an external downloader.
     *
     * @param video the video to download.
     * @param source the source of the video.
     * @param tmpDir the temporary directory of the download.
     * @param filename the filename of the video.
     */
    private suspend fun downloadVideoExternal(
        video: Video,
        source: HttpSource,
        tmpDir: UniFile,
        filename: String,
    ): UniFile {
        try {
            val file = tmpDir.createFile("${filename}_tmp.mkv")!!
            val resolvedHeaders = StreamRequestHeaders.resolve(source, video, video.videoUrl)
            withUIContext {
                context.copyToClipboard("Episode download location", tmpDir.filePath!!.substringBeforeLast("_tmp"))
            }

            // TODO: support other file formats!!
            // start download with intent
            val pm = context.packageManager
            val pkgName = preferences.externalDownloaderSelection().get()
            val intent: Intent
            if (pkgName.isNotEmpty()) {
                intent = pm.getLaunchIntentForPackage(pkgName) ?: throw Exception(
                    "Launch intent not found",
                )
                when {
                    // 1DM
                    pkgName.startsWith("idm.internet.download.manager") -> {
                        val headers = resolvedHeaders.toMap()
                        val bundle = Bundle()
                        for ((key, value) in headers) {
                            bundle.putString(key, value)
                        }

                        intent.apply {
                            component = ComponentName(
                                pkgName,
                                "idm.internet.download.manager.Downloader",
                            )
                            action = Intent.ACTION_VIEW
                            data = Uri.parse(video.videoUrl)

                            putExtra("extra_filename", "$filename.mkv")
                            putExtra("extra_headers", bundle)
                        }
                    }
                    // ADM
                    pkgName.startsWith("com.dv.adm") -> {
                        val headers = resolvedHeaders.toList()
                        val bundle = Bundle()
                        headers.forEach { a ->
                            bundle.putString(
                                a.first,
                                a.second.replace("http", "h_ttp"),
                            )
                        }

                        intent.apply {
                            component = ComponentName(pkgName, "$pkgName.AEditor")
                            action = Intent.ACTION_VIEW
                            putExtra(
                                "com.dv.get.ACTION_LIST_ADD",
                                "${Uri.parse(video.videoUrl)}<info>$filename.mkv",
                            )
                            putExtra(
                                "com.dv.get.ACTION_LIST_PATH",
                                tmpDir.filePath!!.substringBeforeLast("_"),
                            )
                            putExtra("android.media.intent.extra.HTTP_HEADERS", bundle)
                        }
                        file.delete()
                        tmpDir.delete()
                        queueState.value.find { anime -> anime.video == video }?.let { download ->
                            download.status = Download.State.DOWNLOADED
                            // Delete successful downloads from queue
                            if (download.status == Download.State.DOWNLOADED) {
                                // Remove downloaded episode from queue
                                removeFromQueue(download)
                            }
                            if (areAllDownloadsFinished()) {
                                stop()
                            }
                        }
                    }
                }
            } else {
                intent = Intent(Intent.ACTION_VIEW).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    setDataAndType(Uri.parse(video.videoUrl), "video/*")
                    putExtra("extra_filename", filename)
                }
            }
            context.startActivity(intent)
            return file
        } catch (e: Exception) {
            tmpDir.findFile("${filename}_tmp.mkv")?.delete()
            throw e
        }
    }

    /**
     * Checks if the download was successful.
     *
     * @param download the download to check.
     * @param animeDir the anime directory of the download.
     * @param tmpDir the directory where the download is currently stored.
     * @param dirname the real (non temporary) directory name of the download.
     */
    private suspend fun ensureSuccessfulAnimeDownload(
        download: Download,
        animeDir: UniFile,
        tmpDir: UniFile,
        dirname: String,
    ) {
        // Ensure that the episode folder has the full video
        val downloadedVideo = tmpDir.listFiles().orEmpty().filterNot { it.extension == ".tmp" }

        download.status = if (downloadedVideo.size == 1) {
            // Only rename the directory if it's downloaded
            val filename = DiskUtil.buildValidFilename("${download.anime.title} - ${download.episode.name}")
            tmpDir.findFile("${filename}_tmp.mkv")?.delete()
            tmpDir.renameTo(dirname)

            cache.addEpisode(dirname, animeDir, download.anime)

            DiskUtil.createNoMediaFile(tmpDir, context)
            Download.State.DOWNLOADED
        } else {
            throw Exception("Unable to finalize download")
        }
    }

    /**
     * Returns true if all the queued downloads are in DOWNLOADED or ERROR state.
     */
    private fun areAllDownloadsFinished(): Boolean {
        return queueState.value.none { it.status.value <= Download.State.DOWNLOADING.value }
    }

    private fun addAllToQueue(downloads: List<Download>) {
        _queueState.update {
            downloads.forEach { download ->
                download.status = Download.State.QUEUE
            }
            store.addAll(downloads)
            it + downloads
        }
    }

    private fun removeFromQueue(download: Download) {
        _queueState.update {
            store.remove(download)
            if (download.status == Download.State.DOWNLOADING || download.status == Download.State.QUEUE) {
                download.status = Download.State.NOT_DOWNLOADED
            }
            it - download
        }
    }

    private inline fun removeFromQueueIf(predicate: (Download) -> Boolean) {
        _queueState.update { queue ->
            val downloads = queue.filter { predicate(it) }
            store.removeAll(downloads)
            downloads.forEach { download ->
                if (download.status == Download.State.DOWNLOADING ||
                    download.status == Download.State.QUEUE
                ) {
                    download.status = Download.State.NOT_DOWNLOADED
                }
            }
            queue - downloads.toSet()
        }
    }

    fun removeFromQueue(episodes: List<Episode>) {
        val episodeIds = episodes.map { it.id }
        removeFromQueueIf { it.episode.id in episodeIds }
    }

    fun removeFromQueue(anime: Anime) {
        removeFromQueueIf { it.anime.id == anime.id }
    }

    private fun internalClearQueue() {
        _queueState.update {
            it.forEach { download ->
                if (download.status == Download.State.DOWNLOADING ||
                    download.status == Download.State.QUEUE
                ) {
                    download.status = Download.State.NOT_DOWNLOADED
                }
            }
            store.clear()
            emptyList()
        }
    }

    fun updateQueue(downloads: List<Download>) {
        if (queueState == downloads) return

        if (downloads.isEmpty()) {
            clearQueue()
            stop()
            return
        }

        val wasRunning = isRunning

        pause()
        internalClearQueue()
        addAllToQueue(downloads)

        if (wasRunning) {
            start()
        }
    }

    companion object {
        const val TMP_DIR_SUFFIX = "_tmp"
        const val WARNING_NOTIF_TIMEOUT_MS = 30_000L
        const val EPISODES_PER_SOURCE_QUEUE_WARNING_THRESHOLD = 10
        private const val DOWNLOADS_QUEUED_WARNING_THRESHOLD = 20
        private const val CANDIDATE_RESOLVE_TIMEOUT_MS = 25_000L
        private const val TOTAL_RESOLVE_TIMEOUT_MS = 90_000L
    }
}

// Arbitrary minimum required space to start a download: 200 MB
private const val MIN_DISK_SPACE = 200L * 1024 * 1024
