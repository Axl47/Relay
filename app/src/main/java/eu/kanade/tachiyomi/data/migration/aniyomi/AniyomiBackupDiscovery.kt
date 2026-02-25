package eu.kanade.tachiyomi.data.migration.aniyomi

import android.content.Context
import android.os.Build
import android.os.Environment
import androidx.core.net.toUri
import java.io.File

class AniyomiBackupDiscovery(
    @Suppress("UNUSED_PARAMETER")
    private val context: Context,
) {

    fun discover(installedApps: List<DetectedLegacyApp>): BackupDiscoveryResult {
        val canScanExternal = Build.VERSION.SDK_INT < Build.VERSION_CODES.R ||
            Environment.isExternalStorageManager()

        return discoverFromRoot(
            rootDir = Environment.getExternalStorageDirectory(),
            canScanExternal = canScanExternal,
            appLabelHints = installedApps.map { it.label },
        )
    }

    companion object {
        private const val BACKUP_EXTENSION = ".tachibk"

        internal fun discoverFromRoot(
            rootDir: File?,
            canScanExternal: Boolean,
            appLabelHints: List<String> = emptyList(),
        ): BackupDiscoveryResult {
            if (!canScanExternal) {
                return BackupDiscoveryResult(
                    candidates = emptyList(),
                    failureReason = BackupDiscoveryFailureReason.MISSING_ALL_FILES_PERMISSION,
                )
            }
            if (rootDir == null || !rootDir.exists() || !rootDir.isDirectory) {
                return BackupDiscoveryResult(
                    candidates = emptyList(),
                    failureReason = BackupDiscoveryFailureReason.STORAGE_UNAVAILABLE,
                )
            }

            val candidates = discoverBackupFilesFromRoot(rootDir, appLabelHints)
                .asSequence()
                .filter { it.exists() && it.isFile }
                .distinctBy { it.absolutePath }
                .map {
                    BackupCandidate(
                        uri = it.toUri(),
                        fileName = it.name,
                        absolutePath = it.absolutePath,
                        lastModified = it.lastModified(),
                    )
                }
                .toList()

            return BackupDiscoveryResult(candidates = candidates)
        }

        internal fun discoverBackupFilesFromRoot(
            rootDir: File,
            appLabelHints: List<String> = emptyList(),
        ): List<File> {
            val backupFiles = linkedSetOf<File>()
            backupFiles += listBackupFiles(rootDir)

            rootDir.listFiles()
                .orEmpty()
                .asSequence()
                .filter { it.isDirectory }
                .forEach { topLevelDirectory ->
                    backupFiles += listBackupFiles(File(topLevelDirectory, AUTOBACKUP_DIR))
                }

            appLabelHints
                .asSequence()
                .map(::sanitizeDirectoryName)
                .filter { it.isNotBlank() }
                .forEach { sanitizedLabel ->
                    val hintedDirectory = File(File(rootDir, sanitizedLabel), AUTOBACKUP_DIR)
                    backupFiles += listBackupFiles(hintedDirectory)
                }

            return backupFiles
                .asSequence()
                .filter { it.exists() && it.isFile }
                .distinctBy { it.absolutePath }
                .sortedByDescending { it.lastModified() }
                .toList()
        }

        private fun listBackupFiles(directory: File): List<File> {
            if (!directory.exists() || !directory.isDirectory) {
                return emptyList()
            }
            return directory.listFiles()
                .orEmpty()
                .filter { file ->
                    file.isFile && file.name.endsWith(BACKUP_EXTENSION, ignoreCase = true)
                }
        }

        internal fun sanitizeDirectoryName(label: String): String {
            return label.trim()
        }

        private const val AUTOBACKUP_DIR = "autobackup"
    }
}
