package eu.kanade.tachiyomi.ui.bookmarks

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Immutable
import cafe.adriel.voyager.core.model.StateScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import eu.kanade.core.util.insertSeparators
import eu.kanade.tachiyomi.ui.main.MainActivity
import eu.kanade.tachiyomi.util.lang.toLocalDate
import eu.kanade.tachiyomi.util.system.toast
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import tachiyomi.core.common.i18n.stringResource
import tachiyomi.core.common.util.lang.launchIO
import tachiyomi.domain.anime.interactor.GetAnime
import tachiyomi.domain.capture.model.CaptureEntry
import tachiyomi.domain.capture.model.CaptureType
import tachiyomi.domain.capture.repository.CaptureRepository
import tachiyomi.domain.episode.interactor.GetEpisode
import tachiyomi.i18n.MR
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.text.DateFormat
import java.util.Date

class BookmarksShowScreenModel(
    val animeId: Long,
    private val captureRepository: CaptureRepository = Injekt.get(),
    private val getAnime: GetAnime = Injekt.get(),
    private val getEpisode: GetEpisode = Injekt.get(),
) : StateScreenModel<BookmarksShowScreenModel.State>(State()) {

    private var allItems: List<CaptureWithEpisode> = emptyList()
    private var visibleIds: List<Long> = emptyList()

    init {
        screenModelScope.launchIO {
            val animeTitle = getAnime.await(animeId)?.title
            mutableState.update { it.copy(animeTitle = animeTitle) }
            rebuild()
        }

        screenModelScope.launchIO {
            captureRepository.subscribeByAnimeId(animeId).collectLatest { entries ->
                val scopedEntries = entries
                    .filter { it.type == CaptureType.CLIP || it.type == CaptureType.BOOKMARK }
                val episodeNames = scopedEntries
                    .mapNotNull(CaptureEntry::episodeId)
                    .distinct()
                    .associateWith { getEpisode.await(it)?.name }

                allItems = scopedEntries.map { entry ->
                    CaptureWithEpisode(
                        entry = entry,
                        episodeName = entry.episodeId?.let(episodeNames::get),
                    )
                }

                val validIds = allItems.map { it.entry.id }.toSet()
                mutableState.update { current ->
                    current.copy(
                        isLoading = false,
                        selectedIds = current.selectedIds.intersect(validIds),
                    )
                }
                rebuild()
            }
        }
    }

    fun search(query: String?) {
        mutableState.update {
            it.copy(
                searchQuery = query?.takeIf(String::isNotBlank),
                selectedIds = emptySet(),
            )
        }
        rebuild()
    }

    fun setFilter(filter: TypeFilter) {
        mutableState.update {
            it.copy(
                typeFilter = filter,
                selectedIds = emptySet(),
            )
        }
        rebuild()
    }

    fun toggleSort() {
        mutableState.update {
            it.copy(
                sortDescending = !it.sortDescending,
                selectedIds = emptySet(),
            )
        }
        rebuild()
    }

    fun toggleSelection(id: Long) {
        mutableState.update { current ->
            val selected = current.selectedIds.toMutableSet()
            if (!selected.add(id)) selected.remove(id)
            current.copy(selectedIds = selected)
        }
        rebuild()
    }

    fun clearSelection() {
        mutableState.update { it.copy(selectedIds = emptySet()) }
        rebuild()
    }

    fun selectAllVisible() {
        mutableState.update { it.copy(selectedIds = visibleIds.toSet()) }
        rebuild()
    }

    fun invertSelectionVisible() {
        mutableState.update { current ->
            val selected = current.selectedIds.toMutableSet()
            visibleIds.forEach { id ->
                if (!selected.add(id)) selected.remove(id)
            }
            current.copy(selectedIds = selected)
        }
        rebuild()
    }

    fun openRenameDialog(entryId: Long) {
        val note = allItems.firstOrNull { it.entry.id == entryId }?.entry?.note.orEmpty()
        mutableState.update {
            it.copy(
                renameTargetId = entryId,
                renameText = note,
            )
        }
    }

    fun closeRenameDialog() {
        mutableState.update { it.copy(renameTargetId = null, renameText = "") }
    }

    fun updateRenameText(text: String) {
        mutableState.update { it.copy(renameText = text) }
    }

    fun saveRename() {
        val targetId = state.value.renameTargetId ?: return
        val updatedNote = state.value.renameText.trim().takeIf(String::isNotEmpty)
        screenModelScope.launchIO {
            captureRepository.updateNote(
                id = targetId,
                note = updatedNote,
            )
            mutableState.update { it.copy(renameTargetId = null, renameText = "") }
        }
    }

    fun deleteSelection() {
        val ids = state.value.selectedIds.toList()
        if (ids.isEmpty()) return
        screenModelScope.launchIO {
            captureRepository.deleteByIds(ids)
            mutableState.update { it.copy(selectedIds = emptySet()) }
        }
    }

    fun deleteEntry(id: Long) {
        screenModelScope.launchIO {
            captureRepository.deleteByIds(listOf(id))
        }
    }

    fun shareSelection(context: Context) {
        val ids = state.value.selectedIds
        if (ids.isEmpty()) return
        val selectedItems = allItems.filter { it.entry.id in ids }
        share(context, selectedItems)
    }

    fun shareEntry(context: Context, id: Long) {
        val item = allItems.firstOrNull { it.entry.id == id } ?: return
        share(context, listOf(item))
    }

    fun openEntry(context: Context, entryId: Long) {
        val item = allItems.firstOrNull { it.entry.id == entryId } ?: return
        val entry = item.entry
        when (entry.type) {
            CaptureType.BOOKMARK -> {
                val episodeId = entry.episodeId
                if (episodeId == null) {
                    context.toast(MR.strings.bookmarks_episode_missing)
                    return
                }
                screenModelScope.launchIO {
                    val episode = getEpisode.await(episodeId)
                    if (episode == null) {
                        context.toast(MR.strings.bookmarks_episode_missing)
                        return@launchIO
                    }
                    MainActivity.startPlayerActivity(
                        context = context,
                        animeId = entry.animeId,
                        episodeId = episodeId,
                        extPlayer = false,
                        startPositionMs = entry.positionMs,
                    )
                }
            }
            CaptureType.CLIP -> {
                val mediaUri = entry.mediaUri
                if (mediaUri == null) {
                    context.toast(MR.strings.bookmarks_media_missing)
                    return
                }
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse(mediaUri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(intent)
            }
            CaptureType.SCREENSHOT -> Unit
        }
    }

    private fun share(context: Context, items: List<CaptureWithEpisode>) {
        if (items.isEmpty()) return

        val clipUris = items
            .asSequence()
            .filter { it.entry.type == CaptureType.CLIP }
            .mapNotNull { it.entry.mediaUri }
            .map(Uri::parse)
            .toList()
        val bookmarkLines = items
            .asSequence()
            .filter { it.entry.type == CaptureType.BOOKMARK }
            .map { item ->
                context.stringResource(
                    MR.strings.bookmarks_share_bookmark_line,
                    state.value.animeTitle ?: context.stringResource(MR.strings.unknown_title),
                    item.episodeName ?: context.stringResource(MR.strings.unknown_title),
                    formatTimestamp(item.entry.positionMs),
                    dateFormatter.format(Date(item.entry.createdAt)),
                )
            }
            .toList()

        val intent = when {
            clipUris.isNotEmpty() && clipUris.size == 1 && bookmarkLines.isEmpty() -> {
                Intent(Intent.ACTION_SEND).apply {
                    type = "video/*"
                    putExtra(Intent.EXTRA_STREAM, clipUris.first())
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            clipUris.isNotEmpty() -> {
                Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                    type = "video/*"
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(clipUris))
                    if (bookmarkLines.isNotEmpty()) {
                        putExtra(Intent.EXTRA_TEXT, bookmarkLines.joinToString(separator = "\n"))
                    }
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            bookmarkLines.isNotEmpty() -> {
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, bookmarkLines.joinToString(separator = "\n"))
                }
            }
            else -> return
        }

        context.startActivity(
            Intent.createChooser(
                intent,
                context.stringResource(MR.strings.action_share),
            ),
        )
    }

    private fun rebuild() {
        val current = mutableState.value
        val query = current.searchQuery
        val filtered = allItems
            .asSequence()
            .filter {
                when (current.typeFilter) {
                    TypeFilter.ALL -> true
                    TypeFilter.CLIPS -> it.entry.type == CaptureType.CLIP
                    TypeFilter.BOOKMARKS -> it.entry.type == CaptureType.BOOKMARK
                }
            }
            .filter { item ->
                if (query.isNullOrBlank()) {
                    true
                } else {
                    val lowerQuery = query.lowercase()
                    val note = item.entry.note.orEmpty().lowercase()
                    val episode = item.episodeName.orEmpty().lowercase()
                    val type = if (item.entry.type == CaptureType.CLIP) "clip" else "bookmark"
                    val timestamp = formatTimestamp(item.entry.positionMs).lowercase()
                    note.contains(lowerQuery) ||
                        episode.contains(lowerQuery) ||
                        type.contains(lowerQuery) ||
                        timestamp.contains(lowerQuery)
                }
            }
            .sortedWith(
                if (current.sortDescending) {
                    compareByDescending<CaptureWithEpisode> { it.entry.createdAt }
                } else {
                    compareBy<CaptureWithEpisode> { it.entry.createdAt }
                },
            )
            .toList()

        visibleIds = filtered.map { it.entry.id }
        val selectedIds = current.selectedIds.intersect(visibleIds.toSet())

        val uiModels = filtered
            .map { item ->
                UiModel.Item(
                    CaptureItem(
                        entry = item.entry,
                        episodeName = item.episodeName,
                        selected = item.entry.id in selectedIds,
                    ),
                )
            }
            .insertSeparators { before, after ->
                val beforeDate = before?.item?.entry?.createdAt?.toLocalDate()
                val afterDate = after?.item?.entry?.createdAt?.toLocalDate()
                when {
                    beforeDate != afterDate && afterDate != null -> UiModel.Header(afterDate)
                    else -> null
                }
            }

        mutableState.update {
            it.copy(
                selectedIds = selectedIds,
                items = uiModels,
            )
        }
    }

    @Immutable
    data class State(
        val isLoading: Boolean = true,
        val animeTitle: String? = null,
        val searchQuery: String? = null,
        val typeFilter: TypeFilter = TypeFilter.ALL,
        val sortDescending: Boolean = true,
        val selectedIds: Set<Long> = emptySet(),
        val items: List<UiModel> = emptyList(),
        val renameTargetId: Long? = null,
        val renameText: String = "",
    )

    enum class TypeFilter {
        ALL,
        CLIPS,
        BOOKMARKS,
    }

    @Immutable
    sealed interface UiModel {
        data class Header(val date: java.time.LocalDate) : UiModel
        data class Item(val item: CaptureItem) : UiModel
    }

    @Immutable
    data class CaptureItem(
        val entry: CaptureEntry,
        val episodeName: String?,
        val selected: Boolean,
    )

    private data class CaptureWithEpisode(
        val entry: CaptureEntry,
        val episodeName: String?,
    )
}

private val dateFormatter: DateFormat = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)

private fun formatTimestamp(positionMs: Long): String {
    val totalSeconds = (positionMs / 1000L).coerceAtLeast(0L)
    val hours = totalSeconds / 3600L
    val minutes = (totalSeconds % 3600L) / 60L
    val seconds = totalSeconds % 60L
    return if (hours > 0L) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}
