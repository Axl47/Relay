package eu.kanade.tachiyomi.extension.util

import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import androidx.lifecycle.asFlow
import androidx.work.WorkInfo
import eu.kanade.tachiyomi.extension.model.Extension
import eu.kanade.tachiyomi.extension.model.InstallStep
import eu.kanade.tachiyomi.util.system.isPackageInstalled
import eu.kanade.tachiyomi.util.system.workManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.transformWhile

/**
 * The installer which installs, updates and uninstalls the extensions.
 *
 * @param context The application context.
 */
internal class ExtensionInstaller(private val context: Context) {

    /**
     * Adds the given extension to the install queue and returns an observable containing its
     * step in the installation process.
     *
     * @param url The url of the apk.
     * @param extension The extension to install.
     */
    fun downloadAndInstall(url: String, extension: Extension): Flow<InstallStep> {
        val workName = ExtensionInstallJob.workName(extension.pkgName)
        ExtensionInstallJob.enqueue(
            context = context,
            apkUrl = url,
            packageName = extension.pkgName,
            extensionName = extension.name,
        )

        return context.workManager.getWorkInfosForUniqueWorkLiveData(workName)
            .asFlow()
            .mapNotNull { infos -> infos.firstOrNull() }
            .mapNotNull { workInfo ->
                when (workInfo.state) {
                    WorkInfo.State.ENQUEUED,
                    WorkInfo.State.BLOCKED,
                    -> InstallStep.Pending
                    WorkInfo.State.RUNNING -> {
                        when (workInfo.progress.getString(ExtensionInstallJob.KEY_PHASE)) {
                            ExtensionInstallJob.PHASE_INSTALLING -> InstallStep.Installing
                            else -> InstallStep.Downloading
                        }
                    }
                    WorkInfo.State.SUCCEEDED -> InstallStep.Installed
                    WorkInfo.State.FAILED -> InstallStep.Error
                    WorkInfo.State.CANCELLED -> InstallStep.Idle
                }
            }
            .onStart { emit(InstallStep.Pending) }
            .distinctUntilChanged()
            .transformWhile { installStep ->
                emit(installStep)
                !installStep.isCompleted()
            }
    }

    /**
     * Cancels extension install and removes it from the worker queue.
     */
    fun cancelInstall(pkgName: String) {
        context.workManager.cancelUniqueWork(ExtensionInstallJob.workName(pkgName))
    }

    /**
     * Starts an intent to uninstall the extension by the given package name.
     *
     * @param pkgName The package name of the extension to uninstall
     */
    fun uninstallApk(pkgName: String) {
        if (context.isPackageInstalled(pkgName)) {
            @Suppress("DEPRECATION")
            val intent = Intent(Intent.ACTION_UNINSTALL_PACKAGE, "package:$pkgName".toUri())
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } else {
            ExtensionLoader.uninstallPrivateExtension(context, pkgName)
            ExtensionInstallReceiver.notifyRemoved(context, pkgName)
        }
    }

    /**
     * Legacy callback for old installer paths. No-op for worker-based private installs.
     */
    fun updateInstallStep(downloadId: Long, step: InstallStep) {
        Unit
    }

    companion object {
        const val APK_MIME = "application/vnd.android.package-archive"
        const val EXTRA_DOWNLOAD_ID = "ExtensionInstaller.extra.DOWNLOAD_ID"
    }
}
