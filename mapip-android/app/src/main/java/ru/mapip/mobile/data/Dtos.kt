package ru.mapip.mobile.data

import org.osmdroid.util.GeoPoint
import org.json.JSONArray
import org.json.JSONObject

data class MapObjectDto(
    val id: Int,
    val lat: Double,
    val lng: Double,
    val displayName: String,
    val address: String,
    val type: String,
)

data class GeocodeHit(val lat: Double, val lon: Double, val displayName: String)

data class CurrentUserDto(
    val id: Int,
    val name: String?,
    val type: Int?,
    val email: String?,
    val score: Int?,
    val isAdmin: Boolean?,
)

data class OverpassPoint(val lat: Double, val lon: Double, val title: String)

data class RouteInstructionStep(val text: String, val distanceM: Double?)

object RouteJson {
    fun decodeInstructionSteps(data: ByteArray): List<RouteInstructionStep> {
        val obj = JSONObject(String(data))
        val features = obj.optJSONArray("features") ?: return emptyList()
        val first = features.optJSONObject(0) ?: return emptyList()
        val props = first.optJSONObject("properties") ?: return emptyList()
        val segments = props.optJSONArray("segments") ?: return emptyList()
        val out = mutableListOf<RouteInstructionStep>()
        for (i in 0 until segments.length()) {
            val seg = segments.optJSONObject(i) ?: continue
            val steps = seg.optJSONArray("steps") ?: continue
            for (j in 0 until steps.length()) {
                val st = steps.optJSONObject(j) ?: continue
                val ins = st.optString("instruction", "").trim()
                if (ins.isEmpty()) continue
                val d = if (st.has("distance")) st.optDouble("distance") else null
                out.add(RouteInstructionStep(ins, d))
            }
        }
        return out
    }

    fun decodeRouteSummary(data: ByteArray): String? {
        val obj = JSONObject(String(data))
        val features = obj.optJSONArray("features") ?: return null
        val first = features.optJSONObject(0) ?: return null
        val props = first.optJSONObject("properties") ?: return null
        val summary = props.optJSONObject("summary") ?: return null
        val dist = summary.optDouble("distance", 0.0)
        val dur = summary.optDouble("duration", 0.0)
        if (dist <= 0 && dur <= 0) return null
        val km = dist / 1000.0
        val min = kotlin.math.round(dur / 60.0).toInt()
        return String.format("~%.1f км, ~%d мин", km, min)
    }

    fun decodeWheelchairLongWarning(data: ByteArray, profile: String): Boolean {
        if (profile != "wheelchair") return false
        val obj = JSONObject(String(data))
        val features = obj.optJSONArray("features") ?: return false
        val first = features.optJSONObject(0) ?: return false
        val props = first.optJSONObject("properties") ?: return false
        val summary = props.optJSONObject("summary") ?: return false
        val dist = summary.optDouble("distance", 0.0)
        val dur = summary.optDouble("duration", 0.0)
        return dist > 7000 || dur > 45 * 60
    }

    /** Координаты полилинии в порядке lat, lng (как в iOS после swap из GeoJSON). */
    fun decodeLines(data: ByteArray): List<List<GeoPoint>> {
        val obj = JSONObject(String(data))
        val features = obj.optJSONArray("features") ?: return emptyList()
        val out = mutableListOf<List<GeoPoint>>()
        for (i in 0 until features.length()) {
            val f = features.optJSONObject(i) ?: continue
            val geom = f.optJSONObject("geometry") ?: continue
            if (geom.optString("type") != "LineString") continue
            val coords = geom.optJSONArray("coordinates") ?: continue
            val line = mutableListOf<GeoPoint>()
            for (j in 0 until coords.length()) {
                val pair = coords.optJSONArray(j) ?: continue
                if (pair.length() < 2) continue
                val lon = pair.getDouble(0)
                val lat = pair.getDouble(1)
                line.add(GeoPoint(lat, lon))
            }
            if (line.size >= 2) out.add(line)
        }
        return out
    }

    fun overpassFeaturesToPoints(data: ByteArray): List<OverpassPoint> {
        val raw = JSONObject(String(data))
        val features = raw.optJSONArray("features") ?: return emptyList()
        val out = mutableListOf<OverpassPoint>()
        for (i in 0 until features.length()) {
            val f = features.optJSONObject(i) ?: continue
            val geom = f.optJSONObject("geometry") ?: continue
            if (geom.optString("type") != "Point") continue
            val c = geom.optJSONArray("coordinates") ?: continue
            if (c.length() < 2) continue
            val lon = c.getDouble(0)
            val lat = c.getDouble(1)
            val props = f.optJSONObject("properties")
            val label = props?.optString("label")?.trim().orEmpty()
            val title = if (label.isNotEmpty()) label else "Объект инфраструктуры"
            out.add(OverpassPoint(lat, lon, title))
        }
        return out
    }
}
