package eu.kanade.presentation.bookmarks

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FlipToBack
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.SelectAll
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextOverflow
import eu.kanade.presentation.components.AppBar
import eu.kanade.presentation.components.AppBarActions
import eu.kanade.presentation.components.AppBarTitle
import eu.kanade.presentation.components.SearchToolbar
import eu.kanade.presentation.components.relativeDateText
import eu.kanade.presentation.util.animateItemFastScroll
import eu.kanade.presentation.util.relativeTimeSpanString
import eu.kanade.tachiyomi.ui.bookmarks.BookmarksShowScreenModel
import kotlinx.collections.immutable.persistentListOf
import tachiyomi.domain.capture.model.CaptureType
import tachiyomi.i18n.MR
import tachiyomi.presentation.core.components.FastScrollLazyColumn
import tachiyomi.presentation.core.components.ListGroupHeader
import tachiyomi.presentation.core.components.material.Scaffold
import tachiyomi.presentation.core.components.material.padding
import tachiyomi.presentation.core.i18n.stringResource
import tachiyomi.presentation.core.screens.EmptyScreen
import tachiyomi.presentation.core.screens.LoadingScreen
import tachiyomi.presentation.core.util.selectedBackground

@Composable
fun BookmarksShowScreen(
    state: BookmarksShowScreenModel.State,
    onSearchQueryChange: (String?) -> Unit,
    onFilterChange: (BookmarksShowScreenModel.TypeFilter) -> Unit,
    onToggleSort: () -> Unit,
    onToggleSelection: (Long) -> Unit,
    onSelectAll: () -> Unit,
    onInvertSelection: () -> Unit,
    onClearSelection: () -> Unit,
    onClickEntry: (Long) -> Unit,
    onShareSelection: () -> Unit,
    onDeleteSelection: () -> Unit,
    onShareEntry: (Long) -> Unit,
    onDeleteEntry: (Long) -> Unit,
    onRenameEntry: (Long) -> Unit,
    onRenameTextChange: (String) -> Unit,
    onRenameConfirm: () -> Unit,
    onRenameDismiss: () -> Unit,
    navigateUp: () -> Unit,
) {
    val selectionMode = state.selectedIds.isNotEmpty()
    Scaffold(
        topBar = { scrollBehavior ->
            if (selectionMode) {
                AppBar(
                    title = state.animeTitle ?: stringResource(MR.strings.unknown_title),
                    actionModeCounter = state.selectedIds.size,
                    onCancelActionMode = onClearSelection,
                    actionModeActions = {
                        AppBarActions(
                            persistentListOf(
                                AppBar.Action(
                                    title = stringResource(MR.strings.action_select_all),
                                    icon = Icons.Outlined.SelectAll,
                                    onClick = onSelectAll,
                                ),
                                AppBar.Action(
                                    title = stringResource(MR.strings.action_select_inverse),
                                    icon = Icons.Outlined.FlipToBack,
                                    onClick = onInvertSelection,
                                ),
                            ),
                        )
                    },
                    navigateUp = navigateUp,
                    scrollBehavior = scrollBehavior,
                )
            } else {
                SearchToolbar(
                    titleContent = {
                        AppBarTitle(
                            state.animeTitle ?: stringResource(MR.strings.unknown_title),
                        )
                    },
                    searchQuery = state.searchQuery,
                    onChangeSearchQuery = onSearchQueryChange,
                    actions = {
                        AppBarActions(
                            persistentListOf(
                                AppBar.Action(
                                    title = stringResource(
                                        if (state.sortDescending) {
                                            MR.strings.action_newest
                                        } else {
                                            MR.strings.action_oldest
                                        },
                                    ),
                                    icon = Icons.Outlined.FlipToBack,
                                    onClick = onToggleSort,
                                ),
                            ),
                        )
                    },
                    navigateUp = navigateUp,
                    scrollBehavior = scrollBehavior,
                )
            }
        },
        bottomBar = {
            BookmarksSelectionBottomBar(
                visible = selectionMode,
                onShare = onShareSelection,
                onDelete = onDeleteSelection,
            )
        },
    ) { contentPadding ->
        when {
            state.isLoading -> LoadingScreen(Modifier.padding(contentPadding))
            state.items.isEmpty() -> {
                val emptyRes = if (state.searchQuery.isNullOrEmpty()) {
                    MR.strings.bookmarks_empty_show
                } else {
                    MR.strings.no_results_found
                }
                EmptyScreen(
                    stringRes = emptyRes,
                    modifier = Modifier.padding(contentPadding),
                )
            }
            else -> {
                FastScrollLazyColumn(contentPadding = contentPadding) {
                    item(key = "bookmark-filters") {
                        BookmarksFilterRow(
                            selected = state.typeFilter,
                            sortDescending = state.sortDescending,
                            onFilterChange = onFilterChange,
                            onToggleSort = onToggleSort,
                        )
                    }
                    items(
                        count = state.items.size,
                        key = { index ->
                            when (val model = state.items[index]) {
                                is BookmarksShowScreenModel.UiModel.Header -> "bookmark-header-${model.date}"
                                is BookmarksShowScreenModel.UiModel.Item -> "bookmark-item-${model.item.entry.id}"
                            }
                        },
                        contentType = { index ->
                            when (state.items[index]) {
                                is BookmarksShowScreenModel.UiModel.Header -> "header"
                                is BookmarksShowScreenModel.UiModel.Item -> "item"
                            }
                        },
                    ) { index ->
                        when (val model = state.items[index]) {
                            is BookmarksShowScreenModel.UiModel.Header -> {
                                ListGroupHeader(
                                    modifier = Modifier.animateItemFastScroll(),
                                    text = relativeDateText(model.date),
                                )
                            }
                            is BookmarksShowScreenModel.UiModel.Item -> {
                                BookmarksCaptureItem(
                                    item = model.item,
                                    selectionMode = selectionMode,
                                    onClick = { onClickEntry(model.item.entry.id) },
                                    onToggleSelection = { onToggleSelection(model.item.entry.id) },
                                    onShare = { onShareEntry(model.item.entry.id) },
                                    onDelete = { onDeleteEntry(model.item.entry.id) },
                                    onRename = { onRenameEntry(model.item.entry.id) },
                                    modifier = Modifier.animateItemFastScroll(),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (state.renameTargetId != null) {
        AlertDialog(
            onDismissRequest = onRenameDismiss,
            title = { Text(stringResource(MR.strings.bookmarks_rename_title)) },
            text = {
                OutlinedTextField(
                    value = state.renameText,
                    onValueChange = onRenameTextChange,
                    singleLine = true,
                    placeholder = { Text(stringResource(MR.strings.bookmarks_rename_hint)) },
                )
            },
            confirmButton = {
                TextButton(onClick = onRenameConfirm) {
                    Text(stringResource(MR.strings.action_save))
                }
            },
            dismissButton = {
                TextButton(onClick = onRenameDismiss) {
                    Text(stringResource(MR.strings.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun BookmarksFilterRow(
    selected: BookmarksShowScreenModel.TypeFilter,
    sortDescending: Boolean,
    onFilterChange: (BookmarksShowScreenModel.TypeFilter) -> Unit,
    onToggleSort: () -> Unit,
) {
    val options = listOf(
        BookmarksShowScreenModel.TypeFilter.ALL to stringResource(MR.strings.bookmarks_filter_all),
        BookmarksShowScreenModel.TypeFilter.CLIPS to stringResource(MR.strings.bookmarks_filter_clips),
        BookmarksShowScreenModel.TypeFilter.BOOKMARKS to stringResource(MR.strings.bookmarks_filter_bookmarks),
    )
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MaterialTheme.padding.medium)
            .padding(bottom = MaterialTheme.padding.small),
        horizontalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small),
    ) {
        items(options) { (filter, label) ->
            FilterChip(
                selected = selected == filter,
                onClick = { onFilterChange(filter) },
                label = { Text(label) },
            )
        }
        item("bookmark-sort-chip") {
            FilterChip(
                selected = true,
                onClick = onToggleSort,
                label = {
                    Text(
                        stringResource(
                            if (sortDescending) {
                                MR.strings.action_newest
                            } else {
                                MR.strings.action_oldest
                            },
                        ),
                    )
                },
            )
        }
    }
}

@Composable
private fun BookmarksCaptureItem(
    item: BookmarksShowScreenModel.CaptureItem,
    selectionMode: Boolean,
    onClick: () -> Unit,
    onToggleSelection: () -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit,
    onRename: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    var menuExpanded by remember { mutableStateOf(false) }
    val typeLabel = stringResource(
        if (item.entry.type == CaptureType.CLIP) {
            MR.strings.bookmarks_clip_type
        } else {
            MR.strings.bookmarks_bookmark_type
        },
    )
    val fallbackTitle = stringResource(
        if (item.entry.type == CaptureType.CLIP) {
            MR.strings.bookmarks_auto_clip_label
        } else {
            MR.strings.bookmarks_auto_bookmark_label
        },
        formatTimestamp(item.entry.positionMs),
    )
    val subtitle = stringResource(
        MR.strings.bookmarks_item_subtitle,
        item.episodeName ?: stringResource(MR.strings.unknown_title),
        formatTimestamp(item.entry.positionMs),
        relativeTimeSpanString(item.entry.createdAt),
    )

    Row(
        modifier = modifier
            .selectedBackground(item.selected)
            .combinedClickable(
                onClick = {
                    if (selectionMode) {
                        onToggleSelection()
                    } else {
                        onClick()
                    }
                },
                onLongClick = {
                    onToggleSelection()
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                },
            )
            .padding(
                horizontal = MaterialTheme.padding.medium,
                vertical = MaterialTheme.padding.small,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (item.entry.type == CaptureType.CLIP) {
                Icons.Filled.ContentCut
            } else {
                Icons.Filled.Bookmark
            },
            contentDescription = typeLabel,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(end = MaterialTheme.padding.small),
        )
        androidx.compose.foundation.layout.Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(MaterialTheme.padding.extraSmall),
        ) {
            Text(
                text = item.entry.note?.takeIf { it.isNotBlank() } ?: fallbackTitle,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (!selectionMode) {
            IconButton(onClick = { menuExpanded = true }) {
                Icon(
                    imageVector = Icons.Outlined.MoreVert,
                    contentDescription = stringResource(MR.strings.action_menu_overflow_description),
                )
            }
            DropdownMenu(
                expanded = menuExpanded,
                onDismissRequest = { menuExpanded = false },
            ) {
                if (item.entry.type == CaptureType.CLIP || item.entry.type == CaptureType.BOOKMARK) {
                    DropdownMenuItem(
                        text = { Text(stringResource(MR.strings.bookmarks_rename_title)) },
                        onClick = {
                            menuExpanded = false
                            onRename()
                        },
                    )
                }
                DropdownMenuItem(
                    text = { Text(stringResource(MR.strings.action_share)) },
                    onClick = {
                        menuExpanded = false
                        onShare()
                    },
                )
                DropdownMenuItem(
                    text = { Text(stringResource(MR.strings.action_delete)) },
                    onClick = {
                        menuExpanded = false
                        onDelete()
                    },
                )
            }
        }
    }
}

@Composable
private fun BookmarksSelectionBottomBar(
    visible: Boolean,
    onShare: () -> Unit,
    onDelete: () -> Unit,
) {
    AnimatedVisibility(
        visible = visible,
        enter = expandVertically(expandFrom = Alignment.Bottom),
        exit = shrinkVertically(shrinkTowards = Alignment.Bottom),
    ) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier
                    .padding(
                        WindowInsets.navigationBars
                            .only(WindowInsetsSides.Bottom)
                            .asPaddingValues(),
                    )
                    .padding(horizontal = MaterialTheme.padding.medium, vertical = MaterialTheme.padding.small),
                horizontalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small),
            ) {
                SelectionActionButton(
                    label = stringResource(MR.strings.action_share),
                    icon = Icons.Outlined.Share,
                    onClick = onShare,
                    modifier = Modifier.weight(1f),
                )
                SelectionActionButton(
                    label = stringResource(MR.strings.action_delete),
                    icon = Icons.Outlined.Delete,
                    onClick = onDelete,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun SelectionActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    TextButton(
        onClick = onClick,
        modifier = modifier,
        contentPadding = PaddingValues(
            horizontal = MaterialTheme.padding.small,
            vertical = MaterialTheme.padding.extraSmall,
        ),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
        )
        Text(
            text = label,
            modifier = Modifier.padding(start = MaterialTheme.padding.extraSmall),
        )
    }
}

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
