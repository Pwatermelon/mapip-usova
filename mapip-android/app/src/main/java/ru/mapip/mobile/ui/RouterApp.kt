package ru.mapip.mobile.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.Logout
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
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import org.osmdroid.views.overlay.mylocation.GpsMyLocationProvider
import org.osmdroid.views.overlay.mylocation.MyLocationNewOverlay
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
    val coarseGranted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val locationGranted = fineGranted || coarseGranted
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) { /* fused starts in DisposableEffect */ }
    }

    Configuration.getInstance().userAgentValue = ctx.packageName
    var lastLoc by remember { mutableStateOf<GeoPoint?>(null) }
    var centeredOnMyLocation by remember { mutableStateOf(false) }
    var bearing by remember { mutableFloatStateOf(0f) }
    val locationManager = remember { ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager }
    val mapView = remember {
        MapView(ctx).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(12.0)
            controller.setCenter(GeoPoint(51.533557, 46.034257))
        }
    }
    DisposableEffect(Unit) {
        onDispose { mapView.onDetach() }
    }

    DisposableEffect(ui.useCurrentLocationAsFrom, ui.navigationRoute.isNotEmpty(), fineGranted) {
        if (!locationGranted) {
            return@DisposableEffect onDispose { }
        }
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                lastLoc = GeoPoint(location.latitude, location.longitude)
                if (location.hasBearing()) bearing = location.bearing
            }
        }
        runCatching {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 2f, listener)
            }
        }
        runCatching {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 1500L, 5f, listener)
            }
        }
        onDispose { locationManager.removeUpdates(listener) }
    }

    LaunchedEffect(Unit) {
        if (!locationGranted) {
            permLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            return@LaunchedEffect
        }
        val known = locationManager.allProviders
            .mapNotNull { p -> runCatching { locationManager.getLastKnownLocation(p) }.getOrNull() }
            .maxByOrNull { it.time }
        if (known != null) {
            lastLoc = GeoPoint(known.latitude, known.longitude)
            if (!centeredOnMyLocation) {
                mapView.controller.animateTo(lastLoc)
                mapView.controller.setZoom(16.0)
                centeredOnMyLocation = true
            }
        }
    }

    LaunchedEffect(ui.cameraCenter, ui.cameraLatSpan, ui.cameraLonSpan) {
        val c = ui.cameraCenter ?: return@LaunchedEffect
        val halfLat = ui.cameraLatSpan / 2
        val halfLon = ui.cameraLonSpan / 2
        runCatching {
            mapView.zoomToBoundingBox(
                BoundingBox(
                    c.latitude + halfLat,
                    c.longitude + halfLon,
                    c.latitude - halfLat,
                    c.longitude - halfLon,
                ),
                true,
                48,
            )
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    Box(Modifier.fillMaxSize()) {
        Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Маршрутизатор",
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                actions = {
                    if (ui.loadingUser) {
                        CircularProgressIndicator(Modifier.padding(8.dp), strokeWidth = 2.dp)
                    }
                    IconButton(
                        onClick = {
                            if (ui.user != null) showAdd = true else showLogin = true
                        },
                    ) { Icon(Icons.Default.Add, contentDescription = "Добавить") }
                    if (ui.user != null) {
                        IconButton(onClick = { vm.logout() }) { Icon(Icons.Default.Logout, contentDescription = "Выйти") }
                    } else {
                        IconButton(onClick = { showLogin = true }) { Icon(Icons.Default.Login, contentDescription = "Войти") }
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
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { mapView },
                update = { map ->
                    val startIcon = circleDrawable(ctx, 24, Color(0xFF1976D2))
                    val finishIcon = circleDrawable(ctx, 24, Color(0xFFD32F2F))
                    val objectIcon = circleDrawable(ctx, 18, Color(0xFF7B1FA2))
                    val overpassIcon = circleDrawable(ctx, 16, Color(0xFFFF9800))
                    val currentLocIcon = circleDrawable(ctx, 16, Color(0xFF00ACC1))
                    map.overlays.clear()
                    if (locationGranted) {
                        val myLocationOverlay = MyLocationNewOverlay(GpsMyLocationProvider(ctx), map).apply {
                            enableMyLocation()
                            enableFollowLocation()
                            isDrawAccuracyEnabled = true
                        }
                        map.overlays.add(myLocationOverlay)
                    }
                    map.overlays.add(
                        MapEventsOverlay(
                            object : MapEventsReceiver {
                                override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                                    when (ui.mapPickTarget) {
                                        MapPick.FROM -> vm.setFromPoint(p)
                                        MapPick.TO -> vm.setToPoint(p)
                                        null -> {}
                                    }
                                    return true
                                }

                                override fun longPressHelper(p: GeoPoint): Boolean = false
                            },
                        ),
                    )
                    lastLoc?.let { p ->
                        map.overlays.add(
                            Marker(map).apply {
                                position = p
                                title = "Текущее местоположение"
                                icon = currentLocIcon
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                            },
                        )
                        if (!centeredOnMyLocation) {
                            map.controller.animateTo(p)
                            map.controller.setZoom(16.0)
                            centeredOnMyLocation = true
                        }
                    }
                    ui.fromPoint?.let { p ->
                        map.overlays.add(
                            Marker(map).apply {
                                position = p
                                title = "Старт"
                                icon = startIcon
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                            },
                        )
                    }
                    ui.toPoint?.let { p ->
                        map.overlays.add(
                            Marker(map).apply {
                                position = p
                                title = "Финиш"
                                icon = finishIcon
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                            },
                        )
                    }
                    for (o in ui.objects) {
                        map.overlays.add(
                            Marker(map).apply {
                                position = GeoPoint(o.lat, o.lng)
                                title = o.displayName
                                snippet = o.address
                                icon = objectIcon
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                                setOnMarkerClickListener { _, _ ->
                                    vm.selectObject(o)
                                    true
                                }
                            },
                        )
                    }
                    for (op in ui.overpassPoints) {
                        map.overlays.add(
                            Marker(map).apply {
                                position = GeoPoint(op.lat, op.lon)
                                title = op.title
                                icon = overpassIcon
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                            },
                        )
                    }
                    for (line in ui.lines) {
                        map.overlays.add(
                            Polyline().apply {
                                setPoints(line.points)
                                color = routeColors.getOrElse(line.index) { routeColors.last() }.toArgb()
                                width = if (line.index == 0) 12f else 9f
                            },
                        )
                    }
                    map.invalidate()
                },
            )

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
                    }
                    ui.fromSuggestions.take(5).forEach { h ->
                        Text(
                            h.displayName,
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
                            h.displayName,
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
                        Checkbox(
                            checked = ui.useCurrentLocationAsFrom,
                            onCheckedChange = {
                                if (it && !fineGranted) permLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                                vm.setUseCurrentLocationAsFrom(it)
                            },
                        )
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
    route: List<GeoPoint>,
    lastLocation: GeoPoint?,
    bearing: Float,
    fineGranted: Boolean,
    onClose: () -> Unit,
) {
    val ctx = LocalContext.current
    Configuration.getInstance().userAgentValue = ctx.packageName
    val mapView = remember {
        MapView(ctx).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(17.0)
        }
    }
    DisposableEffect(Unit) { onDispose { mapView.onDetach() } }
    LaunchedEffect(lastLocation, bearing, route, fineGranted) {
        mapView.overlays.clear()
        mapView.overlays.add(
            Polyline().apply {
                setPoints(route)
                color = Color(0xFF2E7D32).toArgb()
                width = 14f
            },
        )
        val target = lastLocation ?: route.first()
        mapView.controller.animateTo(target)
        if (fineGranted && bearing != 0f) mapView.mapOrientation = bearing
        mapView.invalidate()
    }
    Box(Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { mapView },
        )
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

private fun circleBitmap(sizeDp: Int, color: Color): Bitmap {
    val px = (sizeDp * 2.2f).roundToInt().coerceAtLeast(12)
    val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color.toArgb()
        style = Paint.Style.FILL
    }
    canvas.drawCircle(px / 2f, px / 2f, px / 2f, paint)
    return bitmap
}

private fun circleDrawable(ctx: Context, sizeDp: Int, color: Color): Drawable =
    BitmapDrawable(ctx.resources, circleBitmap(sizeDp, color))
