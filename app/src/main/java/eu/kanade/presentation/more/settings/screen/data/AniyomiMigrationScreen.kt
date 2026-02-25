package eu.kanade.presentation.more.settings.screen.data

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import cafe.adriel.voyager.core.model.StateScreenModel
import cafe.adriel.voyager.core.model.rememberScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import cafe.adriel.voyager.navigator.LocalNavigator
import cafe.adriel.voyager.navigator.currentOrThrow
import eu.kanade.presentation.components.AppBar
import eu.kanade.presentation.util.Screen
import eu.kanade.presentation.util.relativeTimeSpanString
import eu.kanade.tachiyomi.data.migration.aniyomi.AniyomiBackupDiscovery
import eu.kanade.tachiyomi.data.migration.aniyomi.AniyomiInstallDetector
import eu.kanade.tachiyomi.data.migration.aniyomi.AniyomiMigrationJob
import eu.kanade.tachiyomi.data.migration.aniyomi.AniyomiMigrationPreferences
import eu.kanade.tachiyomi.data.migration.aniyomi.BackupCandidate
import eu.kanade.tachiyomi.data.migration.aniyomi.BackupDiscoveryFailureReason
import eu.kanade.tachiyomi.data.migration.aniyomi.BackupDiscoveryResult
import eu.kanade.tachiyomi.data.migration.aniyomi.DetectedLegacyApp
import eu.kanade.tachiyomi.data.backup.restore.BackupRestoreJob
import eu.kanade.tachiyomi.util.system.toast
import kotlinx.coroutines.flow.update
import tachiyomi.core.common.i18n.stringResource as cStringResource
import tachiyomi.core.common.util.lang.launchIO
import tachiyomi.i18n.MR
import tachiyomi.presentation.core.components.LazyColumnWithAction
import tachiyomi.presentation.core.components.SectionCard
import tachiyomi.presentation.core.components.material.Scaffold
import tachiyomi.presentation.core.components.material.padding
import tachiyomi.presentation.core.i18n.stringResource
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get

class AniyomiMigrationScreen : Screen() {

    @Composable
    override fun Content() {
        val context = LocalContext.current
        val navigator = LocalNavigator.currentOrThrow
        val model = rememberScreenModel { AniyomiMigrationScreenModel(context.applicationContext) }
        val state by model.state.collectAsState()

        val chooseBackup = rememberLauncherForActivityResult(
            object : ActivityResultContracts.GetContent() {
                override fun createIntent(context: Context, input: String): Intent {
                    val intent = super.createIntent(context, input)
                    return Intent.createChooser(intent, context.cStringResource(MR.strings.file_select_backup))
                }
            },
        ) { uri ->
            if (uri == null) {
                context.toast(MR.strings.file_null_uri_error)
                return@rememberLauncherForActivityResult
            }
            val uriString = uri.toString()
            model.rememberLastSourceUri(uriString)
            navigator.push(
                RestoreBackupScreen(
                    uri = uriString,
                    mode = RestoreLaunchMode.AniyomiMigration,
                ),
            )
        }

        Scaffold(
            topBar = {
                AppBar(
                    title = stringResource(MR.strings.pref_import_from_aniyomi),
                    navigateUp = navigator::pop,
                    scrollBehavior = it,
                )
            },
        ) { contentPadding ->
            LazyColumnWithAction(
                contentPadding = contentPadding,
                actionLabel = stringResource(MR.strings.aniyomi_migration_action_select_backup),
                actionEnabled = !AniyomiMigrationJob.isRunning(context) && !BackupRestoreJob.isRunning(context),
                onClickAction = {
                    if (AniyomiMigrationJob.isRunning(context) || BackupRestoreJob.isRunning(context)) {
                        context.toast(MR.strings.restore_in_progress)
                    } else {
                        try {
                            chooseBackup.launch("*/*")
                        } catch (e: ActivityNotFoundException) {
                            context.toast(MR.strings.file_picker_error)
                        }
                    }
                },
            ) {
                item {
                    SectionCard {
                        Text(
                            text = stringResource(MR.strings.aniyomi_migration_extension_note),
                            modifier = Modifier.padding(MaterialTheme.padding.medium),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                item {
                    SectionCard(MR.strings.aniyomi_migration_detected_apps_title) {
                        if (state.detectedApps.isEmpty()) {
                            Text(
                                text = stringResource(MR.strings.aniyomi_migration_no_legacy_apps_found),
                                modifier = Modifier.padding(MaterialTheme.padding.medium),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        } else {
                            state.detectedApps.forEach { app ->
                                LegacyAppRow(
                                    app = app,
                                    onOpen = { model.openLegacyApp(context, app.packageName) },
                                )
                            }
                        }
                    }
                }

                item {
                    SectionCard(MR.strings.aniyomi_migration_detected_backups_title) {
                        if (state.discovery.candidates.isNotEmpty()) {
                            state.discovery.candidates.forEach { candidate ->
                                BackupCandidateRow(
                                    candidate = candidate,
                                    onSelect = {
                                        model.rememberLastSourceUri(candidate.uri.toString())
                                        navigator.push(
                                            RestoreBackupScreen(
                                                uri = candidate.uri.toString(),
                                                mode = RestoreLaunchMode.AniyomiMigration,
                                            ),
                                        )
                                    },
                                )
                            }
                        } else {
                            Text(
                                text = stringResource(MR.strings.aniyomi_migration_no_backup_guidance),
                                modifier = Modifier.padding(MaterialTheme.padding.medium),
                                style = MaterialTheme.typography.bodyMedium,
                            )

                            when (state.discovery.failureReason) {
                                BackupDiscoveryFailureReason.MISSING_ALL_FILES_PERMISSION -> {
                                    Text(
                                        text = stringResource(MR.strings.aniyomi_migration_permission_required),
                                        modifier = Modifier.padding(
                                            start = MaterialTheme.padding.medium,
                                            end = MaterialTheme.padding.medium,
                                            bottom = MaterialTheme.padding.small,
                                        ),
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                BackupDiscoveryFailureReason.STORAGE_UNAVAILABLE -> {
                                    Text(
                                        text = stringResource(MR.strings.aniyomi_migration_storage_unavailable),
                                        modifier = Modifier.padding(
                                            start = MaterialTheme.padding.medium,
                                            end = MaterialTheme.padding.medium,
                                            bottom = MaterialTheme.padding.small,
                                        ),
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                }
                                null -> Unit
                            }

                            val launchableApp = state.detectedApps.firstOrNull {
                                context.packageManager.getLaunchIntentForPackage(it.packageName) != null
                            }
                            if (launchableApp != null) {
                                TextButton(
                                    onClick = { model.openLegacyApp(context, launchableApp.packageName) },
                                    modifier = Modifier.padding(horizontal = MaterialTheme.padding.small),
                                ) {
                                    Text(stringResource(MR.strings.aniyomi_migration_open_aniyomi))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun LegacyAppRow(
        app: DetectedLegacyApp,
        onOpen: () -> Unit,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onOpen)
                .padding(
                    horizontal = MaterialTheme.padding.medium,
                    vertical = MaterialTheme.padding.small,
                ),
        ) {
            Column(
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = app.label.ifBlank { app.packageName },
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = app.packageName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onOpen) {
                Text(text = stringResource(MR.strings.action_start))
            }
        }
    }

    @Composable
    private fun BackupCandidateRow(
        candidate: BackupCandidate,
        onSelect: () -> Unit,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onSelect)
                .padding(
                    horizontal = MaterialTheme.padding.medium,
                    vertical = MaterialTheme.padding.small,
                ),
        ) {
            Column(
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = candidate.fileName,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = relativeTimeSpanString(candidate.lastModified),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = candidate.absolutePath,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onSelect) {
                Text(text = stringResource(MR.strings.action_restore))
            }
        }
    }
}

private class AniyomiMigrationScreenModel(
    private val appContext: Context,
) : StateScreenModel<AniyomiMigrationScreenModel.State>(State()) {

    private val migrationPreferences: AniyomiMigrationPreferences = Injekt.get()

    init {
        refresh()
    }

    fun rememberLastSourceUri(uri: String) {
        migrationPreferences.migrationLastSourceUri().set(uri)
    }

    fun openLegacyApp(context: Context, packageName: String) {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            context.toast(MR.strings.app_not_available)
            return
        }
        try {
            context.startActivity(launchIntent)
        } catch (e: Exception) {
            context.toast(MR.strings.app_not_available)
        }
    }

    private fun refresh() {
        screenModelScope.launchIO {
            val detectedApps = AniyomiInstallDetector(appContext).detectLegacyApps()
            val discoveryResult = AniyomiBackupDiscovery(appContext).discover(detectedApps)

            mutableState.update {
                it.copy(
                    detectedApps = detectedApps,
                    discovery = discoveryResult,
                )
            }
        }
    }

    @Immutable
    data class State(
        val detectedApps: List<DetectedLegacyApp> = emptyList(),
        val discovery: BackupDiscoveryResult = BackupDiscoveryResult(emptyList()),
    )
}
