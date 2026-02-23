/*
 * Copyright 2024 Abdallah Mehiz
 * https://github.com/abdallahmehiz/mpvKt
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Code is a mix between PlayerViewModel from mpvKt and the former
 * PlayerViewModel from Aniyomi.
 */

package eu.kanade.tachiyomi.ui.player

import android.app.Application
import android.content.Context
import android.content.pm.ActivityInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.inputmethod.InputMethodManager
import androidx.compose.runtime.Immutable
import androidx.core.content.contentValuesOf
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import dev.icerock.moko.resources.StringResource
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.Level
import com.arthenica.ffmpegkit.LogCallback
import com.arthenica.ffmpegkit.ReturnCode
import com.arthenica.ffmpegkit.StatisticsCallback
import eu.kanade.tachiyomi.data.track.TrackerManager
import eu.kanade.domain.anime.interactor.SetAnimeViewerFlags
import eu.kanade.domain.base.BasePreferences
import eu.kanade.domain.episode.model.toDbEpisode
import eu.kanade.domain.track.interactor.TrackEpisode
import eu.kanade.domain.track.service.TrackPreferences
import eu.kanade.domain.ui.UiPreferences
import tachiyomi.domain.capture.model.CaptureEntry
import tachiyomi.domain.capture.model.CaptureType
import tachiyomi.domain.capture.repository.CaptureRepository
import eu.kanade.presentation.more.settings.screen.player.custombutton.CustomButtonFetchState
import eu.kanade.presentation.more.settings.screen.player.custombutton.getButtons
import eu.kanade.tachiyomi.animesource.AnimeSource
import eu.kanade.tachiyomi.animesource.model.ChapterType
import eu.kanade.tachiyomi.animesource.model.Hoster
import eu.kanade.tachiyomi.animesource.model.SerializableHoster.Companion.toHosterList
import eu.kanade.tachiyomi.animesource.model.TimeStamp
import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.data.database.models.Episode
import eu.kanade.tachiyomi.data.database.models.toDomainEpisode
import eu.kanade.tachiyomi.data.download.DownloadManager
import eu.kanade.tachiyomi.data.download.model.Download
import eu.kanade.tachiyomi.data.saver.Image
import eu.kanade.tachiyomi.data.saver.ImageSaver
import eu.kanade.tachiyomi.data.saver.Location
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.online.HttpSource
import eu.kanade.tachiyomi.ui.player.controls.components.IndexedSegment
import eu.kanade.tachiyomi.ui.player.controls.components.sheets.HosterState
import eu.kanade.tachiyomi.ui.player.controls.components.sheets.getChangedAt
import eu.kanade.tachiyomi.ui.player.loader.EpisodeLoader
import eu.kanade.tachiyomi.ui.player.loader.HosterLoader
import eu.kanade.tachiyomi.ui.player.settings.GesturePreferences
import eu.kanade.tachiyomi.ui.player.settings.PlayerPreferences
import eu.kanade.tachiyomi.ui.player.utils.ChapterUtils.Companion.getStringRes
import eu.kanade.tachiyomi.ui.player.utils.TrackSelect
import eu.kanade.tachiyomi.ui.reader.SaveImageNotifier
import eu.kanade.tachiyomi.util.editCover
import eu.kanade.tachiyomi.util.episode.filterDownloadedEpisodes
import eu.kanade.tachiyomi.util.lang.byteSize
import eu.kanade.tachiyomi.util.lang.takeBytes
import eu.kanade.tachiyomi.util.storage.DiskUtil
import eu.kanade.tachiyomi.util.storage.cacheImageDir
import eu.kanade.tachiyomi.util.storage.toFFmpegString
import eu.kanade.tachiyomi.util.system.toast
import `is`.xyz.mpv.MPVLib
import `is`.xyz.mpv.Utils
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import logcat.LogPriority
import tachiyomi.core.common.i18n.stringResource
import tachiyomi.core.common.util.lang.launchIO
import tachiyomi.core.common.util.lang.launchNonCancellable
import tachiyomi.core.common.util.lang.toLong
import tachiyomi.core.common.util.lang.withIOContext
import tachiyomi.core.common.util.lang.withUIContext
import tachiyomi.core.common.util.system.logcat
import tachiyomi.domain.aniskip.model.AniSkipPreference
import tachiyomi.domain.aniskip.model.SkipSegment
import tachiyomi.domain.aniskip.model.SkipSegmentType
import tachiyomi.domain.aniskip.repository.AniSkipRepository
import tachiyomi.domain.anime.interactor.GetAnime
import tachiyomi.domain.anime.model.Anime
import tachiyomi.domain.category.interactor.GetCategories
import tachiyomi.domain.custombuttons.interactor.GetCustomButtons
import tachiyomi.domain.custombuttons.model.CustomButton
import tachiyomi.domain.download.service.DownloadPreferences
import tachiyomi.domain.episode.interactor.GetEpisodesByAnimeId
import tachiyomi.domain.episode.interactor.UpdateEpisode
import tachiyomi.domain.episode.model.EpisodeType
import tachiyomi.domain.episode.model.EpisodeUpdate
import tachiyomi.domain.episode.service.getEpisodeSort
import tachiyomi.domain.history.interactor.GetNextEpisodes
import tachiyomi.domain.history.interactor.UpsertHistory
import tachiyomi.domain.history.model.HistoryUpdate
import tachiyomi.domain.playback.model.PlaybackProfile
import tachiyomi.domain.playback.repository.PlaybackProfileRepository
import tachiyomi.domain.source.fallback.SourceFallbackManager
import tachiyomi.domain.source.repository.SourceHealthRepository
import tachiyomi.domain.source.service.SourceManager
import tachiyomi.domain.track.interactor.GetTracks
import tachiyomi.i18n.MR
import tachiyomi.source.local.isLocal
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.io.File
import java.io.InputStream
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.cancellation.CancellationException

class PlayerViewModelProviderFactory(
    private val activity: PlayerActivity,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        return PlayerViewModel(activity, extras.createSavedStateHandle()) as T
    }
}

class PlayerViewModel @JvmOverloads constructor(
    private val activity: PlayerActivity,
    private val savedState: SavedStateHandle,
    private val sourceManager: SourceManager = Injekt.get(),
    private val downloadManager: DownloadManager = Injekt.get(),
    private val imageSaver: ImageSaver = Injekt.get(),
    private val downloadPreferences: DownloadPreferences = Injekt.get(),
    private val trackPreferences: TrackPreferences = Injekt.get(),
    private val trackEpisode: TrackEpisode = Injekt.get(),
    private val getAnime: GetAnime = Injekt.get(),
    private val getNextEpisodes: GetNextEpisodes = Injekt.get(),
    private val getEpisodesByAnimeId: GetEpisodesByAnimeId = Injekt.get(),
    private val getAnimeCategories: GetCategories = Injekt.get(),
    private val getTracks: GetTracks = Injekt.get(),
    private val upsertHistory: UpsertHistory = Injekt.get(),
    private val updateEpisode: UpdateEpisode = Injekt.get(),
    private val setAnimeViewerFlags: SetAnimeViewerFlags = Injekt.get(),
    internal val playerPreferences: PlayerPreferences = Injekt.get(),
    internal val gesturePreferences: GesturePreferences = Injekt.get(),
    private val basePreferences: BasePreferences = Injekt.get(),
    private val getCustomButtons: GetCustomButtons = Injekt.get(),
    private val trackSelect: TrackSelect = Injekt.get(),
    private val sourceFallbackManager: SourceFallbackManager = Injekt.get(),
    private val sourceHealthRepository: SourceHealthRepository = Injekt.get(),
    private val aniSkipRepository: AniSkipRepository = Injekt.get(),
    private val playbackProfileRepository: PlaybackProfileRepository = Injekt.get(),
    private val captureRepository: CaptureRepository = Injekt.get(),
    uiPreferences: UiPreferences = Injekt.get(),
) : ViewModel() {

    private val _currentPlaylist = MutableStateFlow<List<Episode>>(emptyList())
    val currentPlaylist = _currentPlaylist.asStateFlow()

    private val _hasPreviousEpisode = MutableStateFlow(false)
    val hasPreviousEpisode = _hasPreviousEpisode.asStateFlow()

    private val _hasNextEpisode = MutableStateFlow(false)
    val hasNextEpisode = _hasNextEpisode.asStateFlow()

    private val _currentEpisode = MutableStateFlow<Episode?>(null)
    val currentEpisode = _currentEpisode.asStateFlow()

    private val _currentAnime = MutableStateFlow<Anime?>(null)
    val currentAnime = _currentAnime.asStateFlow()

    private val _currentSource = MutableStateFlow<Source?>(null)
    val currentSource = _currentSource.asStateFlow()

    private val _isEpisodeOnline = MutableStateFlow(false)
    val isEpisodeOnline = _isEpisodeOnline.asStateFlow()

    private val _isLoadingEpisode = MutableStateFlow(false)
    val isLoadingEpisode = _isLoadingEpisode.asStateFlow()

    private val _currentDecoder = MutableStateFlow(getDecoderFromValue(MPVLib.getPropertyString("hwdec")))
    val currentDecoder = _currentDecoder.asStateFlow()

    val mediaTitle = MutableStateFlow("")
    val animeTitle = MutableStateFlow("")

    val isLoading = MutableStateFlow(true)
    val playbackSpeed = MutableStateFlow(playerPreferences.playerSpeed().get())
    private val _audioNormalizeEnabled = MutableStateFlow(false)
    val audioNormalizeEnabled = _audioNormalizeEnabled.asStateFlow()
    private val _audioNormalizeLevel = MutableStateFlow(0.5f)
    val audioNormalizeLevel = _audioNormalizeLevel.asStateFlow()
    private val _nightModeEnabled = MutableStateFlow(false)
    val nightModeEnabled = _nightModeEnabled.asStateFlow()

    private val _subtitleTracks = MutableStateFlow<List<VideoTrack>>(emptyList())
    val subtitleTracks = _subtitleTracks.asStateFlow()
    private val _selectedSubtitles = MutableStateFlow(Pair(-1, -1))
    val selectedSubtitles = _selectedSubtitles.asStateFlow()

    private val _audioTracks = MutableStateFlow<List<VideoTrack>>(emptyList())
    val audioTracks = _audioTracks.asStateFlow()
    private val _selectedAudio = MutableStateFlow(-1)
    val selectedAudio = _selectedAudio.asStateFlow()

    val isLoadingTracks = MutableStateFlow(true)
    val isCasting = MutableStateFlow(false)

    private val _hosterList = MutableStateFlow<List<Hoster>>(emptyList())
    val hosterList = _hosterList.asStateFlow()
    private val _isLoadingHosters = MutableStateFlow(true)
    val isLoadingHosters = _isLoadingHosters.asStateFlow()
    private val _hosterState = MutableStateFlow<List<HosterState>>(emptyList())
    val hosterState = _hosterState.asStateFlow()
    val sourceFallbackState = sourceFallbackManager.state
    private val _hosterExpandedList = MutableStateFlow<List<Boolean>>(emptyList())
    val hosterExpandedList = _hosterExpandedList.asStateFlow()
    private val _selectedHosterVideoIndex = MutableStateFlow(Pair(-1, -1))
    val selectedHosterVideoIndex = _selectedHosterVideoIndex.asStateFlow()
    private val _currentVideo = MutableStateFlow<Video?>(null)
    val currentVideo = _currentVideo.asStateFlow()

    private val _chapters = MutableStateFlow<List<IndexedSegment>>(emptyList())
    val chapters = _chapters.asStateFlow()
    private val _currentChapter = MutableStateFlow<IndexedSegment?>(null)
    val currentChapter = _currentChapter.asStateFlow()
    private val _skipIntroText = MutableStateFlow<String?>(null)
    val skipIntroText = _skipIntroText.asStateFlow()
    private val _postCreditsAhead = MutableStateFlow(false)
    val postCreditsAhead = _postCreditsAhead.asStateFlow()
    private val _nextEpisodeCard = MutableStateFlow<NextEpisodeCardState?>(null)
    val nextEpisodeCard = _nextEpisodeCard.asStateFlow()
    private val _clipEditorState = MutableStateFlow<ClipEditorState?>(null)
    val clipEditorState = _clipEditorState.asStateFlow()
    private val _bingeSessionState = MutableStateFlow(BingeSessionState())
    val bingeSessionState = _bingeSessionState.asStateFlow()
    private val _bingeReminderState = MutableStateFlow<BingeReminderState?>(null)
    val bingeReminderState = _bingeReminderState.asStateFlow()
    private val _showBingeExplainer = MutableStateFlow(false)
    val showBingeExplainer = _showBingeExplainer.asStateFlow()
    private var aniSkipSegments: List<TimeStamp> = emptyList()
    private var playbackProfile: PlaybackProfile? = null
    private var playbackProfileSkipPreference: AniSkipPreference? = null
    private var nightModePreviousBrightness: Float? = null
    private var nightModePreviousAudioNormalizeEnabled: Boolean? = null
    private var nightModePreviousAudioNormalizeLevel: Float? = null

    private val _pos = MutableStateFlow(0f)
    val pos = _pos.asStateFlow()

    private var castProgressJob: Job? = null

    val duration = MutableStateFlow(0f)

    private val _readAhead = MutableStateFlow(0f)
    val readAhead = _readAhead.asStateFlow()

    private val _paused = MutableStateFlow(false)
    val paused = _paused.asStateFlow()

    // False because the video shouldn't start paused
    private val _pausedState = MutableStateFlow<Boolean?>(false)
    val pausedState = _pausedState.asStateFlow()

    private val _controlsShown = MutableStateFlow(!playerPreferences.hideControls().get())
    val controlsShown = _controlsShown.asStateFlow()
    private val _seekBarShown = MutableStateFlow(!playerPreferences.hideControls().get())
    val seekBarShown = _seekBarShown.asStateFlow()
    private val _areControlsLocked = MutableStateFlow(false)
    val areControlsLocked = _areControlsLocked.asStateFlow()

    val playerUpdate = MutableStateFlow<PlayerUpdates>(PlayerUpdates.None)
    val isBrightnessSliderShown = MutableStateFlow(false)
    val isVolumeSliderShown = MutableStateFlow(false)
    val currentBrightness = MutableStateFlow(
        runCatching {
            Settings.System.getFloat(activity.contentResolver, Settings.System.SCREEN_BRIGHTNESS)
                .normalize(0f, 255f, 0f, 1f)
        }.getOrElse { 0f },
    )
    val currentVolume = MutableStateFlow(activity.audioManager.getStreamVolume(AudioManager.STREAM_MUSIC))
    val currentMPVVolume = MutableStateFlow(MPVLib.getPropertyInt("volume"))
    var volumeBoostCap: Int = MPVLib.getPropertyInt("volume-max")

    // Pair(startingPosition, seekAmount)
    val gestureSeekAmount = MutableStateFlow<Pair<Int, Int>?>(null)

    val sheetShown = MutableStateFlow(Sheets.None)
    val panelShown = MutableStateFlow(Panels.None)
    val dialogShown = MutableStateFlow<Dialogs>(Dialogs.None)

    private val _dismissSheet = MutableStateFlow(false)
    val dismissSheet = _dismissSheet.asStateFlow()

    private val _seekText = MutableStateFlow<String?>(null)
    val seekText = _seekText.asStateFlow()
    private val _doubleTapSeekAmount = MutableStateFlow(0)
    val doubleTapSeekAmount = _doubleTapSeekAmount.asStateFlow()
    private val _isSeekingForwards = MutableStateFlow(false)
    val isSeekingForwards = _isSeekingForwards.asStateFlow()

    private var timerJob: Job? = null
    private var nextEpisodeJob: Job? = null
    private var bingeReminderJob: Job? = null
    private var bingePreviousAutoplay: Boolean? = null
    private var bingeSessionStartedAtMs: Long = 0L
    private var bingePausedAtMs: Long? = null
    private var bingePausedAccumulatedMs: Long = 0L
    private var longPressGestureAction: GestureAction? = null
    private var longPressOriginalSpeed: Float? = null
    private val _remainingTime = MutableStateFlow(0)
    val remainingTime = _remainingTime.asStateFlow()

    val cachePath: String = activity.cacheDir.path

    private val _customButtons = MutableStateFlow<CustomButtonFetchState>(CustomButtonFetchState.Loading)
    val customButtons = _customButtons.asStateFlow()

    private val _primaryButtonTitle = MutableStateFlow("")
    val primaryButtonTitle = _primaryButtonTitle.asStateFlow()

    private val _primaryButton = MutableStateFlow<CustomButton?>(null)
    val primaryButton = _primaryButton.asStateFlow()

    init {
        viewModelScope.launchIO {
            try {
                val buttons = getCustomButtons.getAll()
                buttons.firstOrNull { it.isFavorite }?.let {
                    _primaryButton.update { _ -> it }
                    // If the button text is not empty, it has been set buy a lua script in which
                    // case we don't want to override it
                    if (_primaryButtonTitle.value.isEmpty()) {
                        setPrimaryCustomButtonTitle(it)
                    }
                }
                activity.setupCustomButtons(buttons)
                _customButtons.update { _ -> CustomButtonFetchState.Success(buttons.toImmutableList()) }
            } catch (e: Exception) {
                logcat(LogPriority.ERROR, e)
                _customButtons.update { _ -> CustomButtonFetchState.Error(e.message ?: "Unable to fetch buttons") }
            }
        }
    }

    /**
     * Starts a sleep timer/cancels the current timer if [seconds] is less than 1.
     */
    fun startTimer(seconds: Int) {
        timerJob?.cancel()
        _remainingTime.value = seconds
        if (seconds < 1) return
        timerJob = viewModelScope.launch {
            for (time in seconds downTo 0) {
                _remainingTime.value = time
                delay(1000)
            }
            pause()
            withUIContext { Injekt.get<Application>().toast(MR.strings.toast_sleep_timer_ended) }
        }
    }

    fun isEpisodeOnline(): Boolean? {
        val anime = currentAnime.value ?: return null
        val episode = currentEpisode.value ?: return null
        val source = currentSource.value ?: return null
        return source is HttpSource &&
            !EpisodeLoader.isDownload(
                episode.toDomainEpisode()!!,
                anime,
            )
    }

    fun updateIsLoadingEpisode(value: Boolean) {
        _isLoadingEpisode.update { _ -> value }
    }

    private fun updateEpisodeList(episodeList: List<Episode>) {
        _currentPlaylist.update { _ -> filterEpisodeList(episodeList) }
    }

    fun getDecoder() {
        _currentDecoder.update { getDecoderFromValue(activity.player.hwdecActive) }
    }

    fun updateDecoder(decoder: Decoder) {
        MPVLib.setPropertyString("hwdec", decoder.value)
    }

    val getTrackLanguage: (Int) -> String = {
        if (it != -1) {
            MPVLib.getPropertyString("track-list/$it/lang") ?: ""
        } else {
            activity.stringResource(MR.strings.off)
        }
    }
    val getTrackTitle: (Int) -> String = {
        if (it != -1) {
            MPVLib.getPropertyString("track-list/$it/title") ?: ""
        } else {
            activity.stringResource(MR.strings.off)
        }
    }
    val getTrackMPVId: (Int) -> Int = {
        if (it != -1) {
            MPVLib.getPropertyInt("track-list/$it/id")
        } else {
            -1
        }
    }
    val getTrackType: (Int) -> String? = {
        MPVLib.getPropertyString("track-list/$it/type")
    }

    private var trackLoadingJob: Job? = null
    fun loadTracks() {
        trackLoadingJob?.cancel()
        trackLoadingJob = viewModelScope.launch {
            val possibleTrackTypes = listOf("audio", "sub")
            val subTracks = mutableListOf<VideoTrack>()
            val audioTracks = mutableListOf(
                VideoTrack(-1, activity.stringResource(MR.strings.off), null),
            )
            try {
                val tracksCount = MPVLib.getPropertyInt("track-list/count") ?: 0
                for (i in 0..<tracksCount) {
                    val type = getTrackType(i)
                    if (!possibleTrackTypes.contains(type) || type == null) continue
                    when (type) {
                        "sub" -> subTracks.add(VideoTrack(getTrackMPVId(i), getTrackTitle(i), getTrackLanguage(i)))
                        "audio" -> audioTracks.add(VideoTrack(getTrackMPVId(i), getTrackTitle(i), getTrackLanguage(i)))
                        else -> error("Unrecognized track type")
                    }
                }
            } catch (e: NullPointerException) {
                logcat(LogPriority.ERROR) { "Couldn't load tracks, probably cause mpv was destroyed" }
                return@launch
            }
            _subtitleTracks.update { subTracks }
            _audioTracks.update { audioTracks }

            if (!isLoadingTracks.value) {
                onFinishLoadingTracks()
            }
        }
    }

    /**
     * When all subtitle/audio tracks are loaded, select the preferred one based on preferences,
     * or select the first one in the list if trackSelect fails.
     */
    fun onFinishLoadingTracks() {
        val savedSubtitleId = playbackProfile?.subtitleTrack?.toIntOrNull()
        val selectedSubtitle = when (savedSubtitleId) {
            -1 -> null
            else -> savedSubtitleId?.let { targetId ->
                subtitleTracks.value.firstOrNull { it.id == targetId }
            } ?: trackSelect.getPreferredTrackIndex(subtitleTracks.value)
                ?: subtitleTracks.value.firstOrNull()
        }
        if (savedSubtitleId == -1) {
            activity.player.sid = -1
            activity.player.secondarySid = -1
            _selectedSubtitles.update { Pair(-1, -1) }
        } else {
            selectedSubtitle?.let { track ->
                activity.player.sid = track.id
                activity.player.secondarySid = -1
                _selectedSubtitles.update { Pair(track.id, -1) }
            }
        }

        val savedAudioId = playbackProfile?.audioTrack?.toIntOrNull()
        val selectedAudioTrack = savedAudioId?.let { targetId ->
            audioTracks.value.firstOrNull { it.id == targetId }
        } ?: trackSelect.getPreferredTrackIndex(audioTracks.value, subtitle = false)
            ?: audioTracks.value.getOrNull(1)
        selectedAudioTrack?.let { track ->
            activity.player.aid = track.id
            _selectedAudio.update { track.id }
        }

        isLoadingTracks.update { _ -> true }
        updateIsLoadingEpisode(false)
        setPausedState()
    }

    @Immutable
    data class VideoTrack(
        val id: Int,
        val name: String,
        val language: String?,
    )

    fun loadChapters() {
        val chapters = mutableListOf<IndexedSegment>()
        val count = MPVLib.getPropertyInt("chapter-list/count")!!
        for (i in 0 until count) {
            val title = MPVLib.getPropertyString("chapter-list/$i/title")
            val time = MPVLib.getPropertyInt("chapter-list/$i/time")!!
            chapters.add(
                IndexedSegment(
                    name = title,
                    start = time.toFloat(),
                    index = 0,
                ),
            )
        }
        updateChapters(chapters.sortedBy { it.start })
    }

    fun updateChapters(chapters: List<IndexedSegment>) {
        _chapters.update { _ -> chapters }
    }

    fun selectChapter(index: Int) {
        val time = chapters.value[index].start
        seekTo(time.toInt())
    }

    fun updateChapter(index: Long) {
        if (chapters.value.isEmpty() || index == -1L) return
        _currentChapter.update { chapters.value.getOrNull(index.toInt()) ?: return }
    }

    fun addAudio(uri: Uri) {
        val url = uri.toString()
        val isContentUri = url.startsWith("content://")
        val path = (if (isContentUri) uri.openContentFd(activity) else url)
            ?: return
        val name = if (isContentUri) uri.getFileName(activity) else null
        if (name == null) {
            MPVLib.command(arrayOf("audio-add", path, "cached"))
        } else {
            MPVLib.command(arrayOf("audio-add", path, "cached", name))
        }
    }

    fun selectAudio(id: Int) {
        activity.player.aid = id
        savePlaybackProfile(audioTrack = id.toString())
    }

    fun updateAudio(id: Int) {
        _selectedAudio.update { id }
    }

    fun addSubtitle(uri: Uri) {
        val url = uri.toString()
        val isContentUri = url.startsWith("content://")
        val path = (if (isContentUri) uri.openContentFd(activity) else url)
            ?: return
        val name = if (isContentUri) uri.getFileName(activity) else null
        if (name == null) {
            MPVLib.command(arrayOf("sub-add", path, "cached"))
        } else {
            MPVLib.command(arrayOf("sub-add", path, "cached", name))
        }
    }

    fun selectSub(id: Int) {
        val selectedSubs = selectedSubtitles.value
        _selectedSubtitles.update {
            when (id) {
                selectedSubs.first -> Pair(selectedSubs.second, -1)
                selectedSubs.second -> Pair(selectedSubs.first, -1)
                else -> {
                    if (selectedSubs.first != -1) {
                        Pair(selectedSubs.first, id)
                    } else {
                        Pair(id, -1)
                    }
                }
            }
        }
        activity.player.secondarySid = _selectedSubtitles.value.second
        activity.player.sid = _selectedSubtitles.value.first
        savePlaybackProfile(subtitleTrack = _selectedSubtitles.value.first.toString())
    }

    fun updateSubtitle(sid: Int, secondarySid: Int) {
        _selectedSubtitles.update { Pair(sid, secondarySid) }
    }

    fun updatePlayBackPos(pos: Float) {
        onSecondReached(pos.toInt(), duration.value.toInt())
        _pos.update { pos }
    }

    fun updateReadAhead(value: Long) {
        _readAhead.update { value.toFloat() }
    }

    private fun updatePausedState() {
        if (pausedState.value == null) {
            _pausedState.update { _ -> paused.value }
        }
    }

    private fun setPausedState() {
        pausedState.value?.let {
            if (it) {
                pause()
            } else {
                unpause()
            }

            _pausedState.update { _ -> null }
        }
    }

    fun pauseUnpause() {
        if (paused.value) {
            unpause()
        } else {
            pause()
        }
    }

    fun pause() {
        activity.player.paused = true
        _paused.update { true }
        if (bingeSessionState.value.active && bingePausedAtMs == null) {
            bingePausedAtMs = System.currentTimeMillis()
            refreshBingeWatchElapsed()
        }
        runCatching {
            activity.setPictureInPictureParams(activity.createPipParams())
        }
    }

    fun unpause() {
        activity.player.paused = false
        _paused.update { false }
        if (bingeSessionState.value.active) {
            bingePausedAtMs?.let { pausedAt ->
                bingePausedAccumulatedMs += (System.currentTimeMillis() - pausedAt)
            }
            bingePausedAtMs = null
            refreshBingeWatchElapsed()
        }
    }

    private val showStatusBar = playerPreferences.showSystemStatusBar().get()
    fun showControls() {
        if (sheetShown.value != Sheets.None ||
            panelShown.value != Panels.None ||
            dialogShown.value != Dialogs.None
        ) {
            return
        }
        if (showStatusBar) {
            activity.windowInsetsController.show(WindowInsetsCompat.Type.statusBars())
        }
        _controlsShown.update { true }
    }

    fun hideControls() {
        activity.windowInsetsController.hide(WindowInsetsCompat.Type.statusBars())
        _controlsShown.update { false }
    }

    fun hideSeekBar() {
        _seekBarShown.update { false }
    }

    fun showSeekBar() {
        if (sheetShown.value != Sheets.None) return
        _seekBarShown.update { true }
    }

    fun lockControls() {
        _areControlsLocked.update { true }
    }

    fun unlockControls() {
        _areControlsLocked.update { false }
    }

    fun dismissSheet() {
        _dismissSheet.update { _ -> true }
    }

    private fun resetDismissSheet() {
        _dismissSheet.update { _ -> false }
    }

    fun showSheet(sheet: Sheets) {
        sheetShown.update { sheet }
        if (sheet == Sheets.None) {
            resetDismissSheet()
            showControls()
        } else {
            hideControls()
            panelShown.update { Panels.None }
            dialogShown.update { Dialogs.None }
        }
    }

    fun showPanel(panel: Panels) {
        panelShown.update { panel }
        if (panel == Panels.None) {
            showControls()
        } else {
            hideControls()
            sheetShown.update { Sheets.None }
            dialogShown.update { Dialogs.None }
        }
    }

    fun showDialog(dialog: Dialogs) {
        dialogShown.update { dialog }
        if (dialog == Dialogs.None) {
            showControls()
        } else {
            hideControls()
            sheetShown.update { Sheets.None }
            panelShown.update { Panels.None }
        }
    }

    fun seekBy(offset: Int, precise: Boolean = false) {
        MPVLib.command(arrayOf("seek", offset.toString(), if (precise) "relative+exact" else "relative"))
    }

    fun seekTo(position: Int, precise: Boolean = true) {
        if (position !in 0..(activity.player.duration ?: 0)) return
        MPVLib.command(arrayOf("seek", position.toString(), if (precise) "absolute" else "absolute+keyframes"))
    }

    fun changeBrightnessTo(
        brightness: Float,
        persistProfile: Boolean = true,
    ) {
        val clampedBrightness = brightness.coerceIn(-0.75f, 1f)
        currentBrightness.update { _ -> clampedBrightness }
        activity.window.attributes = activity.window.attributes.apply {
            screenBrightness = clampedBrightness.coerceIn(0f, 1f)
        }
        if (persistProfile) {
            savePlaybackProfile(brightnessOffset = clampedBrightness)
        }
    }

    fun displayBrightnessSlider() {
        isBrightnessSliderShown.update { true }
    }

    val maxVolume = activity.audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    fun changeVolumeBy(change: Int) {
        val mpvVolume = MPVLib.getPropertyInt("volume")
        if (volumeBoostCap > 0 && currentVolume.value == maxVolume) {
            if (mpvVolume == 100 && change < 0) changeVolumeTo(currentVolume.value + change)
            val finalMPVVolume = (mpvVolume + change).coerceAtLeast(100)
            if (finalMPVVolume in 100..volumeBoostCap + 100) {
                changeMPVVolumeTo(finalMPVVolume)
                return
            }
        }
        changeVolumeTo(currentVolume.value + change)
    }

    fun changeVolumeTo(volume: Int) {
        val newVolume = volume.coerceIn(0..maxVolume)
        activity.audioManager.setStreamVolume(
            AudioManager.STREAM_MUSIC,
            newVolume,
            0,
        )
        currentVolume.update { newVolume }
    }

    fun changeMPVVolumeTo(volume: Int) {
        MPVLib.setPropertyInt("volume", volume)
    }

    fun setMPVVolume(volume: Int) {
        if (volume != currentMPVVolume.value) displayVolumeSlider()
        currentMPVVolume.update { volume }
    }

    fun displayVolumeSlider() {
        isVolumeSliderShown.update { true }
    }

    fun setAutoPlay(value: Boolean) {
        val textRes = if (value) {
            MR.strings.enable_auto_play
        } else {
            MR.strings.disable_auto_play
        }
        playerUpdate.update { PlayerUpdates.ShowTextResource(textRes) }
        playerPreferences.autoplayEnabled().set(value)
    }

    fun toggleBingeMode() {
        if (bingeSessionState.value.active) {
            deactivateBingeMode()
        } else {
            activateBingeMode()
        }
    }

    fun deactivateBingeMode() {
        if (!bingeSessionState.value.active) return
        refreshBingeWatchElapsed()
        bingeReminderJob?.cancel()
        bingeReminderJob = null
        _bingeReminderState.update { null }

        bingePreviousAutoplay?.let { previous ->
            playerPreferences.autoplayEnabled().set(previous)
        }
        bingePreviousAutoplay = null
        bingePausedAtMs = null

        _bingeSessionState.update { it.copy(active = false) }
        playerUpdate.update { PlayerUpdates.ShowText("Binge mode disabled") }
    }

    fun onAppBackgrounded() {
        if (bingeSessionState.value.active) {
            deactivateBingeMode()
        }
    }

    fun dismissBingeReminder() {
        _bingeReminderState.update { null }
        scheduleBingeReminder(delayMinutes = bingeSessionState.value.reminderIntervalMinutes)
    }

    fun snoozeBingeReminder(minutes: Int = 30) {
        _bingeReminderState.update { null }
        scheduleBingeReminder(delayMinutes = minutes)
    }

    fun dismissBingeExplainer() {
        _showBingeExplainer.update { false }
    }

    private fun activateBingeMode() {
        if (bingeSessionState.value.active) return

        bingePreviousAutoplay = playerPreferences.autoplayEnabled().get()
        playerPreferences.autoplayEnabled().set(true)

        val reminderInterval = playerPreferences.bingeReminderIntervalMinutes().get()
        bingeSessionStartedAtMs = System.currentTimeMillis()
        bingePausedAccumulatedMs = 0L
        bingePausedAtMs = if (paused.value) System.currentTimeMillis() else null
        _bingeSessionState.update {
            BingeSessionState(
                active = true,
                episodesWatched = 0,
                elapsedWatchMs = 0L,
                reminderIntervalMinutes = reminderInterval,
            )
        }

        if (!playerPreferences.bingeExplainerSeen().get()) {
            playerPreferences.bingeExplainerSeen().set(true)
            _showBingeExplainer.update { true }
        }

        scheduleBingeReminder(delayMinutes = reminderInterval)
        playerUpdate.update { PlayerUpdates.ShowText("Binge mode enabled") }
    }

    private fun scheduleBingeReminder(delayMinutes: Int) {
        bingeReminderJob?.cancel()
        if (!bingeSessionState.value.active) return
        bingeReminderJob = viewModelScope.launch {
            delay(delayMinutes * 60_000L)
            if (!bingeSessionState.value.active) return@launch
            refreshBingeWatchElapsed()
            _bingeReminderState.update {
                BingeReminderState(
                    episodesWatched = bingeSessionState.value.episodesWatched,
                    elapsedWatchMs = bingeSessionState.value.elapsedWatchMs,
                )
            }
        }
    }

    private fun refreshBingeWatchElapsed() {
        if (!bingeSessionState.value.active) return
        val now = System.currentTimeMillis()
        val pausedDelta = bingePausedAtMs?.let { now - it } ?: 0L
        val elapsed = (now - bingeSessionStartedAtMs) - bingePausedAccumulatedMs - pausedDelta
        _bingeSessionState.update {
            it.copy(elapsedWatchMs = elapsed.coerceAtLeast(0L))
        }
    }

    @Suppress("DEPRECATION")
    fun changeVideoAspect(aspect: VideoAspect) {
        var ratio = -1.0
        var pan = 1.0
        when (aspect) {
            VideoAspect.Crop -> {
                pan = 1.0
            }

            VideoAspect.Fit -> {
                pan = 0.0
                MPVLib.setPropertyDouble("panscan", 0.0)
            }

            VideoAspect.Stretch -> {
                val dm = DisplayMetrics()
                activity.windowManager.defaultDisplay.getRealMetrics(dm)
                ratio = dm.widthPixels / dm.heightPixels.toDouble()
                pan = 0.0
            }
        }
        MPVLib.setPropertyDouble("panscan", pan)
        MPVLib.setPropertyDouble("video-aspect-override", ratio)
        playerPreferences.aspectState().set(aspect)
        playerUpdate.update { PlayerUpdates.AspectRatio }
    }

    fun cycleScreenRotations() {
        activity.requestedOrientation = when (activity.requestedOrientation) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE,
            ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE,
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE,
            -> {
                playerPreferences.defaultPlayerOrientationType().set(PlayerOrientation.SensorPortrait)
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            }

            else -> {
                playerPreferences.defaultPlayerOrientationType().set(PlayerOrientation.SensorLandscape)
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }
        }
    }

    fun handleLuaInvocation(property: String, value: String) {
        val data = value
            .removePrefix("\"")
            .removeSuffix("\"")
            .ifEmpty { return }

        when (property.substringAfterLast("/")) {
            "show_text" -> playerUpdate.update { PlayerUpdates.ShowText(data) }
            "toggle_ui" -> {
                when (data) {
                    "show" -> showControls()
                    "toggle" -> {
                        if (controlsShown.value) hideControls() else showControls()
                    }
                    "hide" -> {
                        sheetShown.update { Sheets.None }
                        panelShown.update { Panels.None }
                        dialogShown.update { Dialogs.None }
                        hideControls()
                    }
                }
            }
            "show_panel" -> {
                when (data) {
                    "subtitle_settings" -> showPanel(Panels.SubtitleSettings)
                    "subtitle_delay" -> showPanel(Panels.SubtitleDelay)
                    "audio_delay" -> showPanel(Panels.AudioDelay)
                    "video_filters" -> showPanel(Panels.VideoFilters)
                }
            }
            "set_button_title" -> {
                _primaryButtonTitle.update { _ -> data }
            }
            "reset_button_title" -> {
                _customButtons.value.getButtons().firstOrNull { it.isFavorite }?.let {
                    setPrimaryCustomButtonTitle(it)
                }
            }
            "switch_episode" -> {
                when (data) {
                    "n" -> changeEpisode(false)
                    "p" -> changeEpisode(true)
                }
            }
            "launch_int_picker" -> {
                val (title, nameFormat, start, stop, step, pickerProperty) = data.split("|")
                val defaultValue = MPVLib.getPropertyInt(pickerProperty)
                showDialog(
                    Dialogs.IntegerPicker(
                        defaultValue = defaultValue,
                        minValue = start.toInt(),
                        maxValue = stop.toInt(),
                        step = step.toInt(),
                        nameFormat = nameFormat,
                        title = title,
                        onChange = { MPVLib.setPropertyInt(pickerProperty, it) },
                        onDismissRequest = { showDialog(Dialogs.None) },
                    ),
                )
            }
            "pause" -> {
                when (data) {
                    "pause" -> pause()
                    "unpause" -> unpause()
                    "pauseunpause" -> pauseUnpause()
                }
            }
            "seek_to_with_text" -> {
                val (seekValue, text) = data.split("|", limit = 2)
                seekToWithText(seekValue.toInt(), text)
            }
            "seek_by_with_text" -> {
                val (seekValue, text) = data.split("|", limit = 2)
                seekByWithText(seekValue.toInt(), text)
            }
            "seek_by" -> seekByWithText(data.toInt(), null)
            "seek_to" -> seekToWithText(data.toInt(), null)
            "toggle_button" -> {
                fun showButton() {
                    if (_primaryButton.value == null) {
                        _primaryButton.update {
                            customButtons.value.getButtons().firstOrNull { it.isFavorite }
                        }
                    }
                }

                when (data) {
                    "show" -> showButton()
                    "hide" -> _primaryButton.update { null }
                    "toggle" -> if (_primaryButton.value == null) showButton() else _primaryButton.update { null }
                }
            }

            "software_keyboard" -> when (data) {
                "show" -> forceShowSoftwareKeyboard()
                "hide" -> forceHideSoftwareKeyboard()
                "toggle" -> if (inputMethodManager.isActive) {
                    forceHideSoftwareKeyboard()
                } else {
                    forceShowSoftwareKeyboard()
                }
            }
        }

        MPVLib.setPropertyString(property, "")
    }

    private operator fun <T> List<T>.component6(): T = get(5)

    private val inputMethodManager = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    private fun forceShowSoftwareKeyboard() {
        inputMethodManager.toggleSoftInput(InputMethodManager.SHOW_FORCED, 0)
    }

    private fun forceHideSoftwareKeyboard() {
        inputMethodManager.toggleSoftInput(InputMethodManager.SHOW_IMPLICIT, 0)
    }

    private val doubleTapToSeekDuration = gesturePreferences.skipLengthPreference().get()
    private val preciseSeek = gesturePreferences.playerSmoothSeek().get()
    private val showSeekBar = gesturePreferences.showSeekBar().get()

    private fun seekToWithText(seekValue: Int, text: String?) {
        _isSeekingForwards.value = seekValue > 0
        _doubleTapSeekAmount.value = seekValue - pos.value.toInt()
        _seekText.update { _ -> text }
        seekTo(seekValue, preciseSeek)
        if (showSeekBar) showSeekBar()
    }

    private fun seekByWithText(value: Int, text: String?) {
        _doubleTapSeekAmount.update { if (value < 0 && it < 0 || pos.value + value > duration.value) 0 else it + value }
        _seekText.update { text }
        _isSeekingForwards.value = value > 0
        seekBy(value, preciseSeek)
        if (showSeekBar) showSeekBar()
    }

    fun updateSeekAmount(amount: Int) {
        _doubleTapSeekAmount.update { _ -> amount }
    }

    fun updateSeekText(value: String?) {
        _seekText.update { _ -> value }
    }

    fun leftSeek() {
        if (pos.value > 0) {
            _doubleTapSeekAmount.value -= doubleTapToSeekDuration
        }
        _isSeekingForwards.value = false
        seekBy(-doubleTapToSeekDuration, preciseSeek)
        if (showSeekBar) showSeekBar()
    }

    fun rightSeek() {
        if (pos.value < duration.value) {
            _doubleTapSeekAmount.value += doubleTapToSeekDuration
        }
        _isSeekingForwards.value = true
        seekBy(doubleTapToSeekDuration, preciseSeek)
        if (showSeekBar) showSeekBar()
    }

    fun resetHosterState() {
        _pausedState.update { _ -> false }
        _hosterState.update { _ -> emptyList() }
        _hosterList.update { _ -> emptyList() }
        _hosterExpandedList.update { _ -> emptyList() }
        _selectedHosterVideoIndex.update { _ -> Pair(-1, -1) }
    }

    fun changeEpisode(previous: Boolean, autoPlay: Boolean = false) {
        if (previous && !hasPreviousEpisode.value) {
            activity.showToast(activity.stringResource(MR.strings.no_prev_episode))
            return
        }

        if (!previous && !hasNextEpisode.value) {
            activity.showToast(activity.stringResource(MR.strings.no_next_episode))
            return
        }

        activity.changeEpisode(
            episodeId = getAdjacentEpisodeId(previous = previous),
            autoPlay = autoPlay,
        )
    }

    fun onEpisodeEnded(eofReached: Boolean) {
        if (!eofReached) return
        if (!playerPreferences.autoplayEnabled().get()) return

        val anime = currentAnime.value ?: return
        if (bingeSessionState.value.active) {
            refreshBingeWatchElapsed()
            _bingeSessionState.update {
                it.copy(episodesWatched = it.episodesWatched + 1)
            }
        }
        val resolution = resolveNextEpisodeForTransition(skipFiller = anime.skipFiller) ?: return
        if (resolution.skippedFillerCount > 0) {
            playerUpdate.update {
                PlayerUpdates.ShowText("Skipped ${resolution.skippedFillerCount} filler episode(s)")
            }
        }

        val countdown = if (bingeSessionState.value.active) {
            3
        } else {
            anime.nextEpisodeCardCountdown
        }
        if (countdown == 0) {
            activity.changeEpisode(episodeId = resolution.episodeId, autoPlay = true)
            return
        }

        nextEpisodeJob?.cancel()
        _nextEpisodeCard.update {
            NextEpisodeCardState(
                nextEpisodeId = resolution.episodeId,
                nextEpisodeTitle = resolution.title,
                countdownSeconds = countdown,
                skippedFillerCount = resolution.skippedFillerCount,
            )
        }
        nextEpisodeJob = viewModelScope.launch {
            for (remaining in countdown downTo 1) {
                _nextEpisodeCard.update { current ->
                    current?.copy(countdownSeconds = remaining)
                }
                delay(1000)
            }
            playNextEpisodeNow()
        }
    }

    fun playNextEpisodeNow() {
        val card = nextEpisodeCard.value ?: return
        cancelNextEpisodeCard()
        activity.changeEpisode(episodeId = card.nextEpisodeId, autoPlay = true)
    }

    fun cancelNextEpisodeCard() {
        nextEpisodeJob?.cancel()
        nextEpisodeJob = null
        _nextEpisodeCard.update { null }
    }

    private data class NextEpisodeResolution(
        val episodeId: Long,
        val title: String,
        val skippedFillerCount: Int,
    )

    private fun resolveNextEpisodeForTransition(skipFiller: Boolean): NextEpisodeResolution? {
        val currentIndex = getCurrentEpisodeIndex()
        if (currentIndex < 0) return null
        val playlist = currentPlaylist.value
        if (currentIndex >= playlist.lastIndex) return null

        var skipped = 0
        for (index in (currentIndex + 1)..playlist.lastIndex) {
            val episode = playlist[index]
            val isFiller = EpisodeType.fromDb(episode.episode_type) == EpisodeType.FILLER || episode.fillermark
            if (skipFiller && isFiller) {
                skipped++
                continue
            }
            return NextEpisodeResolution(
                episodeId = episode.id ?: return null,
                title = episode.name,
                skippedFillerCount = skipped,
            )
        }
        return null
    }

    fun handleLeftDoubleTap() {
        when (gesturePreferences.leftDoubleTapGesture().get()) {
            SingleActionGesture.Seek -> {
                leftSeek()
            }
            SingleActionGesture.PlayPause -> {
                pauseUnpause()
            }
            SingleActionGesture.Custom -> {
                MPVLib.command(arrayOf("keypress", CustomKeyCodes.DoubleTapLeft.keyCode))
            }
            SingleActionGesture.None -> {}
            SingleActionGesture.Switch -> changeEpisode(true)
        }
    }

    fun triggerGestureAction(action: GestureAction) {
        when (action) {
            GestureAction.NONE -> Unit
            GestureAction.SEEK_BACKWARD -> leftSeek()
            GestureAction.SEEK_FORWARD -> rightSeek()
            GestureAction.BRIGHTNESS -> Unit
            GestureAction.VOLUME -> Unit
            GestureAction.SPEED_BOOST -> {
                longPressOriginalSpeed = playbackSpeed.value
                MPVLib.setPropertyDouble("speed", 2.0)
                playerUpdate.update { PlayerUpdates.ShowText("2x speed") }
            }
            GestureAction.SCREENSHOT -> captureScreenshotQuick(showSubtitles = false)
            GestureAction.BOOKMARK -> addTimestampBookmark()
        }
    }

    fun onLongPressGestureStart(action: GestureAction) {
        longPressGestureAction = action
        when (action) {
            GestureAction.SPEED_BOOST -> {
                if (longPressOriginalSpeed == null) {
                    longPressOriginalSpeed = playbackSpeed.value
                    MPVLib.setPropertyDouble("speed", 2.0)
                    playerUpdate.update { PlayerUpdates.ShowText("2x speed") }
                }
            }
            GestureAction.SCREENSHOT -> captureScreenshotQuick(showSubtitles = false)
            GestureAction.BOOKMARK -> addTimestampBookmark()
            else -> Unit
        }
    }

    fun onLongPressGestureEnd() {
        if (longPressGestureAction == GestureAction.SPEED_BOOST) {
            val restoreSpeed = longPressOriginalSpeed ?: playbackSpeed.value
            MPVLib.setPropertyDouble("speed", restoreSpeed.toDouble())
            playerUpdate.update { PlayerUpdates.None }
            longPressOriginalSpeed = null
        }
        longPressGestureAction = null
    }

    fun handleCenterDoubleTap() {
        when (gesturePreferences.centerDoubleTapGesture().get()) {
            SingleActionGesture.PlayPause -> {
                pauseUnpause()
            }
            SingleActionGesture.Custom -> {
                MPVLib.command(arrayOf("keypress", CustomKeyCodes.DoubleTapCenter.keyCode))
            }
            SingleActionGesture.Seek -> {}
            SingleActionGesture.None -> {}
            SingleActionGesture.Switch -> {}
        }
    }

    fun handleRightDoubleTap() {
        when (gesturePreferences.rightDoubleTapGesture().get()) {
            SingleActionGesture.Seek -> {
                rightSeek()
            }
            SingleActionGesture.PlayPause -> {
                pauseUnpause()
            }
            SingleActionGesture.Custom -> {
                MPVLib.command(arrayOf("keypress", CustomKeyCodes.DoubleTapRight.keyCode))
            }
            SingleActionGesture.None -> {}
            SingleActionGesture.Switch -> changeEpisode(false)
        }
    }

    override fun onCleared() {
        nextEpisodeJob?.cancel()
        bingeReminderJob?.cancel()
        if (currentEpisode.value != null) {
            saveWatchingProgress(currentEpisode.value!!)
            episodeToDownload?.let {
                downloadManager.addDownloadsToStartOfQueue(listOf(it))
            }
        }
    }

    fun updateCastProgress(position: Float) {
        _pos.update { position }
    }

    fun resumeFromCast() {
        val lastPosition = _pos.value

        logcat { "Reanudando el video local desde: $lastPosition segundos" }

        if (lastPosition > 0) {
            seekTo(lastPosition.toInt()) // Mueve el reproductor local a la última posición
        }
    }

    // ====== OLD ======

    private val eventChannel = Channel<Event>()
    val eventFlow = eventChannel.receiveAsFlow()

    val incognitoMode = basePreferences.incognitoMode().get()
    private val downloadAheadAmount = downloadPreferences.autoDownloadWhileReading().get()

    internal val relativeTime = uiPreferences.relativeTime().get()
    internal val dateFormat = UiPreferences.dateFormat(uiPreferences.dateFormat().get())

    /**
     * The position in the current video. Used to restore from process kill.
     */
    private var episodePosition = savedState.get<Long>("episode_position")
        set(value) {
            savedState["episode_position"] = value
            field = value
        }

    /**
     * The current video's quality index. Used to restore from process kill.
     */
    private var qualityIndex = savedState.get<Pair<Int, Int>>("quality_index") ?: Pair(-1, -1)
        set(value) {
            savedState["quality_index"] = value
            field = value
        }

    /**
     * The episode id of the currently loaded episode. Used to restore from process kill.
     */
    private var episodeId = savedState.get<Long>("episode_id") ?: -1L
        set(value) {
            savedState["episode_id"] = value
            field = value
        }

    private var episodeToDownload: Download? = null

    data class NextEpisodeCardState(
        val nextEpisodeId: Long,
        val nextEpisodeTitle: String,
        val countdownSeconds: Int,
        val skippedFillerCount: Int,
    )

    enum class ClipExportMode {
        FAST_COPY,
        REENCODE_NO_SUBS,
        BURN_IN_SUBS,
    }

    data class ClipEditorState(
        val inputUri: String,
        val markInMs: Long,
        val markOutMs: Long,
        val exportMode: ClipExportMode = ClipExportMode.FAST_COPY,
        val burnInSupported: Boolean = false,
        val note: String = "",
        val isExporting: Boolean = false,
    )

    data class BingeSessionState(
        val active: Boolean = false,
        val episodesWatched: Int = 0,
        val elapsedWatchMs: Long = 0L,
        val reminderIntervalMinutes: Int = 45,
    )

    data class BingeReminderState(
        val episodesWatched: Int,
        val elapsedWatchMs: Long,
    )

    private fun filterEpisodeList(episodes: List<Episode>): List<Episode> {
        val anime = currentAnime.value ?: return episodes
        val selectedEpisode = episodes.find { it.id == episodeId }
            ?: error("Requested episode of id $episodeId not found in episode list")

        val episodesForPlayer = episodes.filterNot {
            anime.unseenFilterRaw == Anime.EPISODE_SHOW_SEEN &&
                !it.seen ||
                anime.unseenFilterRaw == Anime.EPISODE_SHOW_UNSEEN &&
                it.seen ||
                anime.downloadedFilterRaw == Anime.EPISODE_SHOW_DOWNLOADED &&
                !downloadManager.isEpisodeDownloaded(
                    it.name,
                    it.scanlator,
                    anime.title,
                    anime.source,
                ) ||
                anime.downloadedFilterRaw == Anime.EPISODE_SHOW_NOT_DOWNLOADED &&
                downloadManager.isEpisodeDownloaded(
                    it.name,
                    it.scanlator,
                    anime.title,
                    anime.source,
                ) ||
                anime.bookmarkedFilterRaw == Anime.EPISODE_SHOW_BOOKMARKED &&
                !it.bookmark ||
                anime.bookmarkedFilterRaw == Anime.EPISODE_SHOW_NOT_BOOKMARKED &&
                it.bookmark ||
                // AM (FILLERMARK) -->
                anime.fillermarkedFilterRaw == Anime.EPISODE_SHOW_FILLERMARKED &&
                !it.fillermark ||
                anime.fillermarkedFilterRaw == Anime.EPISODE_SHOW_NOT_FILLERMARKED &&
                it.fillermark ||
                anime.hideFiller &&
                (EpisodeType.fromDb(it.episode_type) == EpisodeType.FILLER || it.fillermark)
            // <-- AM (FILLERMARK)
        }.toMutableList()

        if (episodesForPlayer.all { it.id != episodeId }) {
            episodesForPlayer += listOf(selectedEpisode)
        }

        return episodesForPlayer
    }

    fun getCurrentEpisodeIndex(): Int {
        return currentPlaylist.value.indexOfFirst { currentEpisode.value?.id == it.id }
    }

    private fun getAdjacentEpisodeId(previous: Boolean): Long {
        val newIndex = if (previous) getCurrentEpisodeIndex() - 1 else getCurrentEpisodeIndex() + 1

        return when {
            previous && getCurrentEpisodeIndex() == 0 -> -1L
            !previous && currentPlaylist.value.lastIndex == getCurrentEpisodeIndex() -> -1L
            else -> currentPlaylist.value.getOrNull(newIndex)?.id ?: -1L
        }
    }

    fun updateHasNextEpisode(value: Boolean) {
        _hasNextEpisode.update { _ -> value }
    }

    fun updateHasPreviousEpisode(value: Boolean) {
        _hasPreviousEpisode.update { _ -> value }
    }

    fun showEpisodeListDialog() {
        if (currentAnime.value != null) {
            showDialog(Dialogs.EpisodeList)
        }
    }

    /**
     * Called when the activity is saved and not changing configurations. It updates the database
     * to persist the current progress of the active episode.
     */
    fun onSaveInstanceStateNonConfigurationChange() {
        val currentEpisode = currentEpisode.value ?: return
        viewModelScope.launchNonCancellable {
            saveEpisodeProgress(currentEpisode)
        }
    }

    // ====== Initialize anime, episode, hoster, and video list ======

    fun updateIsLoadingHosters(value: Boolean) {
        _isLoadingHosters.update { _ -> value }
    }

    /**
     * Whether this presenter is initialized yet.
     */
    private fun needsInit(): Boolean {
        return currentAnime.value == null || currentEpisode.value == null
    }

    data class InitResult(
        val hosterList: List<Hoster>?,
        val videoIndex: Pair<Int, Int>,
        val position: Long?,
    )

    private var currentHosterList: List<Hoster>? = null

    class ExceptionWithStringResource(
        message: String,
        val stringResource: StringResource,
    ) : Exception(message)

    suspend fun init(
        animeId: Long,
        initialEpisodeId: Long,
        hostList: String,
        hostIndex: Int,
        vidIndex: Int,
    ): Pair<InitResult, Result<Boolean>> {
        val defaultResult = InitResult(currentHosterList, qualityIndex, null)
        if (!needsInit()) return Pair(defaultResult, Result.success(true))
        return try {
            val anime = getAnime.await(animeId)
            if (anime != null) {
                _currentAnime.update { _ -> anime }
                animeTitle.update { _ -> anime.title }
                loadPlaybackProfile(anime)
                sourceManager.isInitialized.first { it }
                if (episodeId == -1L) episodeId = initialEpisodeId

                checkTrackers(anime)

                updateEpisodeList(initEpisodeList(anime))

                val episode = currentPlaylist.value.first { it.id == episodeId }
                val source = sourceManager.getOrStub(anime.source)

                _currentEpisode.update { _ -> episode }
                _currentSource.update { _ -> source }

                updateEpisode(episode)

                _hasPreviousEpisode.update { _ -> getCurrentEpisodeIndex() != 0 }
                _hasNextEpisode.update { _ -> getCurrentEpisodeIndex() != currentPlaylist.value.size - 1 }

                // Write to mpv table
                MPVLib.setPropertyString("user-data/current-anime/anime-title", anime.title)
                MPVLib.setPropertyInt("user-data/current-anime/intro-length", getAnimeSkipIntroLength())
                MPVLib.setPropertyString(
                    "user-data/current-anime/category",
                    getAnimeCategories.await(anime.id).joinToString {
                        it.name
                    },
                )

                val currentEp = currentEpisode.value
                    ?: throw ExceptionWithStringResource("No episode loaded", MR.strings.no_episode_loaded)
                if (hostList.isNotBlank()) {
                    val parsedHosterList = hostList.toHosterList().ifEmpty {
                        currentHosterList = null
                        throw ExceptionWithStringResource(
                            "Hoster selected from empty list",
                            MR.strings.select_hoster_from_empty_list,
                        )
                    }
                    val orderedHosterList = sourceFallbackManager.orderCandidates(
                        animeId = anime.id,
                        candidates = parsedHosterList,
                        sourceIdSelector = ::hosterSourceId,
                    )
                    currentHosterList = orderedHosterList
                    val reorderedHostIndex = parsedHosterList
                        .getOrNull(hostIndex)
                        ?.let(::hosterSourceId)
                        ?.let { selectedSourceId ->
                            orderedHosterList.indexOfFirst { hosterSourceId(it) == selectedSourceId }
                        }
                        ?.takeIf { it >= 0 }
                    qualityIndex = Pair(reorderedHostIndex ?: hostIndex, vidIndex)
                } else {
                    EpisodeLoader.getHosters(currentEp.toDomainEpisode()!!, anime, source)
                        .takeIf { it.isNotEmpty() }
                        ?.let {
                            sourceFallbackManager.orderCandidates(
                                animeId = anime.id,
                                candidates = it,
                                sourceIdSelector = ::hosterSourceId,
                            )
                        }
                        ?.also { currentHosterList = it }
                        ?: run {
                            currentHosterList = null
                            throw ExceptionWithStringResource("Hoster list is empty", MR.strings.no_hosters)
                        }
                }

                val result = InitResult(
                    hosterList = currentHosterList,
                    videoIndex = qualityIndex,
                    position = episodePosition,
                )
                Pair(result, Result.success(true))
            } else {
                // Unlikely but okay
                Pair(defaultResult, Result.success(false))
            }
        } catch (e: Throwable) {
            Pair(defaultResult, Result.failure(e))
        }
    }

    private fun updateEpisode(episode: Episode) {
        mediaTitle.update { _ -> episode.name }
        _isEpisodeOnline.update { _ -> isEpisodeOnline() == true }
        MPVLib.setPropertyDouble("user-data/current-anime/episode-number", episode.episode_number.toDouble())
    }

    private fun initEpisodeList(anime: Anime): List<Episode> {
        val episodes = runBlocking { getEpisodesByAnimeId.await(anime.id) }

        return episodes
            .sortedWith(getEpisodeSort(anime, sortDescending = false))
            .run {
                if (basePreferences.downloadedOnly().get()) {
                    filterDownloadedEpisodes(anime)
                } else {
                    this
                }
            }
            .map { it.toDbEpisode() }
    }

    private var hasTrackers: Boolean = false
    private val checkTrackers: (Anime) -> Unit = { anime ->
        val tracks = runBlocking { getTracks.await(anime.id) }
        hasTrackers = tracks.isNotEmpty()
    }

    private var getHosterVideoLinksJob: Job? = null
    private val runtimeFallbackMutex = Mutex()

    fun cancelHosterVideoLinksJob() {
        getHosterVideoLinksJob?.cancel()
    }

    /**
     * Set the video list for hosters.
     */
    fun loadHosters(source: AnimeSource, hosterList: List<Hoster>, hosterIndex: Int, videoIndex: Int) {
        val hasFoundPreferredVideo = AtomicBoolean(false)
        sourceFallbackManager.setLoading()

        _hosterList.update { _ -> hosterList }
        _hosterExpandedList.update { _ ->
            List(hosterList.size) { true }
        }

        getHosterVideoLinksJob?.cancel()
        getHosterVideoLinksJob = viewModelScope.launchIO {
            _hosterState.update { _ ->
                hosterList.map { hoster ->
                    if (hoster.videoList == null) {
                        HosterState.Loading(hoster.hosterName)
                    } else {
                        val videoList = hoster.videoList!!
                        HosterState.Ready(
                            hoster.hosterName,
                            videoList,
                            List(videoList.size) { Video.State.QUEUE },
                        )
                    }
                }
            }

            try {
                coroutineScope {
                    hosterList.mapIndexed { hosterIdx, hoster ->
                        async {
                            val hosterState = EpisodeLoader.loadHosterVideos(source, hoster)

                            _hosterState.updateAt(hosterIdx, hosterState)

                            if (hosterState is HosterState.Ready) {
                                if (hosterIdx == hosterIndex) {
                                    hosterState.videoList.getOrNull(videoIndex)?.let {
                                        hasFoundPreferredVideo.set(true)
                                        val success = loadVideo(source, it, hosterIndex, videoIndex)
                                        if (!success) {
                                            hasFoundPreferredVideo.set(false)
                                        }
                                    }
                                }

                                val prefIndex = hosterState.videoList.indexOfFirst { it.preferred }
                                if (prefIndex != -1 && hosterIndex == -1) {
                                    if (hasFoundPreferredVideo.compareAndSet(false, true)) {
                                        if (selectedHosterVideoIndex.value == Pair(-1, -1)) {
                                            val success =
                                                loadVideo(
                                                    source,
                                                    hosterState.videoList[prefIndex],
                                                    hosterIdx,
                                                    prefIndex,
                                                )
                                            if (!success) {
                                                hasFoundPreferredVideo.set(false)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }.awaitAll()

                    if (hasFoundPreferredVideo.compareAndSet(false, true)) {
                        val (hosterIdx, videoIdx) = HosterLoader.selectBestVideo(hosterState.value)
                        if (hosterIdx == -1) {
                            throw ExceptionWithStringResource("No available videos", MR.strings.no_available_videos)
                        }

                        val video = (hosterState.value[hosterIdx] as HosterState.Ready).videoList[videoIdx]

                        loadVideo(source, video, hosterIdx, videoIdx)
                    }
                }
            } catch (e: CancellationException) {
                _hosterState.update { _ ->
                    hosterList.map { HosterState.Idle(it.hosterName) }
                }

                throw e
            }
        }
    }

    private suspend fun loadVideo(source: AnimeSource?, video: Video, hosterIndex: Int, videoIndex: Int): Boolean {
        val selectedHosterState = (_hosterState.value[hosterIndex] as? HosterState.Ready) ?: return false
        val sourceId = hosterSourceId(hosterList.value[hosterIndex])
        updateIsLoadingEpisode(true)

        val oldSelectedIndex = _selectedHosterVideoIndex.value
        _selectedHosterVideoIndex.update { _ -> Pair(hosterIndex, videoIndex) }

        _hosterState.updateAt(
            hosterIndex,
            selectedHosterState.getChangedAt(videoIndex, video, Video.State.LOAD_VIDEO),
        )

        // Pause until everything has loaded
        updatePausedState()
        pause()

        val resolveStartMs = System.currentTimeMillis()
        val resolvedVideo = if (selectedHosterState.videoState[videoIndex] != Video.State.READY) {
            HosterLoader.getResolvedVideo(source, video)
        } else {
            video
        }

        if (resolvedVideo == null || resolvedVideo.videoUrl.isEmpty()) {
            sourceFallbackManager.recordFailure(sourceId)
            if (currentVideo.value == null) {
                _hosterState.updateAt(
                    hosterIndex,
                    selectedHosterState.getChangedAt(videoIndex, video, Video.State.ERROR),
                )

                val (newHosterIdx, newVideoIdx) = HosterLoader.selectBestVideo(hosterState.value)
                if (newHosterIdx == -1) {
                    sourceFallbackManager.setAllFailed()
                    if (_hosterState.value.any { it is HosterState.Loading }) {
                        _selectedHosterVideoIndex.update { _ -> Pair(-1, -1) }
                        return false
                    } else {
                        throw ExceptionWithStringResource("No available videos", MR.strings.no_available_videos)
                    }
                }

                val newVideo = (hosterState.value[newHosterIdx] as HosterState.Ready).videoList[newVideoIdx]
                val nextSourceId = hosterList.value.getOrNull(newHosterIdx)?.let(::hosterSourceId)
                if (nextSourceId != null) {
                    sourceFallbackManager.setFallingBack(nextSourceId)
                    withUIContext {
                        activity.toast("Source failed, trying ${hosterList.value[newHosterIdx].hosterName}...")
                    }
                }

                return loadVideo(source, newVideo, newHosterIdx, newVideoIdx)
            } else {
                _selectedHosterVideoIndex.update { _ -> oldSelectedIndex }
                _hosterState.updateAt(
                    hosterIndex,
                    selectedHosterState.getChangedAt(videoIndex, video, Video.State.ERROR),
                )
                return false
            }
        }

        _hosterState.updateAt(
            hosterIndex,
            selectedHosterState.getChangedAt(videoIndex, resolvedVideo, Video.State.READY),
        )
        sourceFallbackManager.recordSuccess(sourceId, System.currentTimeMillis() - resolveStartMs)

        _currentVideo.update { _ -> resolvedVideo }

        qualityIndex = Pair(hosterIndex, videoIndex)
        savePlaybackProfile(preferredSource = sourceId)

        activity.setVideo(resolvedVideo)
        return true
    }

    suspend fun recoverFromRuntimePlaybackFailure(httpStatus: Int): Boolean {
        if (httpStatus !in 400..599) return false

        return runtimeFallbackMutex.withLock {
            if (isLoadingHosters.value || hosterState.value.isEmpty()) return@withLock false

            val source = currentSource.value as? AnimeSource ?: return@withLock false
            val (failedHosterIndex, failedVideoIndex) = selectedHosterVideoIndex.value
            val failedHosterState = hosterState.value.getOrNull(failedHosterIndex) as? HosterState.Ready
                ?: return@withLock false
            val failedVideo = failedHosterState.videoList.getOrNull(failedVideoIndex) ?: return@withLock false

            val failedSourceId = hosterList.value.getOrNull(failedHosterIndex)?.let(::hosterSourceId)
            if (failedSourceId != null) {
                sourceFallbackManager.recordFailure(failedSourceId)
            }
            _hosterState.updateAt(
                failedHosterIndex,
                failedHosterState.getChangedAt(failedVideoIndex, failedVideo, Video.State.ERROR),
            )

            var (nextHosterIndex, nextVideoIndex) = HosterLoader.selectBestVideo(hosterState.value)
            while (nextHosterIndex != -1) {
                val nextHosterState = hosterState.value.getOrNull(nextHosterIndex) as? HosterState.Ready
                val nextVideo = nextHosterState?.videoList?.getOrNull(nextVideoIndex)
                if (nextHosterState == null || nextVideo == null) {
                    break
                }

                val nextSourceId = hosterList.value.getOrNull(nextHosterIndex)?.let(::hosterSourceId)
                if (nextSourceId != null) {
                    sourceFallbackManager.setFallingBack(nextSourceId)
                    val nextHosterName = hosterList.value.getOrNull(nextHosterIndex)?.hosterName ?: "next source"
                    withUIContext {
                        activity.toast("Source failed, trying $nextHosterName...")
                    }
                }

                val recovered = loadVideo(source, nextVideo, nextHosterIndex, nextVideoIndex)
                if (recovered) {
                    return@withLock true
                }

                val nextSelection = HosterLoader.selectBestVideo(hosterState.value)
                nextHosterIndex = nextSelection.first
                nextVideoIndex = nextSelection.second
            }

            sourceFallbackManager.setAllFailed()
            false
        }
    }

    private fun hosterSourceId(hoster: Hoster): String {
        return when {
            hoster.hosterUrl.isNotBlank() -> hoster.hosterUrl
            hoster.hosterName.isNotBlank() -> hoster.hosterName
            else -> "unknown"
        }
    }

    fun onVideoClicked(hosterIndex: Int, videoIndex: Int) {
        val hosterState = _hosterState.value[hosterIndex] as? HosterState.Ready
        val video = hosterState?.videoList
            ?.getOrNull(videoIndex)
            ?: return // Shouldn't happen, but just in case™

        val videoState = hosterState.videoState
            .getOrNull(videoIndex)
            ?: return

        if (videoState == Video.State.ERROR) {
            return
        }

        viewModelScope.launchIO {
            val success = loadVideo(currentSource.value, video, hosterIndex, videoIndex)
            if (success) {
                if (sheetShown.value == Sheets.QualityTracks) {
                    dismissSheet()
                }
            } else {
                updateIsLoadingEpisode(false)
            }
        }
    }

    fun onHosterClicked(index: Int) {
        when (hosterState.value[index]) {
            is HosterState.Ready -> {
                _hosterExpandedList.updateAt(index, !_hosterExpandedList.value[index])
            }
            is HosterState.Idle -> {
                val hosterName = hosterList.value[index].hosterName
                _hosterState.updateAt(index, HosterState.Loading(hosterName))

                viewModelScope.launchIO {
                    val hosterState = EpisodeLoader.loadHosterVideos(currentSource.value!!, hosterList.value[index])
                    _hosterState.updateAt(index, hosterState)
                }
            }
            is HosterState.Loading, is HosterState.Error -> {}
        }
    }

    private fun <T> MutableStateFlow<List<T>>.updateAt(index: Int, newValue: T) {
        this.update { values ->
            values.toMutableList().apply {
                this[index] = newValue
            }
        }
    }

    data class EpisodeLoadResult(
        val hosterList: List<Hoster>?,
        val episodeTitle: String,
        val source: AnimeSource,
    )

    suspend fun loadEpisode(episodeId: Long?): EpisodeLoadResult? {
        val anime = currentAnime.value ?: return null
        val source = sourceManager.getOrStub(anime.source)

        val chosenEpisode = currentPlaylist.value.firstOrNull { ep -> ep.id == episodeId } ?: return null

        _currentEpisode.update { _ -> chosenEpisode }
        updateEpisode(chosenEpisode)

        return withIOContext {
            try {
                val currentEpisode =
                    currentEpisode.value
                        ?: throw ExceptionWithStringResource("No episode loaded", MR.strings.no_episode_loaded)
                currentHosterList = EpisodeLoader.getHosters(
                    currentEpisode.toDomainEpisode()!!,
                    anime,
                    source,
                )

                this@PlayerViewModel.episodeId = currentEpisode.id!!
            } catch (e: Exception) {
                logcat(LogPriority.ERROR, e) { e.message ?: "Error getting links" }
            }

            EpisodeLoadResult(
                hosterList = currentHosterList,
                episodeTitle = anime.title + " - " + chosenEpisode.name,
                source = source,
            )
        }
    }

    /**
     * Called every time a second is reached in the player. Used to mark the flag of episode being
     * seen, update tracking services, enqueue downloaded episode deletion and download next episode.
     */
    private fun onSecondReached(position: Int, duration: Int) {
        if (isLoadingEpisode.value) return
        val currentEp = currentEpisode.value ?: return
        if (episodeId == -1L) return
        if (duration == 0) return

        val seconds = position * 1000L
        val totalSeconds = duration * 1000L
        // Save last second seen and mark as seen if needed
        currentEp.last_second_seen = seconds
        currentEp.total_seconds = totalSeconds

        episodePosition = seconds

        val progress = playerPreferences.progressPreference().get()
        val shouldTrack = !incognitoMode || hasTrackers
        if (isCompletionReached(seconds, totalSeconds, progress) && shouldTrack) {
            currentEp.seen = true
            updateTrackEpisodeSeen(currentEp)
            deleteEpisodeIfNeeded(currentEp)
        }

        saveWatchingProgress(currentEp)

        val inDownloadRange = seconds.toDouble() / totalSeconds > 0.35
        if (inDownloadRange) {
            downloadNextEpisodes()
        }
    }

    private fun downloadNextEpisodes() {
        if (downloadAheadAmount == 0) return
        val anime = currentAnime.value ?: return

        // Only download ahead if current + next episode is already downloaded too to avoid jank
        if (getCurrentEpisodeIndex() == currentPlaylist.value.lastIndex) return
        val currentEpisode = currentEpisode.value ?: return

        val nextEpisode = currentPlaylist.value[getCurrentEpisodeIndex() + 1]
        val episodesAreDownloaded =
            EpisodeLoader.isDownload(currentEpisode.toDomainEpisode()!!, anime) &&
                EpisodeLoader.isDownload(nextEpisode.toDomainEpisode()!!, anime)

        viewModelScope.launchIO {
            if (!episodesAreDownloaded) {
                return@launchIO
            }
            val episodesToDownload = getNextEpisodes.await(anime.id, nextEpisode.id!!)
                .take(downloadAheadAmount)
            downloadManager.downloadEpisodes(anime, episodesToDownload)
        }
    }

    private fun isCompletionReached(
        seconds: Long,
        totalSeconds: Long,
        progressThreshold: Float,
    ): Boolean {
        val endingStartMs = aniSkipSegments
            .firstOrNull { it.type == ChapterType.Ending }
            ?.start
            ?.times(1000)
            ?.toLong()

        if (endingStartMs != null && seconds >= endingStartMs) return true
        if (seconds >= (totalSeconds - 90_000L)) return true
        return seconds >= (totalSeconds * progressThreshold)
    }

    /**
     * Determines if deleting option is enabled and nth to last episode actually exists.
     * If both conditions are satisfied enqueues episode for delete
     * @param chosenEpisode current episode, which is going to be marked as seen.
     */
    private fun deleteEpisodeIfNeeded(chosenEpisode: Episode) {
        // Determine which episode should be deleted and enqueue
        val currentEpisodePosition = currentPlaylist.value.indexOf(chosenEpisode)
        val removeAfterSeenSlots = downloadPreferences.removeAfterReadSlots().get()
        val episodeToDelete = currentPlaylist.value.getOrNull(
            currentEpisodePosition - removeAfterSeenSlots,
        )
        // If episode is completely seen no need to download it
        episodeToDownload = null

        // Check if deleting option is enabled and episode exists
        if (removeAfterSeenSlots != -1 && episodeToDelete != null) {
            enqueueDeleteSeenEpisodes(episodeToDelete)
        }
    }

    fun saveCurrentEpisodeWatchingProgress() {
        currentEpisode.value?.let { saveWatchingProgress(it) }
    }

    /**
     * Called when episode is changed in player or when activity is paused.
     */
    private fun saveWatchingProgress(episode: Episode) {
        viewModelScope.launchNonCancellable {
            saveEpisodeProgress(episode)
            saveEpisodeHistory(episode)
        }
    }

    /**
     * Saves this [episode] progress (last second seen and whether it's seen).
     * If incognito mode isn't on or has at least 1 tracker
     */
    private suspend fun saveEpisodeProgress(episode: Episode) {
        if (!incognitoMode || hasTrackers) {
            updateEpisode.await(
                EpisodeUpdate(
                    id = episode.id!!,
                    seen = episode.seen,
                    bookmark = episode.bookmark,
                    lastSecondSeen = episode.last_second_seen,
                    totalSeconds = episode.total_seconds,
                ),
            )
        }
    }

    /**
     * Saves this [episode] last seen history if incognito mode isn't on.
     */
    private suspend fun saveEpisodeHistory(episode: Episode) {
        if (!incognitoMode) {
            val episodeId = episode.id!!
            val seenAt = Date()
            upsertHistory.await(
                HistoryUpdate(episodeId, seenAt, 0),
            )
        }
    }

    /**
     * Bookmarks the currently active episode.
     */
    fun bookmarkEpisode(episodeId: Long?, bookmarked: Boolean) {
        viewModelScope.launchNonCancellable {
            updateEpisode.await(
                EpisodeUpdate(
                    id = episodeId!!,
                    bookmark = bookmarked,
                ),
            )
        }
    }

    fun addTimestampBookmark(note: String? = null) {
        val anime = currentAnime.value ?: return
        val episode = currentEpisode.value ?: return
        viewModelScope.launchIO {
            captureRepository.insert(
                CaptureEntry(
                    id = 0L,
                    animeId = anime.id,
                    episodeId = episode.id,
                    type = CaptureType.BOOKMARK,
                    mediaUri = null,
                    positionMs = pos.value.toLong() * 1000L,
                    note = note,
                    createdAt = System.currentTimeMillis(),
                ),
            )
            playerUpdate.update { PlayerUpdates.ShowText("Bookmark saved") }
        }
    }

    fun openClipMode() {
        val anime = currentAnime.value ?: return
        val episode = currentEpisode.value ?: return
        val source = currentSource.value ?: return
        val domainEpisode = episode.toDomainEpisode() ?: return

        val isLocalEpisode = anime.isLocal()
        val isDownloadedEpisode = isLocalEpisode || EpisodeLoader.isDownload(domainEpisode, anime)
        if (!isDownloadedEpisode) {
            downloadManager.downloadEpisodes(anime, listOf(domainEpisode), autoStart = true)
            activity.showToast("Clip mode requires a downloaded episode. Download started.")
            return
        }

        val localVideo = runCatching {
            downloadManager.buildVideo(source, anime, domainEpisode)
        }.getOrElse {
            activity.showToast(it.message ?: "Unable to load local video for clipping.")
            return
        }

        val currentMs = (pos.value * 1000L).toLong().coerceAtLeast(0L)
        val durationMs = (duration.value * 1000L).toLong().takeIf { it > 0L } ?: (currentMs + 30_000L)
        val defaultOut = (currentMs + 30_000L).coerceAtMost(durationMs)
        val selectedSubtitleId = selectedSubtitles.value.first
        val burnInSupported = selectedSubtitleId != -1 && Uri.parse(localVideo.videoUrl).scheme != "content"

        _clipEditorState.update {
            ClipEditorState(
                inputUri = localVideo.videoUrl,
                markInMs = currentMs.coerceAtMost(defaultOut),
                markOutMs = defaultOut,
                exportMode = ClipExportMode.FAST_COPY,
                burnInSupported = burnInSupported,
            )
        }
        showSheet(Sheets.Clip)
    }

    fun closeClipMode() {
        _clipEditorState.update { null }
        showSheet(Sheets.None)
    }

    fun markClipInAtCurrentPosition() {
        val currentMs = (pos.value * 1000L).toLong().coerceAtLeast(0L)
        _clipEditorState.update { state ->
            if (state == null) return@update null
            state.copy(markInMs = currentMs.coerceAtMost(state.markOutMs - 500L))
        }
    }

    fun markClipOutAtCurrentPosition() {
        val currentMs = (pos.value * 1000L).toLong().coerceAtLeast(0L)
        _clipEditorState.update { state ->
            if (state == null) return@update null
            state.copy(markOutMs = currentMs.coerceAtLeast(state.markInMs + 500L))
        }
    }

    fun updateClipNote(note: String) {
        _clipEditorState.update { state ->
            state?.copy(note = note)
        }
    }

    fun updateClipExportMode(mode: ClipExportMode) {
        _clipEditorState.update { state ->
            state?.copy(exportMode = mode)
        }
    }

    fun exportCurrentClip() {
        val state = clipEditorState.value ?: return
        if (state.isExporting) return
        val anime = currentAnime.value ?: return
        val episode = currentEpisode.value ?: return

        val clipStartMs = state.markInMs
        val clipEndMs = state.markOutMs
        if (clipEndMs <= clipStartMs + 500L) {
            activity.showToast("Clip out point must be after clip in point.")
            return
        }

        _clipEditorState.update { it?.copy(isExporting = true) }

        viewModelScope.launchIO {
            val notifier = ClipExportNotifier(activity)
            notifier.onProgress(0)
            try {
                val outputUri = createClipOutputUri() ?: error("Unable to create clip output file.")
                val ffmpegCommand = buildClipFfmpegCommand(
                    state = state,
                    inputPath = Uri.parse(state.inputUri).toFFmpegString(activity),
                    outputPath = outputUri.toFFmpegString(activity),
                )
                val clipDurationMs = (clipEndMs - clipStartMs).coerceAtLeast(1L)
                val session = FFmpegSession.create(
                    FFmpegKitConfig.parseArguments(ffmpegCommand),
                    {},
                    LogCallback { log ->
                        if (log.level <= Level.AV_LOG_WARNING) {
                            log.message?.let { message ->
                                logcat(LogPriority.ERROR) { "Clip export: $message" }
                            }
                        }
                    },
                    StatisticsCallback { statistics ->
                        val progress = ((statistics.time.toDouble() / clipDurationMs) * 100.0)
                            .toInt()
                            .coerceIn(0, 100)
                        notifier.onProgress(progress)
                    },
                )
                FFmpegKitConfig.ffmpegExecute(session)
                if (!ReturnCode.isSuccess(session.returnCode)) {
                    error("Clip export failed.")
                }

                DiskUtil.scanMedia(activity, outputUri)
                captureRepository.insert(
                    CaptureEntry(
                        id = 0L,
                        animeId = anime.id,
                        episodeId = episode.id,
                        type = CaptureType.CLIP,
                        mediaUri = outputUri.toString(),
                        positionMs = clipStartMs,
                        note = state.note.takeIf { it.isNotBlank() },
                        createdAt = System.currentTimeMillis(),
                    ),
                )
                notifier.onComplete(outputUri)
                withUIContext {
                    playerUpdate.update { PlayerUpdates.ShowText("Clip saved") }
                    closeClipMode()
                }
            } catch (e: Throwable) {
                notifier.onError(e.message ?: "Clip export failed.")
                withUIContext {
                    activity.showToast(e.message ?: "Clip export failed.")
                    _clipEditorState.update { it?.copy(isExporting = false) }
                }
            }
        }
    }

    private fun buildClipFfmpegCommand(
        state: ClipEditorState,
        inputPath: String,
        outputPath: String,
    ): String {
        val clipStartSeconds = state.markInMs / 1000.0
        val clipEndSeconds = state.markOutMs / 1000.0
        val mode = when {
            state.exportMode == ClipExportMode.BURN_IN_SUBS && !state.burnInSupported -> {
                ClipExportMode.REENCODE_NO_SUBS
            }
            else -> state.exportMode
        }
        return when (mode) {
            ClipExportMode.FAST_COPY -> {
                "-ss $clipStartSeconds -to $clipEndSeconds -i \"$inputPath\" " +
                    "-c copy -movflags +faststart \"$outputPath\" -y"
            }
            ClipExportMode.REENCODE_NO_SUBS -> {
                "-ss $clipStartSeconds -to $clipEndSeconds -i \"$inputPath\" " +
                    "-map 0:v:0 -map 0:a? -sn -c:v libx264 -preset veryfast -crf 22 -c:a aac " +
                    "-movflags +faststart \"$outputPath\" -y"
            }
            ClipExportMode.BURN_IN_SUBS -> {
                "-ss $clipStartSeconds -to $clipEndSeconds -i \"$inputPath\" " +
                    "-vf subtitles=\"$inputPath\" -map 0:v:0 -map 0:a? -sn " +
                    "-c:v libx264 -preset medium -crf 22 -c:a aac -movflags +faststart \"$outputPath\" -y"
            }
        }
    }

    private fun createClipOutputUri(): Uri? {
        val fileName = "relay_clip_${System.currentTimeMillis()}.mp4"
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = contentValuesOf(
                MediaStore.MediaColumns.DISPLAY_NAME to fileName,
                MediaStore.MediaColumns.MIME_TYPE to "video/mp4",
                MediaStore.MediaColumns.RELATIVE_PATH to listOf(
                    Environment.DIRECTORY_MOVIES,
                    activity.stringResource(MR.strings.app_name),
                    "Clips",
                ).joinToString(File.separator),
            )
            activity.contentResolver.insert(
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
                values,
            )
        } else {
            @Suppress("DEPRECATION")
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),
                "${activity.stringResource(MR.strings.app_name)}/Clips",
            )
            if (!dir.exists()) dir.mkdirs()
            File(dir, fileName).toURI().let { Uri.parse(it.toString()) }
        }
    }

    // AM (FILLERMARK) -->
    /**
     * Fillermarks the currently active episode.
     */
    fun fillermarkEpisode(episodeId: Long?, fillermarked: Boolean) {
        viewModelScope.launchNonCancellable {
            updateEpisode.await(
                EpisodeUpdate(
                    id = episodeId!!,
                    fillermark = fillermarked,
                ),
            )
        }
    }
    // <-- AM (FILLERMARK)

    fun takeScreenshot(cachePath: String, showSubtitles: Boolean): InputStream? {
        val filename = cachePath + "/${System.currentTimeMillis()}_mpv_screenshot_tmp.png"
        val subtitleFlag = if (showSubtitles) "subtitles" else "video"

        MPVLib.command(arrayOf("screenshot-to-file", filename, subtitleFlag))
        val tempFile = File(filename).takeIf { it.exists() } ?: return null
        val newFile = File("$cachePath/mpv_screenshot.png")

        newFile.delete()
        tempFile.renameTo(newFile)
        return newFile.takeIf { it.exists() }?.inputStream()
    }

    fun captureScreenshotQuick(showSubtitles: Boolean) {
        val screenshot = takeScreenshot(cachePath, showSubtitles) ?: return
        saveImage(imageStream = { screenshot }, timePos = pos.value.toInt())
    }

    /**
     * Saves the screenshot on the pictures directory and notifies the UI of the result.
     * There's also a notification to allow sharing the image somewhere else or deleting it.
     */
    fun saveImage(imageStream: () -> InputStream, timePos: Int?) {
        val anime = currentAnime.value ?: return

        val context = Injekt.get<Application>()
        val notifier = SaveImageNotifier(context)
        notifier.onClear()

        val seconds = timePos?.let { Utils.prettyTime(it) } ?: return
        val filename = generateFilename(anime, seconds) ?: return

        // Pictures directory.
        val relativePath = DiskUtil.buildValidFilename(anime.title)

        // Copy file in background.
        viewModelScope.launchNonCancellable {
            try {
                val uri = imageSaver.save(
                    image = Image.Page(
                        inputStream = imageStream,
                        name = filename,
                        location = Location.Pictures(relativePath),
                    ),
                )
                captureRepository.insert(
                    CaptureEntry(
                        id = 0L,
                        animeId = anime.id,
                        episodeId = currentEpisode.value?.id,
                        type = CaptureType.SCREENSHOT,
                        mediaUri = uri.toString(),
                        positionMs = (timePos ?: pos.value.toInt()).toLong() * 1000L,
                        note = null,
                        createdAt = System.currentTimeMillis(),
                    ),
                )
                notifier.onComplete(uri)
                eventChannel.send(Event.SavedImage(SaveImageResult.Success(uri)))
            } catch (e: Throwable) {
                notifier.onError(e.message)
                eventChannel.send(Event.SavedImage(SaveImageResult.Error(e)))
            }
        }
    }

    /**
     * Shares the screenshot and notifies the UI with the path of the file to share.
     * The image must be first copied to the internal partition because there are many possible
     * formats it can come from, like a zipped chapter, in which case it's not possible to directly
     * get a path to the file and it has to be decompressed somewhere first. Only the last shared
     * image will be kept so it won't be taking lots of internal disk space.
     */
    fun shareImage(imageStream: () -> InputStream, timePos: Int?) {
        val anime = currentAnime.value ?: return

        val context = Injekt.get<Application>()
        val destDir = context.cacheImageDir

        val seconds = timePos?.let { Utils.prettyTime(it) } ?: return
        val filename = generateFilename(anime, seconds) ?: return

        try {
            viewModelScope.launchIO {
                destDir.deleteRecursively()
                val uri = imageSaver.save(
                    image = Image.Page(
                        inputStream = imageStream,
                        name = filename,
                        location = Location.Cache,
                    ),
                )
                eventChannel.send(Event.ShareImage(uri, seconds))
            }
        } catch (e: Throwable) {
            logcat(LogPriority.ERROR, e)
        }
    }

    /**
     * Sets the screenshot as cover and notifies the UI of the result.
     */
    fun setAsCover(imageStream: () -> InputStream) {
        val anime = currentAnime.value ?: return

        viewModelScope.launchNonCancellable {
            val result = try {
                anime.editCover(Injekt.get(), imageStream())
                if (anime.isLocal() || anime.favorite) {
                    SetAsCover.Success
                } else {
                    SetAsCover.AddToLibraryFirst
                }
            } catch (e: Exception) {
                SetAsCover.Error
            }
            eventChannel.send(Event.SetCoverResult(result))
        }
    }

    /**
     * Results of the save image feature.
     */
    sealed class SaveImageResult {
        class Success(val uri: Uri) : SaveImageResult()
        class Error(val error: Throwable) : SaveImageResult()
    }

    private fun updateTrackEpisodeSeen(episode: Episode) {
        if (basePreferences.incognitoMode().get() || !hasTrackers) return
        if (!trackPreferences.autoUpdateTrack().get()) return

        val anime = currentAnime.value ?: return
        val context = Injekt.get<Application>()

        viewModelScope.launchNonCancellable {
            trackEpisode.await(context, anime.id, episode.episode_number.toDouble())
        }
    }

    /**
     * Enqueues this [episode] to be deleted when [deletePendingEpisodes] is called. The download
     * manager handles persisting it across process deaths.
     */
    private fun enqueueDeleteSeenEpisodes(episode: Episode) {
        if (!episode.seen) return
        val anime = currentAnime.value ?: return
        viewModelScope.launchNonCancellable {
            downloadManager.enqueueEpisodesToDelete(listOf(episode.toDomainEpisode()!!), anime)
        }
    }

    /**
     * Deletes all the pending episodes. This operation will run in a background thread and errors
     * are ignored.
     */
    fun deletePendingEpisodes() {
        viewModelScope.launchNonCancellable {
            downloadManager.deletePendingEpisodes()
        }
    }

    /**
     * Returns the skipIntroLength used by this anime or the default one.
     */
    fun getAnimeSkipIntroLength(): Int {
        val default = gesturePreferences.defaultIntroLength().get()
        val anime = currentAnime.value ?: return default
        val skipIntroLength = anime.skipIntroLength
        val skipIntroDisable = anime.skipIntroDisable
        return when {
            skipIntroDisable -> 0
            skipIntroLength <= 0 -> default
            else -> anime.skipIntroLength
        }
    }

    /**
     * Updates the skipIntroLength for the open anime.
     */
    fun setAnimeSkipIntroLength(skipIntroLength: Long) {
        val anime = currentAnime.value ?: return
        if (!anime.favorite) return
        // Skip unnecessary database operation
        if (skipIntroLength == getAnimeSkipIntroLength().toLong()) return
        viewModelScope.launchIO {
            setAnimeViewerFlags.awaitSetSkipIntroLength(anime.id, skipIntroLength)
            _currentAnime.update { _ -> getAnime.await(anime.id) }
        }
    }

    /**
     * Generate a filename for the given [anime] and [timePos]
     */
    private fun generateFilename(
        anime: Anime,
        timePos: String,
    ): String? {
        val episode = currentEpisode.value ?: return null
        val filenameSuffix = " - $timePos"
        return DiskUtil.buildValidFilename(
            "${anime.title} - ${episode.name}".takeBytes(
                DiskUtil.MAX_FILE_NAME_BYTES - filenameSuffix.byteSize(),
            ),
        ) + filenameSuffix
    }

    /**
     * Returns the response of the AniSkipApi for this episode.
     * just works if tracking is enabled.
     */
    suspend fun aniSkipResponse(playerDuration: Int?): List<TimeStamp>? {
        val animeId = currentAnime.value?.id ?: return null
        val episodeNumber = currentEpisode.value?.episode_number?.toInt() ?: return null
        val duration = playerDuration?.toLong() ?: return null
        val tracks = getTracks.await(animeId)
        if (tracks.isEmpty()) {
            logcat { "AniSkip: No tracks found for anime $animeId" }
            aniSkipSegments = emptyList()
            return null
        }

        val malId = tracks.firstNotNullOfOrNull { track ->
            when (track.trackerId) {
                1L -> track.remoteId.takeIf { it > 0 }
                TrackerManager.ANILIST -> aniSkipRepository.getMalIdFromAniList(track.remoteId)
                else -> null
            }
        }

        if (malId == null || malId <= 0) {
            aniSkipSegments = emptyList()
            return null
        }

        val mappedSegments = aniSkipRepository
            .getSkipTimes(
                malId = malId.toInt(),
                episodeNumber = episodeNumber,
                episodeLength = duration,
            )
            .map { it.toTimeStamp() }

        aniSkipSegments = mappedSegments
        return mappedSegments.takeIf { it.isNotEmpty() }
    }

    val introSkipEnabled = playerPreferences.enableSkipIntro().get()
    private val autoSkip = playerPreferences.autoSkipIntro().get()
    private val netflixStyle = playerPreferences.enableNetflixStyleIntroSkip().get()

    private val defaultWaitingTime = playerPreferences.waitingTimeIntroSkip().get()
    var waitingSkipIntro = defaultWaitingTime

    fun setChapter(position: Float) {
        getCurrentChapter(position)?.let { (chapterIndex, chapter) ->
            if (currentChapter.value != chapter) {
                _currentChapter.update { _ -> chapter }
            }

            if (!introSkipEnabled) {
                return
            }

            if (chapter.chapterType == ChapterType.Other) {
                _skipIntroText.update { _ -> null }
                _postCreditsAhead.update { false }
                waitingSkipIntro = defaultWaitingTime
            } else {
                val aniSkipPreference = getAniSkipPreference()
                val isAniSkipChapter = isAniSkipChapter(chapter)
                if (isAniSkipChapter && aniSkipPreference == AniSkipPreference.OFF) {
                    _skipIntroText.update { _ -> null }
                    _postCreditsAhead.update { false }
                    waitingSkipIntro = defaultWaitingTime
                    return
                }

                val nextChapterPos = chapters.value.getOrNull(chapterIndex + 1)?.start ?: pos.value
                val useNetflixStyle = netflixStyle &&
                    !(isAniSkipChapter && aniSkipPreference == AniSkipPreference.BUTTON)
                val bingeOpeningAutoSkip = bingeSessionState.value.active &&
                    bingeSessionState.value.episodesWatched > 0 &&
                    (chapter.chapterType == ChapterType.Opening || chapter.chapterType == ChapterType.MixedOp)
                val shouldAutoSkip = if (isAniSkipChapter) {
                    aniSkipPreference == AniSkipPreference.AUTO
                } else {
                    autoSkip || bingeOpeningAutoSkip
                }
                val suppressEndingSkip = shouldSuppressEndingAutoSkip(chapter, shouldAutoSkip)
                if (suppressEndingSkip) {
                    _postCreditsAhead.update { true }
                    _skipIntroText.update { _ -> "Post-credits ahead" }
                    return
                } else {
                    _postCreditsAhead.update { false }
                }

                if (useNetflixStyle) {
                    // show a toast with the seconds before the skip
                    if (waitingSkipIntro == defaultWaitingTime) {
                        activity.showToast(
                            "Skip Intro: ${activity.stringResource(
                                MR.strings.player_aniskip_dontskip_toast,
                                chapter.name,
                                waitingSkipIntro,
                            )}",
                        )
                    }
                    showSkipIntroButton(chapter, nextChapterPos, waitingSkipIntro)
                    waitingSkipIntro--
                } else if (shouldAutoSkip) {
                    seekToWithText(
                        seekValue = nextChapterPos.toInt(),
                        text = activity.stringResource(MR.strings.player_intro_skipped, chapter.name),
                    )
                } else {
                    updateSkipIntroButton(chapter.chapterType)
                }
            }
        }
    }

    private fun updateSkipIntroButton(chapterType: ChapterType) {
        val skipButtonString = chapterType.getStringRes()

        _skipIntroText.update { _ ->
            skipButtonString?.let {
                activity.stringResource(
                    MR.strings.player_skip_action,
                    activity.stringResource(skipButtonString),
                )
            }
        }
    }

    private fun showSkipIntroButton(chapter: IndexedSegment, nextChapterPos: Float, waitingTime: Int) {
        if (waitingTime > -1) {
            if (waitingTime > 0) {
                _skipIntroText.update { _ -> activity.stringResource(MR.strings.player_aniskip_dontskip) }
            } else {
                seekToWithText(
                    seekValue = nextChapterPos.toInt(),
                    text = activity.stringResource(MR.strings.player_aniskip_skip, chapter.name),
                )
            }
        } else {
            // when waitingTime is -1, it means that the user cancelled the skip
            updateSkipIntroButton(chapter.chapterType)
        }
    }

    fun onSkipIntro() {
        getCurrentChapter()?.let { (chapterIndex, chapter) ->
            // this stops the counter
            if (waitingSkipIntro > 0 && netflixStyle) {
                waitingSkipIntro = -1
                return
            }

            val nextChapterPos = chapters.value.getOrNull(chapterIndex + 1)?.start ?: pos.value

            seekToWithText(
                seekValue = nextChapterPos.toInt(),
                text = activity.stringResource(MR.strings.player_aniskip_skip, chapter.name),
            )
        }
    }

    private fun getCurrentChapter(position: Float? = null): IndexedValue<IndexedSegment>? {
        return chapters.value.withIndex()
            .filter { it.value.start <= (position ?: pos.value) }
            .maxByOrNull { it.value.start }
    }

    private fun shouldSuppressEndingAutoSkip(
        chapter: IndexedSegment,
        shouldAutoSkip: Boolean,
    ): Boolean {
        val isEnding = chapter.chapterType == ChapterType.Ending
        if (!isEnding || !shouldAutoSkip) return false
        val ending = aniSkipSegments
            .firstOrNull { it.type == ChapterType.Ending }
            ?: return false
        val durationMs = duration.value.toLong() * 1000L
        val tailMs = durationMs - (ending.end * 1000L).toLong()
        return tailMs >= 45_000L
    }

    fun getAniSkipPreference(): AniSkipPreference {
        return playbackProfileSkipPreference ?: currentAnime.value?.aniSkipPreference ?: AniSkipPreference.BUTTON
    }

    fun setAniSkipPreference(preference: AniSkipPreference) {
        val anime = currentAnime.value ?: return
        viewModelScope.launchIO {
            setAnimeViewerFlags.awaitSetAniSkipPreference(anime.id, preference)
            savePlaybackProfile(skipPreference = preference)
            _currentAnime.update { _ -> getAnime.await(anime.id) }
        }
    }

    fun shouldLoadAniSkipSegments(): Boolean {
        return getAniSkipPreference() != AniSkipPreference.OFF
    }

    fun clearAniSkipSegments() {
        aniSkipSegments = emptyList()
    }

    private fun isAniSkipChapter(chapter: IndexedSegment): Boolean {
        if (chapter.chapterType == ChapterType.Other) return false
        return aniSkipSegments.any { stamp ->
            kotlin.math.abs(stamp.start - chapter.start.toDouble()) < 1.0
        }
    }

    private fun SkipSegment.toTimeStamp(): TimeStamp {
        val type = when (type) {
            SkipSegmentType.OP -> ChapterType.Opening
            SkipSegmentType.ED -> ChapterType.Ending
            SkipSegmentType.RECAP -> ChapterType.Recap
            SkipSegmentType.MIXED_OP -> ChapterType.MixedOp
            SkipSegmentType.MIXED_ED -> ChapterType.Ending
        }
        val name = when (this.type) {
            SkipSegmentType.OP -> "Opening"
            SkipSegmentType.ED -> "Ending"
            SkipSegmentType.RECAP -> "Recap"
            SkipSegmentType.MIXED_OP -> "Mixed-op"
            SkipSegmentType.MIXED_ED -> "Mixed-ed"
        }
        return TimeStamp(
            start = startMs / 1000.0,
            end = endMs / 1000.0,
            name = name,
            type = type,
        )
    }

    fun setPlaybackSpeed(speed: Float) {
        val normalizedSpeed = speed.coerceIn(0.25f, 2.0f)
        MPVLib.setPropertyDouble("speed", normalizedSpeed.toDouble())
        playbackSpeed.update { normalizedSpeed }
        savePlaybackProfile(playbackSpeed = normalizedSpeed)
    }

    fun toggleAudioNormalization() {
        setAudioNormalizationEnabled(!audioNormalizeEnabled.value)
    }

    fun cycleAudioNormalizationLevel() {
        val nextLevel = if (audioNormalizeLevel.value >= 1f) 0f else audioNormalizeLevel.value + 0.1f
        setAudioNormalizationLevel(nextLevel)
    }

    fun setAudioNormalizationLevel(level: Float) {
        val clampedLevel = level.coerceIn(0f, 1f)
        _audioNormalizeLevel.update { clampedLevel }
        if (audioNormalizeEnabled.value) {
            applyAudioNormalization(enabled = true, level = clampedLevel)
        }
        savePlaybackProfile(normalizeLevel = clampedLevel)
    }

    private fun setAudioNormalizationEnabled(enabled: Boolean) {
        _audioNormalizeEnabled.update { enabled }
        applyAudioNormalization(enabled = enabled, level = audioNormalizeLevel.value)
        savePlaybackProfile(audioNormalize = enabled)
    }

    private fun applyAudioNormalization(enabled: Boolean, level: Float) {
        MPVLib.command(arrayOf("af", "remove", "@relaynorm"))
        if (!enabled) return
        val strength = 1f + (level.coerceIn(0f, 1f) * 20f)
        val strengthString = String.format(Locale.US, "%.2f", strength)
        MPVLib.command(arrayOf("af", "add", "@relaynorm:lavfi=[dynaudnorm=f=$strengthString]"))
    }

    private suspend fun loadPlaybackProfile(anime: Anime) {
        val profile = playbackProfileRepository.getByAnimeId(anime.id)
        playbackProfile = profile
        playbackProfileSkipPreference = profile?.skipPreference
        _nightModeEnabled.update { false }
        nightModePreviousBrightness = null
        nightModePreviousAudioNormalizeEnabled = null
        nightModePreviousAudioNormalizeLevel = null
        if (profile == null) return

        profile.preferredSource
            ?.takeIf { it.isNotBlank() }
            ?.let {
                sourceHealthRepository.setSourcePriority(anime.id, it, 0)
            }

        playbackSpeed.update { profile.playbackSpeed }
        MPVLib.setPropertyDouble("speed", profile.playbackSpeed.toDouble())

        _audioNormalizeLevel.update { profile.normalizeLevel.coerceIn(0f, 1f) }
        _audioNormalizeEnabled.update { profile.audioNormalize }
        applyAudioNormalization(
            enabled = profile.audioNormalize,
            level = _audioNormalizeLevel.value,
        )
        changeBrightnessTo(profile.brightnessOffset, persistProfile = false)
    }

    fun toggleNightMode() {
        if (nightModeEnabled.value) {
            disableNightMode()
        } else {
            enableNightMode()
        }
    }

    private fun enableNightMode() {
        if (nightModeEnabled.value) return
        nightModePreviousBrightness = currentBrightness.value
        nightModePreviousAudioNormalizeEnabled = audioNormalizeEnabled.value
        nightModePreviousAudioNormalizeLevel = audioNormalizeLevel.value

        setAudioNormalizationLevel(1f)
        setAudioNormalizationEnabled(true)
        val dimmedBrightness = (currentBrightness.value - 0.35f).coerceIn(-0.75f, 1f)
        changeBrightnessTo(dimmedBrightness)
        _nightModeEnabled.update { true }
    }

    private fun disableNightMode() {
        if (!nightModeEnabled.value) return
        val restoreAudioLevel = nightModePreviousAudioNormalizeLevel ?: audioNormalizeLevel.value
        val restoreAudioEnabled = nightModePreviousAudioNormalizeEnabled ?: false
        val restoreBrightness = nightModePreviousBrightness ?: currentBrightness.value

        setAudioNormalizationLevel(restoreAudioLevel)
        setAudioNormalizationEnabled(restoreAudioEnabled)
        changeBrightnessTo(restoreBrightness)
        _nightModeEnabled.update { false }
        nightModePreviousBrightness = null
        nightModePreviousAudioNormalizeEnabled = null
        nightModePreviousAudioNormalizeLevel = null
    }

    private fun savePlaybackProfile(
        preferredSource: String? = playbackProfile?.preferredSource,
        audioTrack: String? = playbackProfile?.audioTrack,
        subtitleTrack: String? = playbackProfile?.subtitleTrack,
        playbackSpeed: Float = this.playbackSpeed.value,
        skipPreference: AniSkipPreference? = playbackProfileSkipPreference,
        audioNormalize: Boolean = audioNormalizeEnabled.value,
        normalizeLevel: Float = audioNormalizeLevel.value,
        brightnessOffset: Float = playbackProfile?.brightnessOffset ?: 0f,
    ) {
        val animeId = currentAnime.value?.id ?: return
        val updated = PlaybackProfile(
            animeId = animeId,
            preferredSource = preferredSource,
            audioTrack = audioTrack,
            subtitleTrack = subtitleTrack,
            playbackSpeed = playbackSpeed,
            skipPreference = skipPreference,
            audioNormalize = audioNormalize,
            normalizeLevel = normalizeLevel,
            brightnessOffset = brightnessOffset,
            updatedAt = System.currentTimeMillis(),
        )
        playbackProfile = updated
        playbackProfileSkipPreference = skipPreference
        viewModelScope.launchIO {
            playbackProfileRepository.upsert(updated)
        }
    }

    fun setPrimaryCustomButtonTitle(button: CustomButton) {
        _primaryButtonTitle.update { _ -> button.name }
    }

    sealed class Event {
        data class SetCoverResult(val result: SetAsCover) : Event()
        data class SavedImage(val result: SaveImageResult) : Event()
        data class ShareImage(val uri: Uri, val seconds: String) : Event()
    }
}

fun CustomButton.execute() {
    MPVLib.command(arrayOf("script-message", "call_button_$id"))
}

fun CustomButton.executeLongPress() {
    MPVLib.command(arrayOf("script-message", "call_button_${id}_long"))
}

fun Float.normalize(inMin: Float, inMax: Float, outMin: Float, outMax: Float): Float {
    return (this - inMin) * (outMax - outMin) / (inMax - inMin) + outMin
}
