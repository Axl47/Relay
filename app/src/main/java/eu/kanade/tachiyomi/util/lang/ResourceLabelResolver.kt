package eu.kanade.tachiyomi.util.lang

import android.content.Context
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

private val labelKeyRegex = Regex("^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$")
private val labelKeyCache = ConcurrentHashMap<String, Int>()

fun Context.resolveResourceLabel(label: String): String {
    if (!labelKeyRegex.matches(label)) {
        return label
    }

    resolveResourceLabelByName(label)?.let { return it }
    resolveResourceLabelByName(label.lowercase(Locale.US))?.let { return it }

    return label
}

private fun Context.resolveResourceLabelByName(name: String): String? {
    val resourceId = labelKeyCache.getOrPut(name) {
        resources.getIdentifier(name, "string", packageName)
    }
    if (resourceId == 0) return null
    return getString(resourceId)
}
