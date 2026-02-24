package tachiyomi.domain.capture.repository

import kotlinx.coroutines.flow.Flow
import tachiyomi.domain.capture.model.CaptureEntry

interface CaptureRepository {

    fun subscribeAll(): Flow<List<CaptureEntry>>

    fun subscribeByAnimeId(animeId: Long): Flow<List<CaptureEntry>>

    suspend fun getAll(): List<CaptureEntry>

    suspend fun getByAnimeId(animeId: Long): List<CaptureEntry>

    suspend fun insert(entry: CaptureEntry)

    suspend fun updateNote(id: Long, note: String?)

    suspend fun updateReference(id: Long, animeId: Long, episodeId: Long?)

    suspend fun deleteByIds(ids: List<Long>)
}
