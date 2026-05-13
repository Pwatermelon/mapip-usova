package ru.mapip.mobile

import android.app.Application
import org.osmdroid.config.Configuration

class MapipApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Configuration.getInstance().load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        Configuration.getInstance().userAgentValue = packageName
    }
}
