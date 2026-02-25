package eu.kanade.tachiyomi.data.migration.aniyomi

import tachiyomi.core.common.preference.Preference
import tachiyomi.core.common.preference.PreferenceStore

class AniyomiMigrationPreferences(
    private val preferenceStore: PreferenceStore,
) {

    fun migrationPromptDismissed() = preferenceStore.getBoolean(PROMPT_DISMISSED_KEY, false)

    fun migrationLastSourceUri() = preferenceStore.getString(LAST_SOURCE_URI_KEY, "")

    companion object {
        private val PROMPT_DISMISSED_KEY = Preference.appStateKey("migration_prompt_dismissed")
        private val LAST_SOURCE_URI_KEY = Preference.appStateKey("migration_last_source_uri")
    }
}
