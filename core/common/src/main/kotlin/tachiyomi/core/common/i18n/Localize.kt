package tachiyomi.core.common.i18n

import android.content.Context
import dev.icerock.moko.resources.PluralsResource
import dev.icerock.moko.resources.StringResource

fun Context.stringResource(resource: StringResource): String {
    return getString(resource.resourceId).fixed()
}

fun Context.stringResource(resource: StringResource, vararg args: Any): String {
    return getString(resource.resourceId, *args.map(::resolveFormatArg).toTypedArray()).fixed()
}

fun Context.pluralStringResource(resource: PluralsResource, count: Int): String {
    return resources.getQuantityString(resource.resourceId, count, count).fixed()
}

fun Context.pluralStringResource(resource: PluralsResource, count: Int, vararg args: Any): String {
    return resources.getQuantityString(resource.resourceId, count, *args.map(::resolveFormatArg).toTypedArray()).fixed()
}

private fun Context.resolveFormatArg(arg: Any): Any {
    return when (arg) {
        is StringResource -> stringResource(arg)
        is PluralsResource -> pluralStringResource(arg, 2)
        else -> arg
    }
}

// TODO: janky workaround for https://github.com/icerockdev/moko-resources/issues/337
private fun String.fixed() =
    this.replace("\\\"", "\"")
