package tachiyomi.data.playback

import tachiyomi.data.DatabaseHandler
import tachiyomi.domain.aniskip.model.AniSkipPreference
import tachiyomi.domain.playback.model.PlaybackProfile
import tachiyomi.domain.playback.repository.PlaybackProfileRepository

class PlaybackProfileRepositoryImpl(
    private val handler: DatabaseHandler,
) : PlaybackProfileRepository {

    override suspend fun getByAnimeId(animeId: Long): PlaybackProfile? {
        return handler.awaitOneOrNull {
            playback_profileQueries.getByAnimeId(animeId)
        }?.let(::mapToDomain)
    }

    override suspend fun upsert(profile: PlaybackProfile) {
        handler.await {
            playback_profileQueries.upsert(
                animeId = profile.animeId,
                preferredSource = profile.preferredSource,
                audioTrack = profile.audioTrack,
                subtitleTrack = profile.subtitleTrack,
                playbackSpeed = profile.playbackSpeed.toDouble(),
                skipPreference = profile.skipPreference?.name?.lowercase(),
                audioNormalize = profile.audioNormalize,
                normalizeLevel = profile.normalizeLevel.toDouble(),
                brightnessOffset = profile.brightnessOffset.toDouble(),
                updatedAt = profile.updatedAt,
            )
        }
    }

    private fun mapToDomain(row: tachiyomi.data.Playback_profile): PlaybackProfile {
        return PlaybackProfile(
            animeId = row.anime_id,
            preferredSource = row.preferred_source,
            audioTrack = row.audio_track,
            subtitleTrack = row.subtitle_track,
            playbackSpeed = row.playback_speed.toFloat(),
            skipPreference = row.skip_preference.toAniSkipPreferenceOrNull(),
            audioNormalize = row.audio_normalize,
            normalizeLevel = row.normalize_level.toFloat(),
            brightnessOffset = row.brightness_offset.toFloat(),
            updatedAt = row.updated_at,
        )
    }

    private fun String?.toAniSkipPreferenceOrNull(): AniSkipPreference? {
        return when (this?.lowercase()) {
            AniSkipPreference.AUTO.name.lowercase() -> AniSkipPreference.AUTO
            AniSkipPreference.BUTTON.name.lowercase() -> AniSkipPreference.BUTTON
            AniSkipPreference.OFF.name.lowercase() -> AniSkipPreference.OFF
            else -> null
        }
    }
}
