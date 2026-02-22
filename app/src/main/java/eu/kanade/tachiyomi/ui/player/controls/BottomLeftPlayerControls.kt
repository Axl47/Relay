/*
 * Copyright 2024 Abdallah Mehiz
 * https://github.com/abdallahmehiz/mpvKt
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package eu.kanade.tachiyomi.ui.player.controls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.ModeNight
import androidx.compose.material.icons.filled.ScreenRotation
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import dev.vivvvek.seeker.Segment
import eu.kanade.tachiyomi.ui.player.Sheets
import eu.kanade.tachiyomi.ui.player.controls.components.ControlsButton
import eu.kanade.tachiyomi.ui.player.controls.components.CurrentChapter
import eu.kanade.tachiyomi.ui.player.settings.PlayerPreferences
import tachiyomi.i18n.MR
import tachiyomi.presentation.core.i18n.stringResource
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import kotlin.math.roundToInt

@Composable
fun BottomLeftPlayerControls(
    playbackSpeed: Float,
    audioNormalizeEnabled: Boolean,
    audioNormalizeLevel: Float,
    nightModeEnabled: Boolean,
    currentChapter: Segment?,
    onLockControls: () -> Unit,
    onCycleRotation: () -> Unit,
    onPlaybackSpeedChange: (Float) -> Unit,
    onToggleAudioNormalization: () -> Unit,
    onAdjustAudioNormalization: () -> Unit,
    onToggleNightMode: () -> Unit,
    onOpenSheet: (Sheets) -> Unit,
    modifier: Modifier = Modifier,
) {
    val playerPreferences = remember { Injekt.get<PlayerPreferences>() }
    val activeColor = MaterialTheme.colorScheme.primary

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ControlsButton(
            Icons.Default.LockOpen,
            onClick = onLockControls,
        )
        ControlsButton(
            icon = Icons.Default.ScreenRotation,
            onClick = onCycleRotation,
        )
        ControlsButton(
            text = stringResource(MR.strings.player_speed, playbackSpeed),
            onClick = {
                val newSpeed = if (playbackSpeed >= 2) 0.25f else playbackSpeed + 0.25f
                onPlaybackSpeedChange(newSpeed)
            },
            onLongClick = { onOpenSheet(Sheets.PlaybackSpeed) },
        )
        ControlsButton(
            text = if (audioNormalizeEnabled) {
                "Norm ${((audioNormalizeLevel * 100f).roundToInt())}%"
            } else {
                "Norm ${stringResource(MR.strings.off)}"
            },
            onClick = onToggleAudioNormalization,
            onLongClick = onAdjustAudioNormalization,
            color = if (audioNormalizeEnabled) activeColor else Color.White,
        )
        ControlsButton(
            icon = Icons.Default.ModeNight,
            onClick = onToggleNightMode,
            color = if (nightModeEnabled) activeColor else Color.White,
            title = if (nightModeEnabled) "Night mode enabled" else "Night mode disabled",
        )
        AnimatedVisibility(
            currentChapter != null && playerPreferences.showCurrentChapter().get(),
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            CurrentChapter(
                chapter = currentChapter!!,
                onClick = { onOpenSheet(Sheets.Chapters) },
            )
        }
    }
}
