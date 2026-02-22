package tachiyomi.domain.playback.repository

import tachiyomi.domain.playback.model.PlaybackProfile

interface PlaybackProfileRepository {

    suspend fun getByAnimeId(animeId: Long): PlaybackProfile?

    suspend fun upsert(profile: PlaybackProfile)
}
