package eu.kanade.presentation.bookmarks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import eu.kanade.presentation.anime.components.AnimeCover
import eu.kanade.presentation.components.AppBarTitle
import eu.kanade.presentation.components.SearchToolbar
import eu.kanade.presentation.util.animateItemFastScroll
import eu.kanade.presentation.util.relativeTimeSpanString
import eu.kanade.tachiyomi.ui.bookmarks.BookmarksOverviewScreenModel
import tachiyomi.i18n.MR
import tachiyomi.presentation.core.components.FastScrollLazyColumn
import tachiyomi.presentation.core.components.material.Scaffold
import tachiyomi.presentation.core.components.material.padding
import tachiyomi.presentation.core.i18n.stringResource
import tachiyomi.presentation.core.screens.EmptyScreen
import tachiyomi.presentation.core.screens.LoadingScreen

private val RowHeight = 96.dp

@Composable
fun BookmarksOverviewScreen(
    state: BookmarksOverviewScreenModel.State,
    onSearchQueryChange: (String?) -> Unit,
    onClickShow: (Long) -> Unit,
) {
    Scaffold(
        topBar = { scrollBehavior ->
            SearchToolbar(
                titleContent = { AppBarTitle(stringResource(MR.strings.label_bookmarks)) },
                searchQuery = state.searchQuery,
                onChangeSearchQuery = onSearchQueryChange,
                scrollBehavior = scrollBehavior,
            )
        },
    ) { contentPadding ->
        when {
            state.isLoading -> LoadingScreen(Modifier.padding(contentPadding))
            state.items.isEmpty() -> {
                val emptyRes = if (state.searchQuery.isNullOrEmpty()) {
                    MR.strings.bookmarks_empty
                } else {
                    MR.strings.no_results_found
                }
                EmptyScreen(
                    stringRes = emptyRes,
                    modifier = Modifier.padding(contentPadding),
                )
            }
            else -> {
                FastScrollLazyColumn(
                    contentPadding = contentPadding,
                ) {
                    items(
                        count = state.items.size,
                        key = { index -> "bookmark-show-${state.items[index].animeId}" },
                    ) { index ->
                        val item = state.items[index]
                        Row(
                            modifier = Modifier
                                .animateItemFastScroll()
                                .clickable { onClickShow(item.animeId) }
                                .height(RowHeight)
                                .padding(
                                    horizontal = MaterialTheme.padding.medium,
                                    vertical = MaterialTheme.padding.small,
                                ),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AnimeCover.Book(
                                modifier = Modifier.fillMaxHeight(),
                                data = item.coverData,
                            )
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(
                                        start = MaterialTheme.padding.medium,
                                        end = MaterialTheme.padding.small,
                                    ),
                            ) {
                                Text(
                                    text = item.title ?: stringResource(MR.strings.unknown_title),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = stringResource(
                                        MR.strings.bookmarks_counts,
                                        item.clipCount,
                                        item.bookmarkCount,
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = stringResource(
                                        MR.strings.bookmarks_last_capture,
                                        relativeTimeSpanString(item.latestCaptureAt),
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
