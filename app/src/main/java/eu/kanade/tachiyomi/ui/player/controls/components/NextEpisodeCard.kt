package eu.kanade.tachiyomi.ui.player.controls.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import eu.kanade.tachiyomi.ui.player.PlayerViewModel
import tachiyomi.presentation.core.components.material.padding

@Composable
fun NextEpisodeCard(
    state: PlayerViewModel.NextEpisodeCardState,
    onPlayNow: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth(0.65f)) {
        Column(
            modifier = Modifier.padding(MaterialTheme.padding.medium),
            verticalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small),
        ) {
            Text(
                text = "Up next",
                style = MaterialTheme.typography.labelMedium,
            )
            Text(
                text = state.nextEpisodeTitle,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "Starting in ${state.countdownSeconds}s",
                style = MaterialTheme.typography.bodyMedium,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(MaterialTheme.padding.small)) {
                Button(onClick = onPlayNow) {
                    Text("Play now")
                }
                OutlinedButton(onClick = onStop) {
                    Text("Stop")
                }
            }
        }
    }
}
