package eu.kanade.tachiyomi.data.migration.aniyomi

import android.net.Uri

data class BackupCandidate(
    val uri: Uri,
    val fileName: String,
    val absolutePath: String,
    val lastModified: Long,
)
