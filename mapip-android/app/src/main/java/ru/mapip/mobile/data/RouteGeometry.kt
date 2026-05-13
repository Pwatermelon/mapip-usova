package ru.mapip.mobile.data

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import org.osmdroid.util.GeoPoint

object RouteGeometry {

    fun bboxString(line: List<GeoPoint>): String? {
        if (line.isEmpty()) return null
        var minLat = line[0].latitude
        var maxLat = line[0].latitude
        var minLon = line[0].longitude
        var maxLon = line[0].longitude
        for (p in line) {
            minLat = min(minLat, p.latitude)
            maxLat = max(maxLat, p.latitude)
            minLon = min(minLon, p.longitude)
            maxLon = max(maxLon, p.longitude)
        }
        return "$minLon,$minLat,$maxLon,$maxLat"
    }

    fun pickViaCandidates(base: List<GeoPoint>, points: List<OverpassPoint>, maxCount: Int): List<OverpassPoint> {
        if (base.size < 2) return emptyList()
        val ranked = points.mapNotNull { p ->
            val foot = nearestFootOnPolyline(base, p.lat, p.lon) ?: return@mapNotNull null
            val progress = foot.progress
            if (progress <= 0.12 || progress >= 0.88) return@mapNotNull null
            Triple(p, foot.distSq, progress)
        }.sortedBy { it.second }

        val out = mutableListOf<OverpassPoint>()
        val used = mutableListOf<Double>()
        for ((p, _, progress) in ranked) {
            if (out.size >= maxCount) break
            if (used.any { abs(it - progress) < 0.05 }) continue
            used.add(progress)
            out.add(p)
        }
        return out
    }

    fun dedupViaCandidates(points: List<OverpassPoint>, maxCount: Int): List<OverpassPoint> {
        val out = mutableListOf<OverpassPoint>()
        for (p in points) {
            if (out.size >= maxCount) break
            val tooNear = out.any { sqDist(it.lat, it.lon, p.lat, p.lon) < 0.00018 * 0.00018 }
            if (tooNear) continue
            out.add(p)
        }
        return out
    }

    fun sqDist(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val dLat = aLat - bLat
        val dLon = aLon - bLon
        return dLat * dLat + dLon * dLon
    }

    fun isTooSimilarLine(candidate: List<GeoPoint>, existing: List<List<GeoPoint>>): Boolean =
        existing.any { overlap(candidate, it) >= 0.9 && overlap(it, candidate) >= 0.9 }

    private fun overlap(a: List<GeoPoint>, b: List<GeoPoint>, samples: Int = 30): Double {
        if (a.size <= 1 || b.size <= 1) return 1.0
        var close = 0
        for (i in 0 until samples) {
            val idx = min(a.size - 1, kotlin.math.round((i.toDouble() / max(samples - 1, 1)) * (a.size - 1)).toInt())
            val p = a[idx]
            val d = nearestDistMeters(p, b)
            if (d <= 14) close++
        }
        return close.toDouble() / samples
    }

    private fun nearestDistMeters(p: GeoPoint, line: List<GeoPoint>): Double {
        var best = Double.MAX_VALUE
        for (q in line) {
            val d = metersApprox(p.latitude, p.longitude, q.latitude, q.longitude)
            if (d < best) best = d
        }
        return best
    }

    private fun metersApprox(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = (lat2 - lat1) * 111_320
        val dLon = (lon2 - lon1) * 111_320 * cos(((lat1 + lat2) / 2) * Math.PI / 180)
        return sqrt(dLat * dLat + dLon * dLon)
    }

    data class FootResult(val lat: Double, val lon: Double, val distSq: Double, val progress: Double)

    fun nearestFootOnPolyline(route: List<GeoPoint>, lat: Double, lon: Double): FootResult? {
        if (route.size < 2) return null
        var bestSq = Double.MAX_VALUE
        var bestLat = lat
        var bestLon = lon
        var bestProgress = 0.0
        val n = route.size
        for (i in 0 until n - 1) {
            val a = route[i]
            val b = route[i + 1]
            val dx = b.longitude - a.longitude
            val dy = b.latitude - a.latitude
            val len2 = dx * dx + dy * dy
            if (len2 < 1e-20) continue
            val t = (((lon - a.longitude) * dx + (lat - a.latitude) * dy) / len2).coerceIn(0.0, 1.0)
            val plon = a.longitude + t * dx
            val plat = a.latitude + t * dy
            val d = sqDist(plat, plon, lat, lon)
            if (d < bestSq) {
                bestSq = d
                bestLat = plat
                bestLon = plon
                bestProgress = (i + t) / (n - 1)
            }
        }
        return FootResult(bestLat, bestLon, bestSq, bestProgress)
    }

    fun corridorViaFromPoi(base: List<GeoPoint>, poi: OverpassPoint, variant: Int): GeoPoint? {
        val foot = nearestFootOnPolyline(base, poi.lat, poi.lon) ?: return null
        if (base.size < 2) return null
        val n = base.size
        val segIdx = ((foot.progress * (n - 1)).toInt()).coerceIn(0, n - 2)
        val a = base[segIdx]
        val b = base[segIdx + 1]
        val dx = b.longitude - a.longitude
        val dy = b.latitude - a.latitude
        val len = sqrt(dx * dx + dy * dy)
        if (len < 1e-12) return null
        val px = -dy / len
        val py = dx / len
        val lateralDeg = (0.00028 + (variant % 3) * 0.0001) * (if (variant % 2 == 0) 1 else -1)
        val towardBiases = listOf(0.08, 0.11, 0.14)
        val towardPoiBias = towardBiases[variant % towardBiases.size]
        var vLat = foot.lat + (poi.lat - foot.lat) * towardPoiBias
        var vLon = foot.lon + (poi.lon - foot.lon) * towardPoiBias
        vLat += px * lateralDeg
        vLon += py * lateralDeg
        return GeoPoint(vLat, vLon)
    }

    fun boundingRegion(coords: List<GeoPoint>): Pair<GeoPoint, Pair<Double, Double>>? {
        if (coords.isEmpty()) return null
        var minLat = coords[0].latitude
        var maxLat = coords[0].latitude
        var minLon = coords[0].longitude
        var maxLon = coords[0].longitude
        for (c in coords) {
            minLat = min(minLat, c.latitude)
            maxLat = max(maxLat, c.latitude)
            minLon = min(minLon, c.longitude)
            maxLon = max(maxLon, c.longitude)
        }
        val center = GeoPoint((minLat + maxLat) / 2, (minLon + maxLon) / 2)
        val latSpan = max((maxLat - minLat) * 1.35, 0.01)
        val lonSpan = max((maxLon - minLon) * 1.35, 0.01)
        return center to (latSpan to lonSpan)
    }
}
