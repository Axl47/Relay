package eu.kanade.presentation.more.settings.screen.data

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RestoreBackupScreenModeTest {

    @Test
    fun `migration mode defaults extensions restore to enabled`() {
        val options = defaultRestoreOptionsForMode(RestoreLaunchMode.AniyomiMigration)
        assertTrue(options.extensions)
    }

    @Test
    fun `standard mode defaults extensions restore to disabled`() {
        val options = defaultRestoreOptionsForMode(RestoreLaunchMode.Standard)
        assertFalse(options.extensions)
    }
}
