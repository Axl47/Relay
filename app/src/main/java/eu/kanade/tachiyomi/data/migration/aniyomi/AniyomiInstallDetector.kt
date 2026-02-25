package eu.kanade.tachiyomi.data.migration.aniyomi

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.util.Locale

class AniyomiInstallDetector(
    private val context: Context,
) {

    fun detectLegacyApps(): List<DetectedLegacyApp> {
        val packageManager = context.packageManager
        val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        val launcherApps = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.queryIntentActivities(
                launcherIntent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong()),
            )
        } else {
            @Suppress("DEPRECATION")
            packageManager.queryIntentActivities(launcherIntent, PackageManager.MATCH_ALL)
        }

        val launcherEntries = launcherApps
            .asSequence()
            .mapNotNull { resolveInfo ->
                val packageName = resolveInfo.activityInfo?.packageName ?: return@mapNotNull null
                val label = resolveInfo.loadLabel(packageManager)?.toString().orEmpty()
                LauncherEntry(
                    packageName = packageName,
                    label = label,
                )
            }
            .toList()

        return filterLegacyApps(launcherEntries)
    }

    companion object {
        private const val ANIYOMI_TOKEN = "aniyomi"

        internal fun filterLegacyApps(
            launcherEntries: List<LauncherEntry>,
        ): List<DetectedLegacyApp> {
            return launcherEntries
                .asSequence()
                .mapNotNull { entry ->
                    val matches = entry.packageName.contains(ANIYOMI_TOKEN, ignoreCase = true) ||
                        entry.label.contains(ANIYOMI_TOKEN, ignoreCase = true)
                    if (!matches) {
                        return@mapNotNull null
                    }
                    DetectedLegacyApp(
                        packageName = entry.packageName,
                        label = entry.label,
                    )
                }
                .distinctBy { it.packageName }
                .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.label.lowercase(Locale.US) })
                .toList()
        }
    }
}

internal data class LauncherEntry(
    val packageName: String,
    val label: String,
)
