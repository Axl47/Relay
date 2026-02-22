package tachiyomi.domain.source.fallback

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import tachiyomi.domain.source.model.SourceHealth
import tachiyomi.domain.source.repository.SourceHealthRepository

class SourceFallbackManager(
    private val repository: SourceHealthRepository,
) {

    sealed interface State {
        data object Loading : State
        data class Playing(val sourceId: String) : State
        data class FallingBack(val nextSourceId: String) : State
        data object AllFailed : State
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state.asStateFlow()

    suspend fun <T> orderCandidates(
        animeId: Long,
        candidates: List<T>,
        sourceIdSelector: (T) -> String,
    ): List<T> {
        val priorities = repository.getPriorities(animeId)
            .associateBy { it.sourceId }

        return candidates
            .mapIndexed { defaultIndex, candidate ->
                val sourceId = sourceIdSelector(candidate)
                val health = repository.getHealth(sourceId)
                RankedCandidate(
                    value = candidate,
                    priority = priorities[sourceId]?.priority ?: Long.MAX_VALUE,
                    defaultIndex = defaultIndex,
                    healthScore = health?.healthScore ?: 2,
                    avgResponse = health?.avgResponseMs ?: Long.MAX_VALUE,
                )
            }
            .sortedWith(
                compareBy<RankedCandidate<T>> { it.priority }
                    .thenByDescending { it.healthScore }
                    .thenBy { it.avgResponse }
                    .thenBy { it.defaultIndex },
            )
            .map { it.value }
    }

    suspend fun recordSuccess(sourceId: String, responseTimeMs: Long) {
        repository.recordSuccess(sourceId, responseTimeMs)
        _state.value = State.Playing(sourceId)
    }

    suspend fun recordFailure(sourceId: String) {
        repository.recordFailure(sourceId)
    }

    fun setLoading() {
        _state.value = State.Loading
    }

    fun setFallingBack(nextSourceId: String) {
        _state.value = State.FallingBack(nextSourceId)
    }

    fun setAllFailed() {
        _state.value = State.AllFailed
    }

    private data class RankedCandidate<T>(
        val value: T,
        val priority: Long,
        val defaultIndex: Int,
        val healthScore: Int,
        val avgResponse: Long,
    )
}
