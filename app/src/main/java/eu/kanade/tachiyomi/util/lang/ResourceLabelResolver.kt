package eu.kanade.tachiyomi.util.lang

import android.content.Context
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

private val labelKeyRegex = Regex("^[A-Za-z][A-Za-z0-9_]*$")
private val labelKeyCache = ConcurrentHashMap<String, Int>()
private val labelPluralKeyCache = ConcurrentHashMap<String, Int>()
private val labelFormatArgRegex = Regex("%\\d*\\$?[a-zA-Z]")

fun Context.resolveResourceLabel(label: String): String {
    if (!labelKeyRegex.matches(label)) {
        return label
    }

    resolveResourceStringByName(label)?.let { return it }
    resolveResourceStringByName(label.lowercase(Locale.US))?.let { return it }
    resolveResourcePluralByName(label)?.let { return it }
    resolveResourcePluralByName(label.lowercase(Locale.US))?.let { return it }

    return label
}

private fun Context.resolveResourceStringByName(name: String): String? {
    val resourceId = labelKeyCache.getOrPut(name) {
        resources.getIdentifier(name, "string", packageName)
    }
    if (resourceId == 0) return null
    return getString(resourceId).sanitizeLabel()
}

private fun Context.resolveResourcePluralByName(name: String): String? {
    val resourceId = labelPluralKeyCache.getOrPut(name) {
        resources.getIdentifier(name, "plurals", packageName)
    }
    if (resourceId == 0) return null
    return resources.getQuantityText(resourceId, 2).toString().sanitizeLabel()
}

private fun String.sanitizeLabel(): String {
    return replace(labelFormatArgRegex, "")
        .replace("\\s+".toRegex(), " ")
        .trim()
}
