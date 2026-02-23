package tachiyomi.domain.capture.repository

import tachiyomi.domain.capture.model.CaptureEntry

interface CaptureRepository {

    suspend fun getAll(): List<CaptureEntry>

    suspend fun getByAnimeId(animeId: Long): List<CaptureEntry>

    suspend fun insert(entry: CaptureEntry)

    suspend fun deleteByIds(ids: List<Long>)
}
