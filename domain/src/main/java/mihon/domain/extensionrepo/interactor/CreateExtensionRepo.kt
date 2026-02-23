package mihon.domain.extensionrepo.interactor

import logcat.LogPriority
import mihon.domain.extensionrepo.exception.SaveExtensionRepoException
import mihon.domain.extensionrepo.model.ExtensionRepo
import mihon.domain.extensionrepo.repository.ExtensionRepoRepository
import mihon.domain.extensionrepo.service.ExtensionRepoService
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import tachiyomi.core.common.util.system.logcat

class CreateExtensionRepo(
    private val repository: ExtensionRepoRepository,
    private val service: ExtensionRepoService,
) {
    private val repoRegex = """^https://.*/index\.min\.json$""".toRegex()

    suspend fun await(indexUrl: String): Result {
        val formattedIndexUrl = indexUrl.toHttpUrlOrNull()
            ?.toString()
            ?.takeIf { it.matches(repoRegex) }
            ?: return Result.InvalidUrl

        val baseUrl = formattedIndexUrl.removeSuffix("/index.min.json")
        return service.fetchRepoDetails(baseUrl)?.let { insert(it) } ?: Result.InvalidUrl
    }

    private suspend fun insert(repo: ExtensionRepo): Result {
        return try {
            repository.insertRepo(
                repo.baseUrl,
                repo.name,
                repo.shortName,
                repo.website,
                repo.signingKeyFingerprint,
            )
            Result.Success
        } catch (e: SaveExtensionRepoException) {
            logcat(LogPriority.WARN, e) { "SQL Conflict attempting to add new repository ${repo.baseUrl}" }
            return handleInsertionError(repo)
        }
    }

    /**
     * Error Handler for insert when there are trying to create new repositories
     *
     * SaveExtensionRepoException doesn't provide constraint info in exceptions.
     * First check if the conflict was on primary key. if so return RepoAlreadyExists
     * Then check if the conflict was on fingerprint. if so Return DuplicateFingerprint
     * If neither are found, there was some other Error, and return Result.Error
     *
     * @param repo Extension Repo holder for passing to DB/Error Dialog
     */
    private suspend fun handleInsertionError(repo: ExtensionRepo): Result {
        val repoExists = repository.getRepo(repo.baseUrl)
        if (repoExists != null) {
            return Result.RepoAlreadyExists
        }
        val matchingFingerprintRepo = repository.getRepoBySigningKeyFingerprint(repo.signingKeyFingerprint)
        if (matchingFingerprintRepo != null) {
            return Result.DuplicateFingerprint(matchingFingerprintRepo, repo)
        }
        return Result.Error
    }

    sealed interface Result {
        data class DuplicateFingerprint(val oldRepo: ExtensionRepo, val newRepo: ExtensionRepo) : Result
        data object InvalidUrl : Result
        data object RepoAlreadyExists : Result
        data object Success : Result
        data object Error : Result
    }

    companion object {
        const val OFFICIAL_REPO_WEBSITE = "https://github.com/aniyomiorg/aniyomi-extensions"
        const val OFFICIAL_REPO_BASE_URL = "https://raw.githubusercontent.com/aniyomiorg/aniyomi-extensions/repo"
        const val IMMORTAL_FOREST_REPO_BASE_URL = "https://raw.githubusercontent.com/immortal-forest/aniyomi-extensions/repo"
        const val ADLY_AR_REPO_BASE_URL = "https://raw.githubusercontent.com/adly98/aniyomi-ar-extensions/repo"

        const val OFFICIAL_REPO_SIGNATURE = "50ab1d1e3a20d204d0ad6d334c7691c632e41b98dfa132bf385695fdfa63839c"
        const val IMMORTAL_FOREST_REPO_SIGNATURE = "c6607aa6ea581cfb012f673cb4db447d7f7200f62a915ad1ca9c44bbe321024f"
        const val ADLY_AR_REPO_SIGNATURE = "2976976a0fc115f259dac80ccf7aa073387e62ee4c6bee6ce4c53ef7d4796189"
        const val KEIYOUSHI_REPO_SIGNATURE = "9add655a78e96c4ec7a53ef89dccb557cb5d767489fac5e785d671a5a75d4da2"

        val OFFICIAL_BOOTSTRAP_REPO_BASE_URLS = listOf(
            OFFICIAL_REPO_BASE_URL,
            IMMORTAL_FOREST_REPO_BASE_URL,
            ADLY_AR_REPO_BASE_URL,
        )

        val OFFICIAL_BOOTSTRAP_REPO_INDEX_URLS = OFFICIAL_BOOTSTRAP_REPO_BASE_URLS.map {
            "$it/index.min.json"
        }
    }
}
