package eu.kanade.tachiyomi.data.migration.aniyomi

enum class BackupDiscoveryFailureReason {
    MISSING_ALL_FILES_PERMISSION,
    STORAGE_UNAVAILABLE,
}

data class BackupDiscoveryResult(
    val candidates: List<BackupCandidate>,
    val failureReason: BackupDiscoveryFailureReason? = null,
)
