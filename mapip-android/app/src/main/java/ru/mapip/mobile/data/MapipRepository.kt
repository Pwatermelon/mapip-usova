package ru.mapip.mobile.data

import android.content.Context
import com.google.android.gms.maps.model.LatLng
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class MapipRepository(private val appContext: Context) {

    private val cookieStore = ConcurrentHashMap<String, MutableList<Cookie>>()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(object : CookieJar {
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                if (cookies.isEmpty()) return
                val list = cookieStore.getOrPut(url.host) { mutableListOf() }
                for (c in cookies) {
                    list.removeAll { it.name == c.name && it.domain == c.domain }
                    list.add(c)
                }
            }

            override fun loadForRequest(url: HttpUrl): List<Cookie> =
                cookieStore[url.host].orEmpty().filter { it.matches(url) }
        })
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    fun baseUrl(): String = MapipConfig.getBaseUrl(appContext)

    private fun url(path: String): String {
        val b = baseUrl().trimEnd('/')
        val p = path.trimStart('/')
        return "$b/$p"
    }

    private suspend fun exec(req: Request): Pair<Int, ByteArray> = withContext(Dispatchers.IO) {
        client.newCall(req).execute().use { resp ->
            resp.body?.bytes()?.let { resp.code to it } ?: (resp.code to ByteArray(0))
        }
    }

    private fun requireOk(code: Int, body: ByteArray, err: String) {
        if (code in 200..299) return
        throw IllegalStateException("$err HTTP $code ${body.decodeToString().take(800)}")
    }

    suspend fun fetchMapObjects(): List<MapObjectDto> = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url("GetSocialMapObject")).get().build()
        val (code, body) = exec(req)
        requireOk(code, body, "GetSocialMapObject")
        val arr = JSONArray(String(body))
        val out = mutableListOf<MapObjectDto>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                MapObjectDto(
                    id = o.optInt("id"),
                    lat = o.optDouble("x"),
                    lng = o.optDouble("y"),
                    displayName = o.optString("display_name"),
                    address = o.optString("adress"),
                    type = o.optString("type"),
                ),
            )
        }
        out
    }

    suspend fun geocode(query: String): List<GeocodeHit> {
        val enc = java.net.URLEncoder.encode(query, "UTF-8")
        val req = Request.Builder().url(url("routing/v1/geocode/search?q=$enc")).get().build()
        val (code, body) = exec(req)
        requireOk(code, body, "geocode")
        val arr = JSONArray(String(body))
        val out = mutableListOf<GeocodeHit>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                GeocodeHit(
                    lat = o.optDouble("lat"),
                    lon = o.optDouble("lon"),
                    displayName = o.optString("display_name"),
                ),
            )
        }
        return out
    }

    suspend fun buildRoute(
        fromLat: Double,
        fromLon: Double,
        toLat: Double,
        toLon: Double,
        profile: String,
        alternativeCount: Int,
        via: Pair<Double, Double>? = null,
    ): ByteArray {
        val root = JSONObject().apply {
            put("from", JSONArray(listOf(fromLat, fromLon)))
            put("to", JSONArray(listOf(toLat, toLon)))
            put("profile", profile)
            put("alternativeCount", alternativeCount)
            if (via != null) {
                put("via", JSONArray(listOf(JSONArray(listOf(via.first, via.second))))))
            }
        }
        val media = "application/json; charset=utf-8".toMediaType()
        val req = Request.Builder()
            .url(url("routing/v1/directions/geojson"))
            .post(root.toString().toRequestBody(media))
            .build()
        val (code, body) = exec(req)
        requireOk(code, body, "directions")
        return body
    }

    suspend fun overpassPoints(bbox: String, profile: String): List<OverpassPoint> {
        val enc = java.net.URLEncoder.encode(bbox, "UTF-8")
        val pEnc = java.net.URLEncoder.encode(profile, "UTF-8")
        val u = url("routing/v1/overpass/objects?bbox=$enc&profile=$pEnc")
        val req = Request.Builder().url(u).get().build()
        val (code, body) = exec(req)
        requireOk(code, body, "overpass")
        return RouteJson.overpassFeaturesToPoints(body)
    }

    suspend fun login(email: String, password: String) {
        val json = JSONObject().apply {
            put("email", email.trim())
            put("password", password)
        }
        val media = "application/json; charset=utf-8".toMediaType()
        val req = Request.Builder()
            .url(url("api/users/login"))
            .post(json.toString().toRequestBody(media))
            .build()
        val (code, body) = exec(req)
        requireOk(code, body, "login")
    }

    suspend fun logout() {
        val req = Request.Builder().url(url("api/users/logout")).get().build()
        exec(req)
    }

    suspend fun currentUser(): CurrentUserDto? {
        val req = Request.Builder().url(url("api/users/current-user")).get().build()
        val (code, body) = exec(req)
        if (code == 401) return null
        requireOk(code, body, "current-user")
        val o = JSONObject(String(body))
        return CurrentUserDto(
            id = o.optInt("id"),
            name = o.optString("name").takeIf { it.isNotEmpty() },
            type = if (o.has("type") && !o.isNull("type")) o.optInt("type") else null,
            email = o.optString("email").takeIf { it.isNotEmpty() },
            score = if (o.has("score") && !o.isNull("score")) o.optInt("score") else null,
            isAdmin = if (o.has("isAdmin") && !o.isNull("isAdmin")) o.optBoolean("isAdmin") else null,
        )
    }

    suspend fun register(name: String, type: Int, email: String, password: String) {
        val json = JSONObject().apply {
            put("name", name.trim())
            put("type", type)
            put("email", email.trim())
            put("password", password)
        }
        val media = "application/json; charset=utf-8".toMediaType()
        val req = Request.Builder()
            .url(url("api/users/AddUser"))
            .post(json.toString().toRequestBody(media))
            .build()
        val (code, body) = exec(req)
        requireOk(code, body, "AddUser")
    }

    suspend fun fetchAccessibilityOptions(): List<String> {
        val req = Request.Builder().url(url("api/SocialMapObject/get/accessibility")).get().build()
        val (code, body) = exec(req)
        requireOk(code, body, "accessibility")
        val arr = JSONArray(String(body))
        return List(arr.length()) { arr.getString(it) }
    }

    suspend fun fetchInfrastructureDict(): Map<String, List<String>> {
        val req = Request.Builder().url(url("api/admin/get/infrastructure")).get().build()
        val (code, body) = exec(req)
        requireOk(code, body, "infrastructure")
        val obj = JSONObject(String(body))
        val out = mutableMapOf<String, List<String>>()
        for (key in obj.keys()) {
            val arr = obj.optJSONArray(key) ?: continue
            val list = mutableListOf<String>()
            for (i in 0 until arr.length()) list.add(arr.getString(i))
            out[key] = list
        }
        return out
    }

    suspend fun addMapObjectMultipart(
        name: String,
        address: String,
        type: String,
        description: String,
        workingHours: String,
        latitude: Double?,
        longitude: Double?,
        accessibility: List<String>,
        disabilityCategory: List<String>,
        imageParts: List<Triple<ByteArray, String, String>>,
        userId: Int?,
    ) {
        val boundary = "Boundary-" + java.util.UUID.randomUUID()
        val b = MultipartBody.Builder(boundary).setType(MultipartBody.FORM)
        fun addField(n: String, v: String) {
            b.addFormDataPart(n, v)
        }
        addField("name", name)
        addField("address", address)
        addField("type", type)
        addField("description", description)
        addField("workingHours", workingHours)
        if (latitude != null) addField("latitude", latitude.toString())
        if (longitude != null) addField("longitude", longitude.toString())
        for (a in accessibility) addField("accessibility", a)
        for (d in disabilityCategory) addField("disabilityCategory", d)
        if (userId != null) {
            addField("userId", userId.toString())
            addField("mapObjectId", "0")
            addField("excluded", "false")
        }
        for (part in imageParts) {
            val (data, filename, mime) = part
            val mt = mime.toMediaType()
            b.addFormDataPart("images", filename, data.toRequestBody(mt))
        }
        val req = Request.Builder()
            .url(url("client/AddMapObject"))
            .post(b.build())
            .build()
        val (code, body) = exec(req)
        requireOk(code, body, "AddMapObject")
    }
}
