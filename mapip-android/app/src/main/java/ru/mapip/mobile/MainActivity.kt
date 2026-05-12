package ru.mapip.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import ru.mapip.mobile.ui.RouterApp
import ru.mapip.mobile.ui.RouterViewModel
import ru.mapip.mobile.ui.theme.MapipTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MapipTheme {
                Surface(Modifier.fillMaxSize()) {
                    val vm: RouterViewModel = viewModel()
                    RouterApp(vm)
                }
            }
        }
    }
}
