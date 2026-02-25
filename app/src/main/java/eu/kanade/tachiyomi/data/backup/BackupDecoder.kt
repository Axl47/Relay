package eu.kanade.tachiyomi.data.backup

import android.content.Context
import android.net.Uri
import eu.kanade.tachiyomi.data.backup.models.Backup
import eu.kanade.tachiyomi.data.backup.models.BackupAnime
import eu.kanade.tachiyomi.data.backup.models.BackupCategory
import eu.kanade.tachiyomi.data.backup.models.BrokenBackupAnimeSource
import eu.kanade.tachiyomi.data.backup.models.BackupCustomButtons
import eu.kanade.tachiyomi.data.backup.models.BackupExtension
import eu.kanade.tachiyomi.data.backup.models.BackupExtensionRepos
import eu.kanade.tachiyomi.data.backup.models.BackupPreference
import eu.kanade.tachiyomi.data.backup.models.BackupSource
import eu.kanade.tachiyomi.data.backup.models.BackupSourcePreferences
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.protobuf.ProtoBuf
import kotlinx.serialization.protobuf.ProtoNumber
import okio.buffer
import okio.gzip
import okio.source
import tachiyomi.core.common.i18n.stringResource
import tachiyomi.i18n.MR
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.io.IOException

class BackupDecoder(
    private val context: Context,
    private val parser: ProtoBuf = Injekt.get(),
) {
    /**
     * Decode a potentially-gzipped backup.
     */
    fun decode(uri: Uri): Backup {
        return context.contentResolver.openInputStream(uri)!!.use { inputStream ->
            val source = inputStream.source().buffer()

            val peeked = source.peek().apply {
                require(2)
            }
            val id1id2 = peeked.readShort()
            val backupString = when (id1id2.toInt()) {
                0x1f8b -> source.gzip().buffer() // 0x1f8b is gzip magic bytes
                MAGIC_JSON_SIGNATURE1, MAGIC_JSON_SIGNATURE2, MAGIC_JSON_SIGNATURE3 -> {
                    throw IOException(context.stringResource(MR.strings.invalid_backup_file_json))
                }
                else -> source
            }.use { it.readByteArray() }

            try {
                decodeByteArray(backupString, parser)
            } catch (_: SerializationException) {
                throw IOException(context.stringResource(MR.strings.invalid_backup_file_unknown))
            }
        }
    }

    companion object {
        internal fun decodeByteArray(
            backupBytes: ByteArray,
            parser: ProtoBuf = ProtoBuf,
        ): Backup {
            val primary = runCatching {
                parser.decodeFromByteArray(Backup.serializer(), backupBytes)
            }.getOrNull()

            val compat = runCatching {
                parser.decodeFromByteArray(BackupCompat500Raw.serializer(), backupBytes).toBackup(parser)
            }.getOrNull()

            return listOfNotNull(primary, compat)
                .maxByOrNull { it.contentScore() }
                ?: throw SerializationException("Failed to decode backup")
        }

        private const val MAGIC_JSON_SIGNATURE1 = 0x7b7d // `{}`
        private const val MAGIC_JSON_SIGNATURE2 = 0x7b22 // `{"`
        private const val MAGIC_JSON_SIGNATURE3 = 0x7b0a // `{\n`
    }
}

private fun Backup.contentScore(): Int {
    return backupAnime.size +
        backupAnimeCategories.size +
        backupSources.size +
        backupPreferences.size +
        backupSourcePreferences.size +
        backupExtensions.size +
        backupAnimeExtensionRepo.size +
        backupCustomButton.size
}

/**
 * Compatibility schema observed in older/newer forks where top-level fields were shifted to the 500 range.
 *
 * Keep top-level messages as raw bytes so one malformed entry (or a fork-specific variant) doesn't
 * invalidate decoding for the whole backup.
 */
@Serializable
private data class BackupCompat500Raw(
    @ProtoNumber(500) val backupVersion: Int? = null,
    @ProtoNumber(501) val backupAnimeRaw: List<ByteArray> = emptyList(),
    @ProtoNumber(502) var backupAnimeCategoriesRaw: List<ByteArray> = emptyList(),
    @ProtoNumber(503) var backupSourcesRaw: List<ByteArray> = emptyList(),
    @ProtoNumber(104) var backupPreferencesRaw: List<ByteArray> = emptyList(),
    @ProtoNumber(105) var backupSourcePreferencesRaw: List<ByteArray> = emptyList(),
    @ProtoNumber(504) var backupExtensionsOrReposRawA: List<ByteArray> = emptyList(),
    @ProtoNumber(505) var backupExtensionsOrReposRawB: List<ByteArray> = emptyList(),
    @ProtoNumber(506) var backupCustomButtonRaw: List<ByteArray> = emptyList(),
) {
    fun toBackup(parser: ProtoBuf): Backup {
        val mapAExtensions = backupExtensionsOrReposRawA.decodeMessages(
            parser = parser,
            serializer = BackupExtension.serializer(),
            validator = { it.isLikelyExtensionEntry() },
        )
        val mapARepos = backupExtensionsOrReposRawA.decodeMessages(
            parser = parser,
            serializer = BackupExtensionRepos.serializer(),
            validator = { it.isLikelyExtensionRepo() },
        )
        val mapBExtensions = backupExtensionsOrReposRawB.decodeMessages(
            parser = parser,
            serializer = BackupExtension.serializer(),
            validator = { it.isLikelyExtensionEntry() },
        )
        val mapBRepos = backupExtensionsOrReposRawB.decodeMessages(
            parser = parser,
            serializer = BackupExtensionRepos.serializer(),
            validator = { it.isLikelyExtensionRepo() },
        )

        // Most backups use 504=extensions/505=repos, but some builds swap these two fields.
        val useSwappedMapping = (mapBExtensions.size + mapARepos.size) > (mapAExtensions.size + mapBRepos.size)
        val backupExtensions = if (useSwappedMapping) mapBExtensions else mapAExtensions
        val backupAnimeExtensionRepo = if (useSwappedMapping) mapARepos else mapBRepos

        return Backup(
            backupAnime = backupAnimeRaw.decodeMessages(parser, BackupAnime.serializer()),
            backupAnimeCategories = backupAnimeCategoriesRaw.decodeMessages(parser, BackupCategory.serializer()),
            backupSources = backupSourcesRaw.decodeBackupSources(parser),
            backupPreferences = backupPreferencesRaw.decodeMessages(parser, BackupPreference.serializer()),
            backupSourcePreferences = backupSourcePreferencesRaw.decodeMessages(parser, BackupSourcePreferences.serializer()),
            backupExtensions = backupExtensions,
            backupAnimeExtensionRepo = backupAnimeExtensionRepo,
            backupCustomButton = backupCustomButtonRaw.decodeMessages(parser, BackupCustomButtons.serializer()),
        )
    }
}

private fun List<ByteArray>.decodeBackupSources(parser: ProtoBuf): List<BackupSource> {
    return mapNotNull { raw ->
        runCatching {
            parser.decodeFromByteArray(BackupSource.serializer(), raw)
        }.getOrNull() ?: runCatching {
            parser.decodeFromByteArray(BrokenBackupAnimeSource.serializer(), raw).toBackupSource()
        }.getOrNull()
    }
}

private fun <T> List<ByteArray>.decodeMessages(
    parser: ProtoBuf,
    serializer: KSerializer<T>,
    validator: (T) -> Boolean = { true },
): List<T> {
    return mapNotNull { raw ->
        runCatching {
            parser.decodeFromByteArray(serializer, raw)
        }.getOrNull()?.takeIf(validator)
    }
}

private fun BackupExtension.isLikelyExtensionEntry(): Boolean {
    return pkgName.isNotBlank() &&
        apk.size >= 2 &&
        apk[0] == 0x50.toByte() && // 'P'
        apk[1] == 0x4B.toByte() // 'K'
}

private fun BackupExtensionRepos.isLikelyExtensionRepo(): Boolean {
    return baseUrl.isNotBlank() && name.isNotBlank()
}
