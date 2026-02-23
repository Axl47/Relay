package eu.kanade.tachiyomi.ui.player.controls.components.sheets

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import eu.kanade.presentation.player.components.PlayerSheet
import eu.kanade.tachiyomi.ui.player.PlayerViewModel
import tachiyomi.presentation.core.components.material.padding

@Composable
fun ClipSheet(
    state: PlayerViewModel.ClipEditorState,
    onMarkIn: () -> Unit,
    onMarkOut: () -> Unit,
    onModeChange: (PlayerViewModel.ClipExportMode) -> Unit,
    onNoteChange: (String) -> Unit,
    onExport: () -> Unit,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PlayerSheet(
        onDismissRequest = onDismissRequest,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(MaterialTheme.padding.medium),
            verticalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small),
        ) {
            Text(
                text = "Clip mode",
                style = MaterialTheme.typography.headlineMedium,
            )
            Text(
                text = "In: ${state.markInMs / 1000.0}s  Out: ${state.markOutMs / 1000.0}s",
                style = MaterialTheme.typography.bodyMedium,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small),
            ) {
                TextButton(
                    onClick = onMarkIn,
                    enabled = !state.isExporting,
                ) {
                    Text("Mark In")
                }
                TextButton(
                    onClick = onMarkOut,
                    enabled = !state.isExporting,
                ) {
                    Text("Mark Out")
                }
            }

            Text("Export mode")
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small),
            ) {
                items(PlayerViewModel.ClipExportMode.entries) { mode ->
                    val disabled = mode == PlayerViewModel.ClipExportMode.BURN_IN_SUBS && !state.burnInSupported
                    FilterChip(
                        selected = state.exportMode == mode,
                        onClick = { onModeChange(mode) },
                        enabled = !disabled && !state.isExporting,
                        label = {
                            Text(
                                when (mode) {
                                    PlayerViewModel.ClipExportMode.FAST_COPY -> "Fast copy"
                                    PlayerViewModel.ClipExportMode.REENCODE_NO_SUBS -> "Re-encode (no subs)"
                                    PlayerViewModel.ClipExportMode.BURN_IN_SUBS -> "Burn-in subtitles"
                                },
                            )
                        },
                    )
                }
            }

            OutlinedTextField(
                value = state.note,
                onValueChange = onNoteChange,
                enabled = !state.isExporting,
                label = { Text("Note (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small),
            ) {
                TextButton(
                    onClick = onExport,
                    enabled = !state.isExporting,
                ) {
                    Text(if (state.isExporting) "Exporting..." else "Save clip")
                }
                TextButton(
                    onClick = onDismissRequest,
                    enabled = !state.isExporting,
                ) {
                    Text("Cancel")
                }
            }
        }
    }
}

