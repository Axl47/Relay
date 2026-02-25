package eu.kanade.tachiyomi.data.migration.aniyomi

import eu.kanade.tachiyomi.data.backup.models.BackupExtension
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import java.io.File

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
}
