package eu.kanade.tachiyomi.ui.player

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import eu.kanade.tachiyomi.data.notification.Notifications
import eu.kanade.tachiyomi.util.system.notificationBuilder
import eu.kanade.tachiyomi.util.system.notify
import eu.kanade.tachiyomi.util.system.toShareIntent

class ClipExportNotifier(
    private val context: Context,
) {

    private val notificationId = Notifications.ID_DOWNLOAD_EPISODE_PROGRESS - 10
    private val builder = context.notificationBuilder(Notifications.CHANNEL_COMMON)

    fun onProgress(progress: Int) {
        with(builder) {
            setContentTitle("Exporting clip")
            setContentText("$progress%")
            setSmallIcon(android.R.drawable.ic_menu_upload)
            setOngoing(true)
            setOnlyAlertOnce(true)
            setProgress(100, progress.coerceIn(0, 100), false)
        }
        context.notify(notificationId, builder.build())
    }

    fun onComplete(uri: Uri) {
        val openIntent = PendingIntent.getActivity(
            context,
            uri.hashCode(),
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "video/*")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val shareIntent = PendingIntent.getActivity(
            context,
            uri.hashCode() + 1,
            uri.toShareIntent(context, type = "video/*"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        with(builder) {
            setContentTitle("Clip saved")
            setContentText("Tap to play or share")
            setSmallIcon(android.R.drawable.ic_menu_save)
            setOngoing(false)
            setAutoCancel(true)
            setProgress(0, 0, false)
            clearActions()
            setContentIntent(openIntent)
            addAction(
                NotificationCompat.Action.Builder(
                    android.R.drawable.ic_menu_share,
                    "Share",
                    shareIntent,
                ).build(),
            )
        }
        context.notify(notificationId, builder.build())
    }

    fun onError(message: String) {
        with(builder) {
            setContentTitle("Clip export failed")
            setContentText(message)
            setSmallIcon(android.R.drawable.ic_delete)
            setOngoing(false)
            setAutoCancel(true)
            setProgress(0, 0, false)
            clearActions()
        }
        context.notify(notificationId, builder.build())
    }
}

