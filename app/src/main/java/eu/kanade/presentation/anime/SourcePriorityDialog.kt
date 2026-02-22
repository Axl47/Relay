package eu.kanade.presentation.anime

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
fun SourcePriorityDialog(
    entries: List<SourcePriorityEntry>,
    isLoading: Boolean,
    isSaving: Boolean,
    onDismissRequest: () -> Unit,
    onMoveUp: (Int) -> Unit,
    onMoveDown: (Int) -> Unit,
    onSave: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = { Text("Source Priority") },
        text = {
            when {
                isLoading -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }
                entries.isEmpty() -> {
                    Text("No sources found for this anime.")
                }
                else -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        entries.forEachIndexed { index, entry ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .padding(end = 8.dp),
                                ) {
                                    Text(
                                        text = entry.label,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (entry.label != entry.sourceId) {
                                        Text(
                                            text = entry.sourceId,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                                Row {
                                    TextButton(
                                        onClick = { onMoveUp(index) },
                                        enabled = index > 0 && !isSaving,
                                    ) {
                                        Text("Up")
                                    }
                                    TextButton(
                                        onClick = { onMoveDown(index) },
                                        enabled = index < entries.lastIndex && !isSaving,
                                    ) {
                                        Text("Down")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismissRequest,
                enabled = !isSaving,
            ) {
                Text("Cancel")
            }
        },
        confirmButton = {
            TextButton(
                onClick = onSave,
                enabled = !isLoading && !isSaving,
            ) {
                Text(if (isSaving) "Saving..." else "Save")
            }
        },
    )
}

data class SourcePriorityEntry(
    val sourceId: String,
    val label: String,
)
