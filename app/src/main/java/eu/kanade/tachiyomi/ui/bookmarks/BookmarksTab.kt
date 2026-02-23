package eu.kanade.tachiyomi.ui.bookmarks

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.graphics.res.animatedVectorResource
import androidx.compose.animation.graphics.res.rememberAnimatedVectorPainter
import androidx.compose.animation.graphics.vector.AnimatedImageVector
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.rememberScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import cafe.adriel.voyager.navigator.Navigator
import cafe.adriel.voyager.navigator.tab.LocalTabNavigator
import cafe.adriel.voyager.navigator.tab.TabOptions
import eu.kanade.presentation.util.Tab
import eu.kanade.tachiyomi.R
import eu.kanade.tachiyomi.ui.main.MainActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import tachiyomi.core.common.util.lang.launchIO
import tachiyomi.domain.capture.model.CaptureEntry
import tachiyomi.domain.capture.model.CaptureType
import tachiyomi.domain.capture.repository.CaptureRepository
import tachiyomi.i18n.MR
import tachiyomi.presentation.core.components.ScrollbarLazyColumn
import tachiyomi.presentation.core.components.material.Scaffold
import tachiyomi.presentation.core.i18n.stringResource
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data object BookmarksTab : Tab {

    override val options: TabOptions
        @Composable
        get() {
            val isSelected = LocalTabNavigator.current.current.key == key
            val image = AnimatedImageVector.animatedVectorResource(R.drawable.anim_updates_enter)
            return TabOptions(
                index = 1u,
                title = "Bookmarks",
                icon = rememberAnimatedVectorPainter(image, isSelected),
            )
        }

    @Composable
    override fun Content() {
        val context = LocalContext.current
        val screenModel = rememberScreenModel { BookmarksScreenModel() }
        val state by screenModel.state.collectAsState()

        Scaffold(
            topBar = {
                Row(
                    modifier = Modifier
                        .systemBarsPadding()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Bookmarks",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row {
                        IconButton(
                            onClick = { screenModel.shareSelection(context) },
                            enabled = state.selectedIds.isNotEmpty(),
                        ) {
                            Icon(Icons.Default.Share, contentDescription = "Share selected")
                        }
                        IconButton(
                            onClick = { screenModel.deleteSelection() },
                            enabled = state.selectedIds.isNotEmpty(),
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete selected")
                        }
                    }
                }
            },
        ) { contentPadding ->
            ScrollbarLazyColumn(
                modifier = Modifier.padding(contentPadding),
            ) {
                if (state.entries.isEmpty()) {
                    item {
                        Text(
                            text = stringResource(MR.strings.information_no_recent),
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                } else {
                    var lastDate: String? = null
                    state.entries.forEach { entry ->
                        val dateLabel = entry.createdAt.toDateLabel()
                        if (dateLabel != lastDate) {
                            item(key = "header_${entry.id}") {
                                Text(
                                    text = dateLabel,
                                    style = MaterialTheme.typography.titleSmall,
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                )
                            }
                            lastDate = dateLabel
                        }
                        item(key = entry.id) {
                            val selected = entry.id in state.selectedIds
                            BookmarkRow(
                                entry = entry,
                                selected = selected,
                                onClick = {
                                    if (state.selectedIds.isNotEmpty()) {
                                        screenModel.toggleSelection(entry.id)
                                    } else {
                                        screenModel.openEntry(context, entry)
                                    }
                                },
                                onLongClick = { screenModel.toggleSelection(entry.id) },
                            )
                        }
                    }
                }
            }
        }
    }

    override suspend fun onReselect(navigator: Navigator) = Unit
}

private class BookmarksScreenModel(
    private val captureRepository: CaptureRepository = Injekt.get(),
) : ScreenModel {

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        screenModelScope.launchIO {
            _state.update { it.copy(entries = captureRepository.getAll()) }
        }
    }

    fun toggleSelection(id: Long) {
        _state.update { current ->
            val selected = current.selectedIds.toMutableSet()
            if (!selected.add(id)) selected.remove(id)
            current.copy(selectedIds = selected)
        }
    }

    fun deleteSelection() {
        val ids = state.value.selectedIds.toList()
        if (ids.isEmpty()) return
        screenModelScope.launchIO {
            captureRepository.deleteByIds(ids)
            _state.update { it.copy(entries = captureRepository.getAll(), selectedIds = emptySet()) }
        }
    }

    fun shareSelection(context: android.content.Context) {
        val selected = state.value.entries.filter { it.id in state.value.selectedIds }
            .filter { it.mediaUri != null }
        val target = selected.firstOrNull() ?: return
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = if (target.type == CaptureType.CLIP) "video/*" else "image/*"
            putExtra(Intent.EXTRA_STREAM, Uri.parse(target.mediaUri))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share"))
    }

    fun openEntry(context: android.content.Context, entry: CaptureEntry) {
        when (entry.type) {
            CaptureType.BOOKMARK -> {
                val episodeId = entry.episodeId ?: return
                screenModelScope.launchIO {
                    MainActivity.startPlayerActivity(
                        context = context,
                        animeId = entry.animeId,
                        episodeId = episodeId,
                        extPlayer = false,
                        startPositionMs = entry.positionMs,
                    )
                }
            }
            CaptureType.SCREENSHOT,
            CaptureType.CLIP,
            -> {
                val mediaUri = entry.mediaUri ?: return
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    data = Uri.parse(mediaUri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(intent)
            }
        }
    }

    data class State(
        val entries: List<CaptureEntry> = emptyList(),
        val selectedIds: Set<Long> = emptySet(),
    )
}

@Composable
private fun BookmarkRow(
    entry: CaptureEntry,
    selected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
) {
    val label = when (entry.type) {
        CaptureType.BOOKMARK -> "Timestamp bookmark"
        CaptureType.SCREENSHOT -> "Screenshot"
        CaptureType.CLIP -> "Clip"
    }
    val subtitle = when (entry.type) {
        CaptureType.BOOKMARK -> "At ${entry.positionMs / 1000}s"
        CaptureType.SCREENSHOT -> "Image capture"
        CaptureType.CLIP -> "Video clip"
    }

    Column(
        modifier = Modifier
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Text(
            text = if (selected) "✓ $label" else label,
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val dateFormatter = DateTimeFormatter.ofPattern("EEE, MMM d")

private fun Long.toDateLabel(): String {
    return Instant.ofEpochMilli(this)
        .atZone(ZoneId.systemDefault())
        .format(dateFormatter)
}
