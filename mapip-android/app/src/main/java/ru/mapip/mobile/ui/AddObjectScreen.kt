package ru.mapip.mobile.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import ru.mapip.mobile.data.CurrentUserDto
import ru.mapip.mobile.data.GeocodeHit
import ru.mapip.mobile.data.MapipRepository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddObjectScreen(
    user: CurrentUserDto,
    onDismiss: () -> Unit,
    onSuccess: () -> Unit,
) {
    val ctx = LocalContext.current
    val repo = remember { MapipRepository(ctx.applicationContext) }
    val scope = rememberCoroutineScope()

    var baseType by remember { mutableStateOf("Социальная инфраструктура") }
    var selectedInfra by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var workingHours by remember { mutableStateOf("") }
    var coords by remember { mutableStateOf<GeoPoint?>(null) }
    var mapPick by remember { mutableStateOf(false) }
    var accessibilityOptions by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedAccessibility by remember { mutableStateOf(setOf<String>()) }
    var disability by remember { mutableStateOf(setOf<String>()) }
    var infraFlat by remember { mutableStateOf<List<String>>(emptyList()) }
    var msg by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var addressSuggestions by remember { mutableStateOf<List<GeocodeHit>>(emptyList()) }
    var suggestVersion by remember { mutableStateOf(0) }
    var imageUris by remember { mutableStateOf<List<Uri>>(emptyList()) }

    val pickImages = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(6),
    ) { uris -> imageUris = uris }

    Configuration.getInstance().userAgentValue = ctx.packageName
    val mapView = remember {
        MapView(ctx).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(13.0)
            controller.setCenter(GeoPoint(51.533557, 46.034257))
        }
    }
    DisposableEffect(Unit) {
        onDispose { mapView.onDetach() }
    }

    val disabilityCodes = listOf("Г", "К", "О", "С", "У")

    fun loadLists() {
        scope.launch {
            accessibilityOptions = runCatching { repo.fetchAccessibilityOptions() }.getOrDefault(emptyList())
            infraFlat = runCatching {
                val d = repo.fetchInfrastructureDict()
                d.values.flatten().toSet().sorted()
            }.getOrDefault(emptyList())
        }
    }

    LaunchedEffect(Unit) { loadLists() }

    fun lookupAddress(q: String, version: Int) {
        scope.launch {
            val t = q.trim()
            if (t.length < 3) {
                if (suggestVersion == version) addressSuggestions = emptyList()
                return@launch
            }
            val hits = runCatching { repo.geocode(t) }.getOrDefault(emptyList())
            if (suggestVersion != version) return@launch
            addressSuggestions = hits.take(5)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Добавить объект") },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Закрыть")
                    }
                },
            )
        },
    ) { pad ->
        Column(
            Modifier
                .padding(pad)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(12.dp),
        ) {
            Text("Пользователь: ${user.email ?: "—"}", style = MaterialTheme.typography.bodySmall)
            user.score?.let { Text("Очки: $it", style = MaterialTheme.typography.bodySmall) }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Тип", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = baseType == "Транспортная инфраструктура", onClick = { baseType = "Транспортная инфраструктура" }, label = { Text("Транспорт") })
                FilterChip(selected = baseType == "Дорожная инфраструктура", onClick = { baseType = "Дорожная инфраструктура" }, label = { Text("Дорога") })
                FilterChip(selected = baseType == "Социальная инфраструктура", onClick = { baseType = "Социальная инфраструктура" }, label = { Text("Социальная") })
            }
            if (baseType == "Социальная инфраструктура") {
                Text("Категория", style = MaterialTheme.typography.labelSmall)
                Column {
                    infraFlat.forEach { v ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { selectedInfra = v }) {
                            RadioButton(selected = selectedInfra == v, onClick = { selectedInfra = v })
                            Text(v, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            OutlinedTextField(name, { name = it }, label = { Text("Название") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                address,
                {
                    address = it
                    suggestVersion++
                    val v = suggestVersion
                    lookupAddress(it, v)
                },
                label = { Text("Адрес") },
                modifier = Modifier.fillMaxWidth(),
            )
            addressSuggestions.forEach { s ->
                Text(
                    s.displayName,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .clickable {
                            address = s.displayName
                            coords = GeoPoint(s.lat, s.lon)
                            addressSuggestions = emptyList()
                        }
                        .padding(vertical = 4.dp),
                )
            }
            if (baseType == "Социальная инфраструктура") {
                OutlinedTextField(description, { description = it }, label = { Text("Описание") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                OutlinedTextField(workingHours, { workingHours = it }, label = { Text("График работы") }, modifier = Modifier.fillMaxWidth())
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(mapPick, { mapPick = it })
                Text("Тап по карте выбирает точку", style = MaterialTheme.typography.bodySmall)
            }
            AndroidView(
                modifier = Modifier.fillMaxWidth().height(220.dp),
                factory = { mapView },
                update = { map ->
                    map.overlays.clear()
                    val events = MapEventsOverlay(object : MapEventsReceiver {
                        override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                            if (mapPick) {
                                coords = p
                                address = String.format("%.6f, %.6f", p.latitude, p.longitude)
                                addressSuggestions = emptyList()
                            }
                            return true
                        }

                        override fun longPressHelper(p: GeoPoint): Boolean = false
                    })
                    map.overlays.add(events)
                    coords?.let { c ->
                        map.controller.animateTo(c)
                        map.overlays.add(
                            Marker(map).apply {
                                position = c
                                title = "Точка"
                            },
                        )
                    }
                    map.invalidate()
                }
            )
            if (baseType == "Социальная инфраструктура") {
                Text("Доступная среда", style = MaterialTheme.typography.titleSmall)
                accessibilityOptions.forEach { a ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = a in selectedAccessibility,
                            onCheckedChange = { on ->
                                selectedAccessibility = if (on) selectedAccessibility + a else selectedAccessibility - a
                            },
                        )
                        Text(a, style = MaterialTheme.typography.bodySmall)
                    }
                }
                Text("Категории инвалидности", style = MaterialTheme.typography.titleSmall)
                disabilityCodes.forEach { code ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = code in disability,
                            onCheckedChange = { on ->
                                disability = if (on) disability + code else disability - code
                            },
                        )
                        Text(code)
                    }
                }
            }
            Button(onClick = { pickImages.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                Text("Фото (до ${imageUris.size}/6)")
            }
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            msg?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onDismiss, enabled = !busy) { Text("Закрыть") }
                Button(
                    onClick = {
                        err = null
                        msg = null
                        val n = name.trim()
                        val a = address.trim()
                        if (n.isEmpty() || a.isEmpty()) {
                            err = "Заполните название и адрес."
                            return@Button
                        }
                        if (baseType == "Социальная инфраструктура" && selectedInfra.isEmpty()) {
                            err = "Выберите категорию социальной инфраструктуры."
                            return@Button
                        }
                        val typeOut = if (baseType == "Социальная инфраструктура") selectedInfra else baseType
                        busy = true
                        scope.launch {
                            try {
                                val parts = withContext(Dispatchers.IO) {
                                    imageUris.mapNotNull { uri ->
                                        ctx.contentResolver.openInputStream(uri)?.use { ins ->
                                            val bytes = ins.readBytes()
                                            val ext = uri.lastPathSegment?.substringAfterLast('.', "jpg") ?: "jpg"
                                            val mime = if (ext.equals("png", true)) "image/png" else "image/jpeg"
                                            Triple(bytes, "photo.$ext", mime)
                                        }
                                    }
                                }
                                repo.addMapObjectMultipart(
                                    name = n,
                                    address = a,
                                    type = typeOut,
                                    description = description,
                                    workingHours = workingHours,
                                    latitude = coords?.latitude,
                                    longitude = coords?.longitude,
                                    accessibility = selectedAccessibility.sorted(),
                                    disabilityCategory = disability.sorted(),
                                    imageParts = parts,
                                    userId = user.id,
                                )
                                msg = "Объект отправлен на модерацию."
                                onSuccess()
                            } catch (e: Exception) {
                                err = e.message ?: e.toString()
                            } finally {
                                busy = false
                            }
                        }
                    },
                    enabled = !busy,
                ) { Text("Отправить") }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
