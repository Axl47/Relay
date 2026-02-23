package eu.kanade.tachiyomi.ui.player.controls.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import eu.kanade.tachiyomi.ui.player.PlayerViewModel

@Composable
fun BingeReminderCard(
    state: PlayerViewModel.BingeReminderState,
    onDismiss: () -> Unit,
    onRemindLater: () -> Unit,
    onEndSession: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val watchedMinutes = (state.elapsedWatchMs / 60_000L).toInt()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.95f),
                shape = RoundedCornerShape(14.dp),
            )
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "Binge reminder",
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = "You've watched ${state.episodesWatched} episode(s) in $watchedMinutes min.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TextButton(onClick = onDismiss) { Text("Dismiss") }
            TextButton(onClick = onRemindLater) { Text("Remind in 30 min") }
            TextButton(onClick = onEndSession) { Text("End session") }
        }
    }
}

