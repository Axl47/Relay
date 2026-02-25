package eu.kanade.tachiyomi.data.migration.aniyomi

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AniyomiInstallDetectorTest {

    @Test
    fun `filterLegacyApps matches package or launcher label`() {
        val apps = AniyomiInstallDetector.filterLegacyApps(
            launcherEntries = listOf(
                LauncherEntry(
                    packageName = "xyz.aniyomi.fork",
                    label = "Fork",
                ),
                LauncherEntry(
                    packageName = "com.example.viewer",
                    label = "Aniyomi Beta",
                ),
                LauncherEntry(
                    packageName = "com.example.other",
                    label = "Other",
                ),
            ),
        )

        assertEquals(listOf("com.example.viewer", "xyz.aniyomi.fork"), apps.map { it.packageName })
    }

    @Test
    fun `filterLegacyApps only considers launcher entries and ignores non-matching packages`() {
        val apps = AniyomiInstallDetector.filterLegacyApps(
            launcherEntries = listOf(
                LauncherEntry(
                    packageName = "eu.kanade.tachiyomi.extension.en.demo",
                    label = "Demo Extension",
                ),
            ),
        )

        assertEquals(emptyList<DetectedLegacyApp>(), apps)
    }
}
