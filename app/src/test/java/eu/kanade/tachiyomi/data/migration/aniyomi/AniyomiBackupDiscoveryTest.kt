package eu.kanade.tachiyomi.data.migration.aniyomi

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files

class AniyomiBackupDiscoveryTest {

    @Test
    fun `discoverFromRoot finds autobackup and root backups sorted newest first`() {
        val root = Files.createTempDirectory("aniyomi-discovery").toFile()
        try {
            val rootBackup = root.resolve("root.tachibk").apply {
                writeText("root")
                setLastModified(1000L)
            }

            val autoBackup = root.resolve("Aniyomi/autobackup/auto.tachibk").apply {
                parentFile?.mkdirs()
                writeText("auto")
                setLastModified(3000L)
            }

            val otherAutoBackup = root.resolve("Relay/autobackup/old.tachibk").apply {
                parentFile?.mkdirs()
                writeText("old")
                setLastModified(2000L)
            }

            val files = AniyomiBackupDiscovery.discoverBackupFilesFromRoot(
                rootDir = root,
                appLabelHints = listOf("Aniyomi"),
            )

            assertEquals(
                listOf(autoBackup.name, otherAutoBackup.name, rootBackup.name),
                files.map { it.name },
            )
        } finally {
            root.deleteRecursively()
        }
    }

    @Test
    fun `discoverFromRoot returns missing permission when external scan unavailable`() {
        val result = AniyomiBackupDiscovery.discoverFromRoot(
            rootDir = null,
            canScanExternal = false,
        )

        assertEquals(BackupDiscoveryFailureReason.MISSING_ALL_FILES_PERMISSION, result.failureReason)
        assertTrue(result.candidates.isEmpty())
    }
}
