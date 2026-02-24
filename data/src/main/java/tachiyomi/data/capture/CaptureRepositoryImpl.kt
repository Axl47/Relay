package tachiyomi.data.capture

import kotlinx.coroutines.flow.Flow
import tachiyomi.data.DatabaseHandler
import tachiyomi.domain.capture.model.CaptureEntry
import tachiyomi.domain.capture.model.CaptureType
import tachiyomi.domain.capture.repository.CaptureRepository

class CaptureRepositoryImpl(
    private val handler: DatabaseHandler,
) : CaptureRepository {

    override fun subscribeAll(): Flow<List<CaptureEntry>> {
        return handler.subscribeToList {
            session_bookmarkQueries.getAll(::mapRow)
        }
    }

    override fun subscribeByAnimeId(animeId: Long): Flow<List<CaptureEntry>> {
        return handler.subscribeToList {
            session_bookmarkQueries.getByAnimeId(animeId, ::mapRow)
        }
    }

    override suspend fun getAll(): List<CaptureEntry> {
        return handler.awaitList { session_bookmarkQueries.getAll(::mapRow) }
    }

    override suspend fun getByAnimeId(animeId: Long): List<CaptureEntry> {
        return handler.awaitList { session_bookmarkQueries.getByAnimeId(animeId, ::mapRow) }
    }

    override suspend fun insert(entry: CaptureEntry) {
        handler.await {
            session_bookmarkQueries.insertEntry(
                animeId = entry.animeId,
                episodeId = entry.episodeId,
                captureType = entry.type.toDbValue(),
                mediaUri = entry.mediaUri,
                positionMs = entry.positionMs,
                note = entry.note,
                createdAt = entry.createdAt,
            )
        }
    }

    override suspend fun updateNote(id: Long, note: String?) {
        handler.await {
            session_bookmarkQueries.updateNoteById(
                id = id,
                note = note,
            )
        }
    }

    override suspend fun updateReference(id: Long, animeId: Long, episodeId: Long?) {
        handler.await {
            session_bookmarkQueries.updateReferenceById(
                id = id,
                animeId = animeId,
                episodeId = episodeId,
            )
        }
    }

    override suspend fun deleteByIds(ids: List<Long>) {
        if (ids.isEmpty()) return
        handler.await {
            session_bookmarkQueries.deleteByIds(ids)
        }
    }

    private fun mapRow(
        id: Long,
        animeId: Long,
        episodeId: Long?,
        captureType: String,
        mediaUri: String?,
        positionMs: Long,
        note: String?,
        createdAt: Long,
    ): CaptureEntry {
        return CaptureEntry(
            id = id,
            animeId = animeId,
            episodeId = episodeId,
            type = CaptureType.fromDb(captureType),
            mediaUri = mediaUri,
            positionMs = positionMs,
            note = note,
            createdAt = createdAt,
        )
    }
}
