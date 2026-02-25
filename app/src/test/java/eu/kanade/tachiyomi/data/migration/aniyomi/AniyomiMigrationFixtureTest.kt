package eu.kanade.tachiyomi.data.migration.aniyomi

import eu.kanade.tachiyomi.data.backup.BackupDecoder
import eu.kanade.tachiyomi.data.backup.models.Backup
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import java.io.File
import java.util.zip.GZIPInputStream

class AniyomiMigrationFixtureTest {

    @ParameterizedTest
    @CsvSource(
        "docs/xyz.jmir.tachiyomi.mi_2026-02-24_20-20.tachibk,true",
        "docs/xyz.jmir.tachiyomi.mi.debug_2026-02-24_20-54.tachibk,false",
    )
    fun `fixture backup contains decodable library entries`(fixturePath: String, expectEmbeddedExtensions: Boolean) {
        val fixture = findFixture(fixturePath)
        assertTrue(fixture.exists(), "Fixture backup file not found: ${fixture.absolutePath}")

        val backup = decodeFixture(fixture)

        if (expectEmbeddedExtensions) {
            assertTrue(
                backup.backupExtensions.isNotEmpty(),
                "Fixture should include embedded extensions for migration tests",
            )
        }
        assertTrue(
            backup.backupAnime.isNotEmpty(),
            "Fixture should include library entries, but decoded backupAnime is empty",
        )
    }

    private fun decodeFixture(file: File): Backup {
        val rawBytes = file.readBytes()
        val backupBytes = if (rawBytes.size >= 2 && rawBytes[0] == 0x1f.toByte() && rawBytes[1] == 0x8b.toByte()) {
            GZIPInputStream(rawBytes.inputStream()).use { it.readBytes() }
        } else {
            rawBytes
        }

        return BackupDecoder.decodeByteArray(backupBytes)
    }

    private fun findFixture(relativePath: String): File {
        val candidates = listOf(
            File(relativePath),
            File("../$relativePath"),
            File(System.getProperty("user.dir") ?: "").resolve(relativePath),
        )
        return candidates.firstOrNull { it.exists() } ?: candidates.first()
    }
}
