package eu.kanade.tachiyomi.data.migration.aniyomi

import android.content.Context
import android.content.pm.PackageManager
import eu.kanade.tachiyomi.data.backup.models.BackupExtension
import eu.kanade.tachiyomi.extension.model.LoadResult
import eu.kanade.tachiyomi.extension.util.ExtensionLoader
import logcat.LogPriority
import tachiyomi.core.common.util.system.logcat
import java.io.File

data class SharedExtensionApk(
    val pkgName: String,
    val apkFile: File,
)

data class ExtensionImportPlanItem(
    val pkgName: String,
    val sharedApkFile: File? = null,
    val backupApk: ByteArray? = null,
)

data class ExtensionImportResult(
    val total: Int,
    val success: Int,
    val failedPackages: List<String>,
)

internal fun buildExtensionImportPlan(
    backupExtensions: List<BackupExtension>,
    sharedExtensions: List<SharedExtensionApk>,
): List<ExtensionImportPlanItem> {
    val plans = linkedMapOf<String, ExtensionImportPlanItem>()

    sharedExtensions.forEach { shared ->
        plans[shared.pkgName] = ExtensionImportPlanItem(
            pkgName = shared.pkgName,
            sharedApkFile = shared.apkFile,
        )
    }

    backupExtensions.forEach { backup ->
        val existing = plans[backup.pkgName]
        if (existing == null) {
            plans[backup.pkgName] = ExtensionImportPlanItem(
                pkgName = backup.pkgName,
                backupApk = backup.apk,
            )
        } else if (existing.backupApk == null) {
            plans[backup.pkgName] = existing.copy(backupApk = backup.apk)
        }
    }

    return plans.values.sortedBy { it.pkgName }
}

class AniyomiExtensionPlanner(
    private val context: Context,
) {

    fun importExtensions(backupExtensions: List<BackupExtension>): ExtensionImportResult {
        val sharedExtensions = getSharedExtensions()
        val plan = buildExtensionImportPlan(backupExtensions, sharedExtensions)
        if (plan.isEmpty()) {
            return ExtensionImportResult(
                total = 0,
                success = 0,
                failedPackages = emptyList(),
            )
        }

        val failedPackages = mutableListOf<String>()
        var successCount = 0

        plan.forEach { item ->
            val installed = installPlanItem(item)
            if (installed) {
                successCount++
            } else {
                failedPackages += item.pkgName
            }
        }

        return ExtensionImportResult(
            total = plan.size,
            success = successCount,
            failedPackages = failedPackages,
        )
    }

    private fun getSharedExtensions(): List<SharedExtensionApk> {
        val packageManager = context.packageManager
        return ExtensionLoader.loadExtensions(context)
            .filterIsInstance<LoadResult.Success>()
            .asSequence()
            .map { it.extension }
            .filter { it.isShared }
            .mapNotNull { extension ->
                val apkFile = try {
                    packageManager.getApplicationInfo(extension.pkgName, PackageManager.GET_META_DATA)
                        .let { appInfo ->
                            appInfo.publicSourceDir?.takeIf { it.isNotBlank() }
                                ?: appInfo.sourceDir?.takeIf { it.isNotBlank() }
                        }
                        ?.let(::File)
                        ?.takeIf { it.exists() && it.isFile }
                } catch (e: Exception) {
                    logcat(LogPriority.WARN, e) {
                        "Failed to resolve shared extension APK for ${extension.pkgName}"
                    }
                    null
                }

                apkFile?.let {
                    SharedExtensionApk(
                        pkgName = extension.pkgName,
                        apkFile = it,
                    )
                }
            }
            .distinctBy { it.pkgName }
            .toList()
    }

    private fun installPlanItem(item: ExtensionImportPlanItem): Boolean {
        val sharedInstalled = item.sharedApkFile
            ?.takeIf { it.exists() && it.isFile }
            ?.let { sharedFile ->
                runCatching {
                    ExtensionLoader.installPrivateExtensionFile(context, sharedFile)
                }
                    .onFailure { error ->
                        logcat(LogPriority.WARN, error) {
                            "Failed shared extension private-copy for ${item.pkgName}"
                        }
                    }
                    .getOrDefault(false)
            }
            ?: false

        if (sharedInstalled) {
            return true
        }

        val backupApk = item.backupApk ?: return false
        val tempFile = File(
            context.cacheDir,
            "migration_ext_${item.pkgName.replace('.', '_')}.apk",
        )
        return try {
            tempFile.writeBytes(backupApk)
            ExtensionLoader.installPrivateExtensionFile(context, tempFile)
        } catch (e: Exception) {
            logcat(LogPriority.WARN, e) {
                "Failed backup extension private-copy for ${item.pkgName}"
            }
            false
        } finally {
            if (tempFile.exists()) {
                tempFile.delete()
            }
        }
    }
}
