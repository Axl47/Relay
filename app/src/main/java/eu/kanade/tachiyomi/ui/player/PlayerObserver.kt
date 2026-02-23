package eu.kanade.tachiyomi.ui.player

import `is`.xyz.mpv.MPVLib
import logcat.LogPriority
import tachiyomi.core.common.util.system.logcat

class PlayerObserver(val activity: PlayerActivity) :
    MPVLib.EventObserver,
    MPVLib.LogObserver {

    override fun eventProperty(property: String) {
        activity.runOnUiThread { activity.onObserverEvent(property) }
    }

    override fun eventProperty(property: String, value: Long) {
        activity.runOnUiThread { activity.onObserverEvent(property, value) }
    }

    override fun eventProperty(property: String, value: Boolean) {
        activity.runOnUiThread { activity.onObserverEvent(property, value) }
    }

    override fun eventProperty(property: String, value: String) {
        activity.runOnUiThread { activity.onObserverEvent(property, value) }
    }

    override fun eventProperty(property: String, value: Double) {
        activity.runOnUiThread { activity.onObserverEvent(property, value) }
    }

    override fun event(eventId: Int) {
        activity.runOnUiThread { activity.event(eventId) }
    }

    override fun efEvent(err: String?) {
        val errorMessage = err ?: "Error: File ended"
        logcat(LogPriority.ERROR) { errorMessage }
        activity.onPlaybackStreamError(errorMessage, httpError, httpStatus)
        httpError = null
        httpStatus = null
    }

    private var httpError: String? = null
    private var httpStatus: Int? = null
    private val httpErrorRegex = Regex("HTTP\\s+error\\s+(\\d{3})", RegexOption.IGNORE_CASE)

    override fun logMessage(prefix: String, level: Int, text: String) {
        val logPriority = when (level) {
            MPVLib.mpvLogLevel.MPV_LOG_LEVEL_FATAL, MPVLib.mpvLogLevel.MPV_LOG_LEVEL_ERROR -> LogPriority.ERROR
            MPVLib.mpvLogLevel.MPV_LOG_LEVEL_WARN -> LogPriority.WARN
            MPVLib.mpvLogLevel.MPV_LOG_LEVEL_INFO -> LogPriority.INFO
            else -> LogPriority.VERBOSE
        }
        if (text.contains("HTTP error", ignoreCase = true)) {
            httpError = text
            httpStatus = httpErrorRegex.find(text)?.groupValues?.getOrNull(1)?.toIntOrNull()
        }
        logcat.logcat("mpv/$prefix", logPriority) { text }
    }
}
