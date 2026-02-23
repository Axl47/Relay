package eu.kanade.domain.base

import android.content.Context
import eu.kanade.domain.base.BasePreferences.ExtensionInstaller
import kotlinx.coroutines.CoroutineScope
import tachiyomi.core.common.preference.Preference
import tachiyomi.core.common.preference.PreferenceStore
import tachiyomi.core.common.preference.getEnum

class ExtensionInstallerPreference(
    context: Context,
    preferenceStore: PreferenceStore,
) : Preference<ExtensionInstaller> {

    private val basePref = preferenceStore.getEnum(key(), defaultValue())

    override fun key() = "extension_installer"

    val entries get() = listOf(ExtensionInstaller.PRIVATE)

    override fun defaultValue() = ExtensionInstaller.PRIVATE

    private fun check(value: ExtensionInstaller): ExtensionInstaller = ExtensionInstaller.PRIVATE

    override fun get(): ExtensionInstaller {
        val value = basePref.get()
        val checkedValue = check(value)
        if (value != checkedValue) {
            basePref.set(checkedValue)
        }
        return checkedValue
    }

    override fun set(value: ExtensionInstaller) {
        basePref.set(check(value))
    }

    override fun isSet() = basePref.isSet()

    override fun delete() = basePref.delete()

    override fun changes() = basePref.changes()

    override fun stateIn(scope: CoroutineScope) = basePref.stateIn(scope)
}
