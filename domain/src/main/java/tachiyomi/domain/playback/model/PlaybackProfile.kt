package tachiyomi.domain.playback.model

import tachiyomi.domain.aniskip.model.AniSkipPreference

data class PlaybackProfile(
    val animeId: Long,
    val preferredSource: String?,
    val audioTrack: String?,
    val subtitleTrack: String?,
    val playbackSpeed: Float,
    val skipPreference: AniSkipPreference?,
    val audioNormalize: Boolean,
    val normalizeLevel: Float,
    val brightnessOffset: Float,
    val updatedAt: Long,
)
