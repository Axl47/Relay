package eu.kanade.tachiyomi.ui.bookmarks

import androidx.compose.runtime.Immutable
import cafe.adriel.voyager.core.model.StateScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import tachiyomi.core.common.util.lang.launchIO
import tachiyomi.domain.anime.interactor.GetAnime
import tachiyomi.domain.anime.model.Anime
import tachiyomi.domain.anime.model.AnimeCover
import tachiyomi.domain.capture.model.CaptureEntry
import tachiyomi.domain.capture.model.CaptureType
import tachiyomi.domain.capture.repository.CaptureRepository
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get

class BookmarksOverviewScreenModel(
    private val captureRepository: CaptureRepository = Injekt.get(),
    private val getAnime: GetAnime = Injekt.get(),
) : StateScreenModel<BookmarksOverviewScreenModel.State>(State()) {

    private var allShows: List<ShowSummary> = emptyList()

    init {
        screenModelScope.launchIO {
            captureRepository.subscribeAll().collectLatest { entries ->
                allShows = entries
                    .asSequence()
                    .filter { it.type == CaptureType.CLIP || it.type == CaptureType.BOOKMARK }
                    .groupBy { it.animeId }
                    .map { (animeId, captures) ->
                        val anime = getAnime.await(animeId)
                        ShowSummary(
                            animeId = animeId,
                            title = anime?.title,
                            coverData = anime?.asAnimeCover(),
                            clipCount = captures.count { it.type == CaptureType.CLIP },
                            bookmarkCount = captures.count { it.type == CaptureType.BOOKMARK },
                            latestCaptureAt = captures.maxOfOrNull(CaptureEntry::createdAt) ?: 0L,
                        )
                    }
                    .sortedByDescending(ShowSummary::latestCaptureAt)
                    .toList()

                applyFilters(isLoading = false)
            }
        }
    }

    fun search(query: String?) {
        mutableState.update { it.copy(searchQuery = query?.takeIf(String::isNotBlank)) }
        applyFilters()
    }

    private fun applyFilters(isLoading: Boolean = mutableState.value.isLoading) {
        val query = mutableState.value.searchQuery
        val filtered = if (query.isNullOrBlank()) {
            allShows
        } else {
            allShows.filter { show ->
                (show.title ?: "")
                    .contains(query, ignoreCase = true)
            }
        }
        mutableState.update {
            it.copy(
                isLoading = isLoading,
                items = filtered,
            )
        }
    }

    @Immutable
    data class State(
        val isLoading: Boolean = true,
        val searchQuery: String? = null,
        val items: List<ShowSummary> = emptyList(),
    )

    @Immutable
    data class ShowSummary(
        val animeId: Long,
        val title: String?,
        val coverData: AnimeCover?,
        val clipCount: Int,
        val bookmarkCount: Int,
        val latestCaptureAt: Long,
    )
}

private fun Anime.asAnimeCover(): AnimeCover {
    return AnimeCover(
        animeId = id,
        sourceId = source,
        isAnimeFavorite = favorite,
        ogUrl = thumbnailUrl,
        lastModified = coverLastModified,
    )
}
