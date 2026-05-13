package ru.mapip.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.osmdroid.util.GeoPoint
import ru.mapip.mobile.data.CurrentUserDto
import ru.mapip.mobile.data.GeocodeHit
import ru.mapip.mobile.data.MapObjectDto
import ru.mapip.mobile.data.MapipRepository
import ru.mapip.mobile.data.OverpassPoint
import ru.mapip.mobile.data.RouteGeometry
import ru.mapip.mobile.data.RouteInstructionStep
import ru.mapip.mobile.data.RouteJson

data class RouteLine(val points: List<GeoPoint>, val index: Int)

data class RouterUiState(
    val loadingUser: Boolean = false,
    val user: CurrentUserDto? = null,
    val fromText: String = "",
    val toText: String = "",
    val fromPoint: GeoPoint? = null,
    val toPoint: GeoPoint? = null,
    val fromSuggestions: List<GeocodeHit> = emptyList(),
    val toSuggestions: List<GeocodeHit> = emptyList(),
    val profile: String = "wheelchair",
    val alternatives: Int = 3,
    val objects: List<MapObjectDto> = emptyList(),
    val lines: List<RouteLine> = emptyList(),
    val overpassPoints: List<OverpassPoint> = emptyList(),
    val routeSteps: List<RouteInstructionStep> = emptyList(),
    val routeSummary: String? = null,
    val wheelchairLongWarning: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val mapPickTarget: MapPick? = null,
    val useCurrentLocationAsFrom: Boolean = false,
    val selectedObject: MapObjectDto? = null,
    val navigationRoute: List<GeoPoint> = emptyList(),
    val fromSuggestVersion: Int = 0,
    val toSuggestVersion: Int = 0,
    val cameraCenter: GeoPoint? = null,
    val cameraLatSpan: Double = 0.06,
    val cameraLonSpan: Double = 0.06,
)

enum class MapPick { FROM, TO }

class RouterViewModel(application: Application) : AndroidViewModel(application) {

    private val repo = MapipRepository(application.applicationContext)

    private val _ui = MutableStateFlow(RouterUiState())
    val ui: StateFlow<RouterUiState> = _ui.asStateFlow()

    init {
        refreshUser()
        loadObjects()
    }

    fun onBaseUrlChanged() {
        loadObjects()
        refreshUser()
    }

    fun refreshUser() {
        viewModelScope.launch {
            _ui.update { it.copy(loadingUser = true, error = null) }
            try {
                val u = repo.currentUser()
                _ui.update { it.copy(user = u, loadingUser = false) }
            } catch (_: Exception) {
                _ui.update { it.copy(user = null, loadingUser = false) }
            }
        }
    }

    fun loadObjects() {
        viewModelScope.launch {
            try {
                val list = repo.fetchMapObjects()
                _ui.update { it.copy(objects = list) }
            } catch (_: Exception) {
                _ui.update { it.copy(objects = emptyList()) }
            }
        }
    }

    fun setFromText(t: String) {
        val v = _ui.value.fromSuggestVersion + 1
        _ui.update { it.copy(fromText = t, fromSuggestVersion = v, toSuggestions = emptyList()) }
        suggestFrom(t, v)
    }

    fun setToText(t: String) {
        val v = _ui.value.toSuggestVersion + 1
        _ui.update { it.copy(toText = t, toSuggestVersion = v, fromSuggestions = emptyList()) }
        suggestTo(t, v)
    }

    private fun localSuggestions(term: String): List<GeocodeHit> {
        val q = term.lowercase()
        return _ui.value.objects
            .filter { it.displayName.lowercase().contains(q) || it.address.lowercase().contains(q) }
            .take(5)
            .map { GeocodeHit(lat = it.lat, lon = it.lng, displayName = it.displayName) }
    }

    private fun suggestFrom(query: String, version: Int) {
        viewModelScope.launch {
            val term = query.trim()
            if (term.length < 2) {
                if (_ui.value.fromSuggestVersion == version) _ui.update { it.copy(fromSuggestions = emptyList()) }
                return@launch
            }
            val local = localSuggestions(term)
            val merged = try {
                val remote = repo.geocode(term)
                if (_ui.value.fromSuggestVersion != version) return@launch
                val m = local.toMutableList()
                for (h in remote) {
                    if (m.none { it.displayName == h.displayName }) m.add(h)
                    if (m.size >= 7) break
                }
                m
            } catch (_: Exception) {
                if (_ui.value.fromSuggestVersion != version) return@launch
                local
            }
            if (_ui.value.fromSuggestVersion == version) _ui.update { it.copy(fromSuggestions = merged) }
        }
    }

    private fun suggestTo(query: String, version: Int) {
        viewModelScope.launch {
            val term = query.trim()
            if (term.length < 2) {
                if (_ui.value.toSuggestVersion == version) _ui.update { it.copy(toSuggestions = emptyList()) }
                return@launch
            }
            val local = localSuggestions(term)
            val merged = try {
                val remote = repo.geocode(term)
                if (_ui.value.toSuggestVersion != version) return@launch
                val m = local.toMutableList()
                for (h in remote) {
                    if (m.none { it.displayName == h.displayName }) m.add(h)
                    if (m.size >= 7) break
                }
                m
            } catch (_: Exception) {
                if (_ui.value.toSuggestVersion != version) return@launch
                local
            }
            if (_ui.value.toSuggestVersion == version) _ui.update { it.copy(toSuggestions = merged) }
        }
    }

    fun setFromPoint(p: GeoPoint) {
        _ui.update {
            it.copy(
                fromPoint = p,
                fromText = String.format("%.6f, %.6f", p.latitude, p.longitude),
                fromSuggestions = emptyList(),
                mapPickTarget = null,
            )
        }
    }

    fun setToPoint(p: GeoPoint) {
        _ui.update {
            it.copy(
                toPoint = p,
                toText = String.format("%.6f, %.6f", p.latitude, p.longitude),
                toSuggestions = emptyList(),
                mapPickTarget = null,
            )
        }
    }

    fun toggleMapPick(target: MapPick) {
        _ui.update { s ->
            s.copy(mapPickTarget = if (s.mapPickTarget == target) null else target)
        }
    }

    fun setProfile(p: String) {
        _ui.update { it.copy(profile = p) }
    }

    fun setAlternatives(n: Int) {
        _ui.update { it.copy(alternatives = n.coerceIn(1, 3)) }
    }

    fun setUseCurrentLocationAsFrom(v: Boolean) {
        _ui.update { it.copy(useCurrentLocationAsFrom = v) }
    }

    fun applyFromHit(hit: GeocodeHit) {
        _ui.update {
            it.copy(
                fromText = hit.displayName,
                fromPoint = GeoPoint(hit.lat, hit.lon),
                fromSuggestions = emptyList(),
            )
        }
    }

    fun applyToHit(hit: GeocodeHit) {
        _ui.update {
            it.copy(
                toText = hit.displayName,
                toPoint = GeoPoint(hit.lat, hit.lon),
                toSuggestions = emptyList(),
            )
        }
    }

    fun selectObject(o: MapObjectDto?) {
        _ui.update { it.copy(selectedObject = o) }
    }

    fun setCurrentLocationAsFrom(loc: GeoPoint) {
        _ui.update {
            it.copy(
                fromPoint = loc,
                fromText = String.format("%.6f, %.6f", loc.latitude, loc.longitude),
            )
        }
    }

    fun startNavigation() {
        val line = _ui.value.lines.firstOrNull()?.points.orEmpty()
        _ui.update { it.copy(navigationRoute = line) }
    }

    fun stopNavigation() {
        _ui.update { it.copy(navigationRoute = emptyList()) }
    }

    fun fitCameraToLines() {
        val coords = _ui.value.lines.flatMap { it.points }
        val reg = RouteGeometry.boundingRegion(coords) ?: return
        _ui.update {
            it.copy(
                cameraCenter = reg.first,
                cameraLatSpan = reg.second.first,
                cameraLonSpan = reg.second.second,
            )
        }
    }

    fun buildRoute(currentLocation: GeoPoint?) {
        viewModelScope.launch {
            _ui.update {
                it.copy(
                    error = null,
                    message = null,
                    lines = emptyList(),
                    overpassPoints = emptyList(),
                    routeSteps = emptyList(),
                    routeSummary = null,
                    wheelchairLongWarning = false,
                )
            }
            val s = _ui.value
            if (s.fromText.isBlank() || s.toText.isBlank()) {
                _ui.update { it.copy(error = "Заполните оба поля") }
                return@launch
            }
            try {
                val resolvedFrom: GeoPoint = if (s.useCurrentLocationAsFrom && currentLocation != null) {
                    _ui.update { it.copy(fromPoint = currentLocation, fromText = String.format("%.6f, %.6f", currentLocation.latitude, currentLocation.longitude)) }
                    currentLocation
                } else if (s.fromPoint != null) {
                    s.fromPoint!!
                } else {
                    val a = repo.geocode(s.fromText)
                    val fa = a.firstOrNull() ?: run {
                        _ui.update { it.copy(error = "Точка «Откуда» не найдена") }
                        return@launch
                    }
                    val p = GeoPoint(fa.lat, fa.lon)
                    _ui.update { it.copy(fromPoint = p) }
                    p
                }

                val resolvedTo: GeoPoint = if (s.toPoint != null) {
                    s.toPoint!!
                } else {
                    val b = repo.geocode(s.toText)
                    val fb = b.firstOrNull() ?: run {
                        _ui.update { it.copy(error = "Точка «Куда» не найдена") }
                        return@launch
                    }
                    val p = GeoPoint(fb.lat, fb.lon)
                    _ui.update { it.copy(toPoint = p) }
                    p
                }

                val profile = _ui.value.profile
                val alternatives = _ui.value.alternatives

                val data = repo.buildRoute(
                    fromLat = resolvedFrom.latitude,
                    fromLon = resolvedFrom.longitude,
                    toLat = resolvedTo.latitude,
                    toLon = resolvedTo.longitude,
                    profile = profile,
                    alternativeCount = alternatives,
                )

                val steps = RouteJson.decodeInstructionSteps(data)
                val summary = RouteJson.decodeRouteSummary(data)
                val ww = RouteJson.decodeWheelchairLongWarning(data, profile)
                var decoded = RouteJson.decodeLines(data)

                if (decoded.size < alternatives && (decoded.firstOrNull()?.size ?: 0) >= 2) {
                    val first = decoded.first()
                    val bbox = RouteGeometry.bboxString(first)
                    if (bbox != null) {
                        val overpassPts = try {
                            repo.overpassPoints(bbox, profile)
                        } catch (_: Exception) {
                            emptyList()
                        }
                        _ui.update { it.copy(overpassPoints = overpassPts) }
                        val candidates = RouteGeometry.dedupViaCandidates(
                            RouteGeometry.pickViaCandidates(first, overpassPts, 8),
                            8,
                        )
                        for ((idx, via) in candidates.withIndex()) {
                            if (decoded.size >= alternatives) break
                            val viaLL = RouteGeometry.corridorViaFromPoi(first, via, decoded.size)
                                ?: continue
                            val viaData = repo.buildRoute(
                                fromLat = resolvedFrom.latitude,
                                fromLon = resolvedFrom.longitude,
                                toLat = resolvedTo.latitude,
                                toLon = resolvedTo.longitude,
                                profile = profile,
                                alternativeCount = 1,
                                via = viaLL.latitude to viaLL.longitude,
                            )
                            val viaLines = RouteJson.decodeLines(viaData)
                            val line = viaLines.firstOrNull() ?: continue
                            if (RouteGeometry.isTooSimilarLine(line, decoded)) continue
                            decoded = decoded + listOf(line)
                        }
                    }
                }

                val lines = decoded.mapIndexed { idx, pts -> RouteLine(pts, idx) }
                var msg = "Маршрутов: ${lines.size}"
                if (lines.size < alternatives) msg += ". Сервис вернул меньше альтернатив, чем запрошено."

                _ui.update {
                    it.copy(
                        lines = lines,
                        routeSteps = steps,
                        routeSummary = summary,
                        wheelchairLongWarning = ww,
                        message = msg,
                    )
                }
                fitCameraToLines()
            } catch (e: Exception) {
                _ui.update { it.copy(error = e.message ?: e.toString()) }
            }
        }
    }

    suspend fun login(email: String, password: String) {
        repo.login(email, password)
        val u = repo.currentUser()
        _ui.update { it.copy(user = u) }
    }

    suspend fun register(name: String, type: Int, email: String, password: String) {
        repo.register(name, type, email, password)
        repo.login(email, password)
        val u = repo.currentUser()
        _ui.update { it.copy(user = u) }
    }

    fun logout() {
        viewModelScope.launch {
            try {
                repo.logout()
            } catch (_: Exception) { }
            _ui.update { it.copy(user = null) }
        }
    }
}
