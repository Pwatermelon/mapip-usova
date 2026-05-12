package ru.mapip.mobile.data

import android.content.Context

object MapipConfig {
    private const val PREFS = "mapip_prefs"
    private const val KEY_BASE = "mapip.baseURL"

    /** Эмулятор → хост: `10.0.2.2`; на устройстве укажите IP машины в «Сервер». */
    const val DEFAULT_BASE_URL = "http://10.0.2.2:8088"

    fun getBaseUrl(ctx: Context): String {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_BASE, null)
            ?.trim().orEmpty()
        return raw.ifEmpty { DEFAULT_BASE_URL }.trimEnd('/')
    }

    fun setBaseUrl(ctx: Context, url: String) {
        val u = url.trim().trimEnd('/')
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_BASE, u)
            .apply()
    }
}
