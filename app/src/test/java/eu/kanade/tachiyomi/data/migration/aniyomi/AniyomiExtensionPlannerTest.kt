package eu.kanade.tachiyomi.data.migration.aniyomi

import eu.kanade.tachiyomi.data.backup.models.BackupExtension
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import java.io.File
import java.nio.file.Files

class AniyomiExtensionPlannerTest {

    @Test
    fun `buildExtensionImportPlan merges backup and shared extensions preferring shared source`() {
        val backupA = byteArrayOf(1, 2, 3)
        val backupB = byteArrayOf(4, 5, 6)
        val sharedA = File("/tmp/pkg_a.apk")
        val sharedC = File("/tmp/pkg_c.apk")

        val plan = buildExtensionImportPlan(
            backupExtensions = listOf(
                BackupExtension(pkgName = "pkg.a", apk = backupA),
                BackupExtension(pkgName = "pkg.b", apk = backupB),
            ),
            sharedExtensions = listOf(
                SharedExtensionApk(pkgName = "pkg.a", apkFile = sharedA),
                SharedExtensionApk(pkgName = "pkg.c", apkFile = sharedC),
            ),
        )

        assertEquals(listOf("pkg.a", "pkg.b", "pkg.c"), plan.map { it.pkgName })
        val pkgA = plan.first { it.pkgName == "pkg.a" }
        assertEquals(sharedA, pkgA.sharedApkFile)
        assertArrayEquals(backupA, pkgA.backupApk)
        assertNotNull(pkgA.sharedApkFile)
    }

    @Test
    fun `resolveExtensionInstallAction couples shared when toggle is enabled`() {
        val sharedFile = Files.createTempFile("relay_migration", ".apk").toFile()
        try {
            val action = resolveExtensionInstallAction(
                item = ExtensionImportPlanItem(
                    pkgName = "pkg.a",
                    sharedApkFile = sharedFile,
                    backupApk = byteArrayOf(1),
                ),
                coupleSharedSources = true,
            )

            assertEquals(ExtensionInstallAction.CoupleShared, action)
        } finally {
            sharedFile.delete()
        }
    }

    @Test
    fun `resolveExtensionInstallAction copies shared privately when coupling is disabled`() {
        val sharedFile = Files.createTempFile("relay_migration", ".apk").toFile()
        try {
            val action = resolveExtensionInstallAction(
                item = ExtensionImportPlanItem(
                    pkgName = "pkg.a",
                    sharedApkFile = sharedFile,
                    backupApk = byteArrayOf(1),
                ),
                coupleSharedSources = false,
            )

            assertEquals(ExtensionInstallAction.CopySharedToPrivate, action)
        } finally {
            sharedFile.delete()
        }
    }

    @Test
    fun `resolveExtensionInstallAction falls back to backup when shared apk is unavailable`() {
        val action = resolveExtensionInstallAction(
            item = ExtensionImportPlanItem(
                pkgName = "pkg.a",
                sharedApkFile = File("/tmp/does-not-exist.apk"),
                backupApk = byteArrayOf(1, 2, 3),
            ),
            coupleSharedSources = true,
        )

        assertEquals(ExtensionInstallAction.CopyBackupToPrivate, action)
    }
}
