package eu.kanade.tachiyomi.ui.bookmarks

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import cafe.adriel.voyager.core.model.rememberScreenModel
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import eu.kanade.presentation.bookmarks.BookmarksShowScreen as BookmarksShowScreenContent
import eu.kanade.presentation.util.Screen

data class BookmarksShowScreen(
    private val animeId: Long,
) : Screen() {

    @Composable
    override fun Content() {
        val navigator = LocalNavigator.currentOrThrow
        val context = LocalContext.current
        val screenModel = rememberScreenModel { BookmarksShowScreenModel(animeId) }
        val state by screenModel.state.collectAsState()

        BookmarksShowScreenContent(
            state = state,
            onSearchQueryChange = screenModel::search,
            onFilterChange = screenModel::setFilter,
            onToggleSort = screenModel::toggleSort,
            onToggleSelection = screenModel::toggleSelection,
            onSelectAll = screenModel::selectAllVisible,
            onInvertSelection = screenModel::invertSelectionVisible,
            onClearSelection = screenModel::clearSelection,
            onClickEntry = { entryId ->
                if (state.selectedIds.isNotEmpty()) {
                    screenModel.toggleSelection(entryId)
                } else {
                    screenModel.openEntry(context, entryId)
                }
            },
            onShareSelection = { screenModel.shareSelection(context) },
            onDeleteSelection = screenModel::deleteSelection,
            onShareEntry = { screenModel.shareEntry(context, it) },
            onDeleteEntry = screenModel::deleteEntry,
            onRenameEntry = screenModel::openRenameDialog,
            onRenameTextChange = screenModel::updateRenameText,
            onRenameConfirm = screenModel::saveRename,
            onRenameDismiss = screenModel::closeRenameDialog,
            navigateUp = { navigator.pop() },
        )
    }
}
