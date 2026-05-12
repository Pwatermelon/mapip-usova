package ru.mapip.mobile.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch
import ru.mapip.mobile.data.GeocodeHit
import ru.mapip.mobile.data.MapipConfig

private val routeColors = listOf(Color(0xFF2E7D32), Color(0xFFF9A825), Color(0xFFC62828), Color(0xFF757575))

@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("MissingPermission")
@Composable
fun RouterApp(vm: RouterViewModel) {
    val ui by vm.ui.collectAsState()
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var showLogin by remember { mutableStateOf(false) }
    var showAdd by remember { mutableStateOf(false) }
    var showServer by remember { mutableStateOf(false) }
    var serverDraft by remember { mutableStateOf(MapipConfig.getBaseUrl(ctx)) }

    val fineGranted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) { /* fused starts in DisposableEffect */ }
    }

    var lastLoc by remember { mutableStateOf<LatLng?>(null) }
    var bearing by remember { mutableFloatStateOf(0f) }
    val fused = remember { LocationServices.getFusedLocationProviderClient(ctx) }

    DisposableEffect(ui.useCurrentLocationAsFrom, ui.navigationRoute.isNotEmpty(), fineGranted) {
        if (!fineGranted) {
            return@DisposableEffect onDispose { }
        }
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setMinUpdateIntervalMillis(500L)
            .build()
        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val l = result.lastLocation ?: return
                lastLoc = LatLng(l.latitude, l.longitude)
                if (l.hasBearing()) bearing = l.bearing
            }
        }
        fused.requestLocationUpdates(req, cb, Looper.getMainLooper())
        onDispose { fused.removeLocationUpdates(cb) }
    }

    LaunchedEffect(Unit) {
        if (!fineGranted) return@LaunchedEffect
        fused.lastLocation.addOnSuccessListener { l ->
            if (l != null) lastLoc = LatLng(l.latitude, l.longitude)
        }
    }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(LatLng(51.533557, 46.034257), 12f)
    }

    LaunchedEffect(ui.cameraCenter, ui.cameraLatSpan, ui.cameraLonSpan) {
        val c = ui.cameraCenter ?: return@LaunchedEffect
        val b = LatLngBounds.builder()
        val halfLat = ui.cameraLatSpan / 2
        val halfLon = ui.cameraLonSpan / 2
        b.include(LatLng(c.latitude - halfLat, c.longitude - halfLon))
        b.include(LatLng(c.latitude + halfLat, c.longitude + halfLon))
        runCatching {
            cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(b.build(), 48))
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    Box(Modifier.fillMaxSize()) {
        Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Маршрутизатор") },
                actions = {
                    if (ui.loadingUser) {
                        CircularProgressIndicator(Modifier.padding(8.dp), strokeWidth = 2.dp)
                    } else {
                        val label = ui.user?.name?.trim()?.takeIf { it.isNotEmpty() }
                            ?: ui.user?.email?.take(12) ?: ""
                        if (label.isNotEmpty()) {
                            Text(label, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(end = 4.dp))
                        }
                    }
                    TextButton(
                        onClick = {
                            if (ui.user != null) showAdd = true else showLogin = true
                        },
                    ) { Text("Добавить") }
                    if (ui.user != null) {
                        TextButton(onClick = { vm.logout() }) { Text("Выйти") }
                    } else {
                        TextButton(onClick = { showLogin = true }) { Text("Войти") }
                    }
                    IconButton(onClick = {
                        serverDraft = MapipConfig.getBaseUrl(ctx)
                        showServer = true
                    }) {
                        Icon(Icons.Default.Settings, contentDescription = "Сервер")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            GoogleMap(
                modifier = Modifier.fillMaxSize(),
                cameraPositionState = cameraPositionState,
                properties = MapProperties(isMyLocationEnabled = fineGranted),
                uiSettings = MapUiSettings(compassEnabled = true, myLocationButtonEnabled = fineGranted),
                onMapClick = { latLng ->
                    when (ui.mapPickTarget) {
                        MapPick.FROM -> vm.setFromPoint(latLng)
                        MapPick.TO -> vm.setToPoint(latLng)
                        null -> {}
                    }
                },
            ) {
                ui.fromPoint?.let { p ->
                    Marker(state = MarkerState(position = p), title = "Старт", icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE))
                }
                ui.toPoint?.let { p ->
                    Marker(state = MarkerState(position = p), title = "Финиш", icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_RED))
                }
                for (o in ui.objects) {
                    val p = LatLng(o.lat, o.lng)
                    Marker(
                        state = MarkerState(position = p),
                        title = o.displayName,
                        snippet = o.address,
                        onClick = {
                            vm.selectObject(o)
                            true
                        },
                    )
                }
                for (op in ui.overpassPoints) {
                    Marker(
                        state = MarkerState(position = LatLng(op.lat, op.lon)),
                        title = op.title,
                        icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_ORANGE),
                    )
                }
                for (line in ui.lines) {
                    Polyline(
                        points = line.points,
                        color = routeColors.getOrElse(line.index) { routeColors.last() },
                        width = if (line.index == 0) 12f else 9f,
                    )
                }
            }

            if (ui.routeSteps.isNotEmpty() || ui.routeSummary != null) {
                Card(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 8.dp, end = 8.dp)
                        .widthIn(max = 300.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)),
                ) {
                    Column(Modifier.padding(10.dp).verticalScroll(rememberScrollState()).height(220.dp)) {
                        if (ui.wheelchairLongWarning) {
                            Text(
                                "Внимание: для коляски маршрут длиннее 7 км или дольше 45 минут.",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFFE65100),
                            )
                            Spacer(Modifier.height(6.dp))
                        }
                        Text("Маршрут", fontWeight = FontWeight.SemiBold)
                        ui.routeSummary?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        ui.routeSteps.take(12).forEach { st ->
                            Row(Modifier.padding(vertical = 2.dp)) {
                                Text(st.text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                                st.distanceM?.takeIf { it > 0 }?.let {
                                    Text("${it.toInt()} м", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }

            Card(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(8.dp),
                elevation = CardDefaults.cardElevation(6.dp),
            ) {
                Column(
                    Modifier
                        .padding(12.dp)
                        .heightIn(max = 320.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    OutlinedTextField(
                        value = ui.fromText,
                        onValueChange = { vm.setFromText(it) },
                        label = { Text("Откуда") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { vm.toggleMapPick(MapPick.FROM) },
                            enabled = !ui.useCurrentLocationAsFrom,
                        ) {
                            Text(if (ui.mapPickTarget == MapPick.FROM) "Тап на карте…" else "На карте")
                        }
                        if (!fineGranted) {
                            OutlinedButton(onClick = { permLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION) }) {
                                Text("Гео")
                            }
                        }
                    }
                    ui.fromSuggestions.take(5).forEach { h ->
                        Text(
                            h.display_name,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { vm.applyFromHit(h) }
                                .padding(vertical = 4.dp),
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = ui.toText,
                        onValueChange = { vm.setToText(it) },
                        label = { Text("Куда") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedButton(onClick = { vm.toggleMapPick(MapPick.TO) }) {
                        Text(if (ui.mapPickTarget == MapPick.TO) "Тап на карте…" else "На карте")
                    }
                    ui.toSuggestions.take(5).forEach { h ->
                        Text(
                            h.display_name,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { vm.applyToHit(h) }
                                .padding(vertical = 4.dp),
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Профиль маршрута", style = MaterialTheme.typography.labelSmall)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = ui.profile == "wheelchair", onClick = { vm.setProfile("wheelchair") }, label = { Text("Коляска") })
                        FilterChip(selected = ui.profile == "foot-walking", onClick = { vm.setProfile("foot-walking") }, label = { Text("Пешком") })
                        FilterChip(selected = ui.profile == "driving-car", onClick = { vm.setProfile("driving-car") }, label = { Text("Авто") })
                    }
                    Text("Вариантов: ${ui.alternatives}", style = MaterialTheme.typography.labelSmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(1, 2, 3).forEach { n ->
                            FilterChip(selected = ui.alternatives == n, onClick = { vm.setAlternatives(n) }, label = { Text("$n") })
                        }
                    }
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Button(
                            onClick = { vm.buildRoute(lastLoc) },
                            modifier = Modifier.weight(1f),
                        ) { Text("Построить") }
                        OutlinedButton(
                            onClick = { vm.startNavigation() },
                            enabled = ui.lines.isNotEmpty(),
                            modifier = Modifier.weight(1f),
                        ) { Text("Навигация") }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = ui.useCurrentLocationAsFrom, onCheckedChange = { vm.setUseCurrentLocationAsFrom(it) })
                        Text("Текущее местоположение для «Откуда»", style = MaterialTheme.typography.bodySmall)
                    }
                    ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    ui.message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    if (ui.routeSteps.isNotEmpty() || ui.routeSummary != null) {
                        HorizontalDivider(Modifier.padding(vertical = 8.dp))
                        Text("Пошагово", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
                        ui.routeSummary?.let { Text(it, style = MaterialTheme.typography.labelSmall) }
                        ui.routeSteps.take(6).forEach { Text("• ${it.text}", style = MaterialTheme.typography.labelSmall) }
                    }
                }
            }
        }
    }

    if (showLogin) {
        ModalBottomSheet(onDismissRequest = { showLogin = false }, sheetState = sheetState) {
            LoginSheetContent(
                onClose = { showLogin = false },
                onLogin = { e, p ->
                    scope.launch {
                        runCatching { vm.login(e, p) }.onSuccess { showLogin = false }
                    }
                },
                onRegister = { name, type, e, p ->
                    scope.launch {
                        runCatching { vm.register(name, type, e, p) }.onSuccess { showLogin = false }
                    }
                },
            )
        }
    }

    if (showServer) {
        AlertDialog(
            onDismissRequest = { showServer = false },
            title = { Text("URL сервера") },
            text = {
                OutlinedTextField(
                    value = serverDraft,
                    onValueChange = { serverDraft = it },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    MapipConfig.setBaseUrl(ctx, serverDraft)
                    showServer = false
                    vm.onBaseUrlChanged()
                }) { Text("Сохранить") }
            },
            dismissButton = {
                TextButton(onClick = { showServer = false }) { Text("Отмена") }
            },
        )
    }

    ui.selectedObject?.let { o ->
        AlertDialog(
            onDismissRequest = { vm.selectObject(null) },
            title = { Text(o.displayName) },
            text = {
                Column {
                    Text("Адрес: ${o.address}")
                    Text("Тип: ${o.type}")
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.applyFromHit(GeocodeHit(o.lat, o.lng, o.displayName))
                    vm.selectObject(null)
                }) { Text("Откуда") }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = {
                        vm.applyToHit(GeocodeHit(o.lat, o.lng, o.displayName))
                        vm.selectObject(null)
                    }) { Text("Куда") }
                    TextButton(onClick = { vm.selectObject(null) }) { Text("Закрыть") }
                }
            },
        )
    }

    if (showAdd && ui.user != null) {
        Dialog(onDismissRequest = { showAdd = false }) {
            Card(Modifier.fillMaxSize().padding(8.dp)) {
                AddObjectScreen(
                    user = ui.user!!,
                    onDismiss = { showAdd = false },
                    onSuccess = {
                        showAdd = false
                        vm.loadObjects()
                    },
                )
            }
        }
    }

    if (ui.navigationRoute.size >= 2) {
        NavigationOverlay(
            route = ui.navigationRoute,
            lastLocation = lastLoc,
            bearing = bearing,
            fineGranted = fineGranted,
            onClose = { vm.stopNavigation() },
        )
    }
    }
}

@Composable
private fun NavigationOverlay(
    route: List<LatLng>,
    lastLocation: LatLng?,
    bearing: Float,
    fineGranted: Boolean,
    onClose: () -> Unit,
) {
    val cameraPositionState = rememberCameraPositionState()
    LaunchedEffect(lastLocation, bearing, route) {
        val target = lastLocation ?: route.first()
        val cam = CameraPosition.builder()
            .target(target)
            .zoom(17f)
            .tilt(50f)
            .bearing(if (fineGranted && bearing != 0f) bearing else 0f)
            .build()
        cameraPositionState.animate(CameraUpdateFactory.newCameraPosition(cam), 400)
    }
    Box(Modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = fineGranted),
        ) {
            if (route.size >= 2) {
                Polyline(points = route, color = Color(0xFF2E7D32), width = 14f)
            }
        }
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.95f))
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Следуйте по зелёной линии.", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            Button(onClick = onClose) { Text("Закрыть") }
        }
    }
}

@Composable
private fun LoginSheetContent(
    onClose: () -> Unit,
    onLogin: (String, String) -> Unit,
    onRegister: (String, Int, String, String) -> Unit,
) {
    var register by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var regEmail by remember { mutableStateOf("") }
    var regPass by remember { mutableStateOf("") }
    var cat by remember { mutableStateOf(0) }
    Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = !register, onClick = { register = false }, label = { Text("Вход") })
            FilterChip(selected = register, onClick = { register = true }, label = { Text("Регистрация") })
        }
        if (register) {
            OutlinedTextField(name, { name = it }, label = { Text("Имя") }, modifier = Modifier.fillMaxWidth())
            Text("Категория доступности", style = MaterialTheme.typography.labelSmall)
            Column {
                listOf("Нарушение слуха" to 0, "Коляска" to 1, "Опорно-двигательный" to 2, "Зрение" to 3, "Умственное развитие" to 4).forEach { (t, v) ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { cat = v }) {
                            RadioButton(selected = cat == v, onClick = { cat = v })
                        Text(t, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            OutlinedTextField(regEmail, { regEmail = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(regPass, { regPass = it }, label = { Text("Пароль") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        } else {
            OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(password, { password = it }, label = { Text("Пароль") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onClose) { Text("Закрыть") }
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    if (register) onRegister(name.trim(), cat, regEmail.trim(), regPass)
                    else onLogin(email.trim(), password)
                },
            ) {
                Text(if (register) "Создать" else "Войти")
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
