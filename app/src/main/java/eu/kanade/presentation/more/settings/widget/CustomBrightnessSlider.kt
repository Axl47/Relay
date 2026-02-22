package eu.kanade.presentation.more.settings.widget

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Slider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

@Composable
fun CustomBrightnessSlider(
    initialColor: Color,
    controller: Any? = null,
    modifier: Modifier = Modifier,
) {
    var value by remember { mutableFloatStateOf((initialColor.red + initialColor.green + initialColor.blue) / 3f) }
    Slider(
        value = value,
        onValueChange = { value = it },
        modifier = modifier.fillMaxWidth(),
    )
}
