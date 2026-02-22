package mihon.core.migration.migrations

import android.app.Application
import mihon.core.migration.Migration
import mihon.core.migration.MigrationContext

class SetupSyncDataMigration : Migration {
    override val version: Float = Migration.ALWAYS

    override suspend fun invoke(migrationContext: MigrationContext): Boolean =
        migrationContext.get<Application>() != null
}
