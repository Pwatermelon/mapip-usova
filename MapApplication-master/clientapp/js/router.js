/**
 * Маршрутизатор: построение маршрута по двум точкам (OpenRouteService).
 * Раскраска по объектам на маршруте: зелёный — участок рядом с объектами из нашей базы, оранжевый — нет объектов.
 */

const COLOR_WITH_DATA = '#28a745';
const COLOR_NO_DATA = '#fd7e14';
const OBJECT_NEAR_RADIUS_M = 80; // метры: считаем, что объект "на маршруте"

let map;
let routeLayers = [];
let builtRouteSegments = [];
let builtMarkers = [];
let allMapObjects = []; // объекты с карты (для проверки "на маршруте")

function getApiBase() {
  const path = window.location.pathname;
  if (path.indexOf('/clientapp/') !== -1) return '';
  return '';
}

function getRouteBuildUrl() {
  return '/api/routebuild/Build';
}

/** Загрузка объектов карты (для проверки "объекты на маршруте"). */
async function loadMapObjects() {
  const res = await fetch('/GetSocialMapObject');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Расстояние между двумя точками [lat, lon] в метрах (приближённо). */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Есть ли объект из нашей базы в радиусе radiusM от точки [lat, lon]. */
function isPointNearObjects(lat, lon, objects, radiusM) {
  for (const o of objects) {
    const oLat = o.x ?? o.X;
    const oLon = o.y ?? o.Y;
    if (oLat == null || oLon == null) continue;
    if (distanceMeters(lat, lon, oLat, oLon) <= radiusM) return true;
  }
  return false;
}

/**
 * Разбить маршрут (массив [lat, lon]) на сегменты с флагом hasData:
 * сегмент считается "с данными", если его середина рядом с каким-либо объектом из нашей базы.
 */
function getSegmentsWithData(routeCoords, objects, radiusM) {
  const segments = [];
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];
    const midLat = (a[0] + b[0]) / 2;
    const midLon = (a[1] + b[1]) / 2;
    const hasData = isPointNearObjects(midLat, midLon, objects, radiusM);
    segments.push({ coords: [a, b], hasData });
  }
  return segments;
}

/** Отрисовать маршрут по сегментам (зелёный — рядом объекты, оранжевый — нет). */
function drawRouteSegments(segments, popupText) {
  const layers = [];
  segments.forEach((seg, i) => {
    const color = seg.hasData ? COLOR_WITH_DATA : COLOR_NO_DATA;
    const line = L.polyline(seg.coords, { color, weight: 5, opacity: 0.8 });
    if (popupText && i === 0) line.bindPopup(popupText);
    line.addTo(map);
    layers.push(line);
  });
  return layers;
}

/** Геокодирование адреса через Nominatim (OpenStreetMap). */
async function nominatimGeocode(address) {
  const q = encodeURIComponent(address.trim());
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
    { headers: { 'Accept-Language': 'ru' } }
  );
  if (!res.ok) throw new Error('Ошибка геокодирования: ' + res.status);
  const data = await res.json();
  if (!data || data.length === 0) throw new Error('Адрес не найден: ' + address);
  const lat = parseFloat(data[0].lat);
  const lon = parseFloat(data[0].lon);
  return [lat, lon];
}

/** Ответ ORS: LineString / MultiLineString / несколько features → [lat, lon]. */
function orsResponseToLatLngCoords(ors) {
  const out = [];
  const pushRing = (ring) => {
    if (!ring || !ring.length) return;
    for (const c of ring) {
      if (!Array.isArray(c) || c.length < 2) continue;
      out.push([c[1], c[0]]);
    }
  };
  const addGeometry = (g) => {
    if (!g || !g.coordinates) return;
    if (g.type === 'LineString') pushRing(g.coordinates);
    else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates) pushRing(line);
    }
  };
  if (ors && Array.isArray(ors.features)) {
    for (const f of ors.features) addGeometry(f && f.geometry);
  }
  if (out.length < 2 && ors && Array.isArray(ors.routes) && ors.routes[0] && ors.routes[0].geometry) {
    addGeometry(ors.routes[0].geometry);
  }
  return out;
}

/** Построить маршрут через бэкенд (OpenRouteService). */
async function buildRouteFromApi(fromCoord, toCoord, profile) {
  const res = await fetch(getRouteBuildUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromCoord,
      to: toCoord,
      profile: profile || 'foot-walking'
    })
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch (_) {}
    throw new Error(msg || 'Ошибка построения маршрута: ' + res.status);
  }
  return JSON.parse(text);
}

/** Отрисовать построенный маршрут по сегментам (объекты на маршруте — зелёный, иначе оранжевый). */
function drawBuiltRoute(geojsonOrCoordinates, summary) {
  clearBuiltRoute();
  let coords = [];
  if (Array.isArray(geojsonOrCoordinates)) {
    coords = geojsonOrCoordinates.map(c => [c[1], c[0]]);
  } else if (geojsonOrCoordinates && typeof geojsonOrCoordinates === 'object') {
    coords = orsResponseToLatLngCoords(geojsonOrCoordinates);
  }
  if (coords.length < 2) return null;
  const segments = getSegmentsWithData(coords, allMapObjects, OBJECT_NEAR_RADIUS_M);
  builtRouteSegments = drawRouteSegments(segments, null);
  builtMarkers.push(
    L.marker(coords[0]).bindPopup('Начало').addTo(map),
    L.marker(coords[coords.length - 1]).bindPopup('Конец').addTo(map)
  );
  const allPoints = coords;
  const bounds = L.latLngBounds(allPoints);
  map.fitBounds(bounds.pad(0.15));
  return { coords, summary };
}

function clearBuiltRoute() {
  builtRouteSegments.forEach(l => map.removeLayer(l));
  builtRouteSegments = [];
  builtMarkers.forEach(m => map.removeLayer(m));
  builtMarkers = [];
}

async function onBuildRouteClick() {
  const fromInput = document.getElementById('route-from');
  const toInput = document.getElementById('route-to');
  const profileSelect = document.getElementById('route-profile');
  const resultDiv = document.getElementById('route-result');
  const btn = document.getElementById('build-route-btn');
  const fromText = (fromInput && fromInput.value) ? fromInput.value.trim() : '';
  const toText = (toInput && toInput.value) ? toInput.value.trim() : '';
  const profile = (profileSelect && profileSelect.value) || 'foot-walking';
  if (!fromText || !toText) {
    resultDiv.innerHTML = '<p style="color:#c00;">Укажите адрес «Откуда» и «Куда».</p>';
    return;
  }
  btn.disabled = true;
  resultDiv.innerHTML = '<p>Поиск адресов и построение маршрута…</p>';
  try {
    const [fromCoord, toCoord] = await Promise.all([
      nominatimGeocode(fromText),
      nominatimGeocode(toText)
    ]);
    const ors = await buildRouteFromApi(fromCoord, toCoord, profile);
    const features = ors.features || [];
    const summary = (features[0] && features[0].properties && features[0].properties.summary) || {};
    const coords = features[0] && features[0].geometry && features[0].geometry.coordinates;
    if (!coords || coords.length < 2) {
      resultDiv.innerHTML = '<p style="color:#c00;">Маршрут не найден.</p>';
      return;
    }
    drawBuiltRoute(coords, summary);
    const dist = (summary.distance / 1000).toFixed(2);
    const dur = summary.duration != null ? Math.round(summary.duration / 60) : '';
    resultDiv.innerHTML = '<p style="color:#28a745;"><strong>Маршрут построен.</strong> Расстояние: ' + dist + ' км.' + (dur ? ' Время: ~' + dur + ' мин.' : '') + '</p>';
  } catch (err) {
    resultDiv.innerHTML = '<p style="color:#c00;">' + (err.message || err) + '</p>';
  } finally {
    btn.disabled = false;
  }
}

async function loadRoutesWithDataStatus() {
  const url = '/api/routes/GetRoutesWithDataStatus';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Ошибка загрузки маршрутов: ' + res.status);
  return res.json();
}

/** Отрисовать сохранённый маршрут по сегментам: зелёный — участок рядом с объектами на карте, оранжевый — нет. */
function drawRoute(route) {
  const listObjects = route.listObjects || route.ListObjects || [];
  if (listObjects.length < 2) return null;

  const points = listObjects.map(o => [o.x ?? o.X, o.y ?? o.Y]);
  const segments = getSegmentsWithData(points, allMapObjects, OBJECT_NEAR_RADIUS_M);
  const popupText = 'Маршрут #' + route.id + ' (дата: ' + (route.date || route.Date) + '). Зелёный — участок рядом с объектами из базы, оранжевый — нет.';
  return drawRouteSegments(segments, popupText);
}

function renderRoutesList(routes) {
  const container = document.getElementById('routes-list');
  if (!routes || routes.length === 0) {
    container.innerHTML = '<p style="color:#888;">Нет сохранённых маршрутов.</p>';
    return;
  }
  container.innerHTML = '<h3>Список маршрутов</h3><ul style="list-style:none; padding:0;">' +
    routes.map(r => {
      const hasData = r.hasAccessibilityData ?? r.HasAccessibilityData;
      const color = hasData ? COLOR_WITH_DATA : COLOR_NO_DATA;
      return '<li style="margin:8px 0; padding:8px; background:#f5f5f5; border-radius:8px; border-left:4px solid ' + color + '">' +
        'Маршрут #' + r.id + ' — ' + (r.date || r.Date) + ' — ' +
        (hasData ? 'есть данные (' + (r.objectsCount ?? r.ObjectsCount ?? 0) + ' объектов)' : 'нет данных') +
        '</li>';
    }).join('') + '</ul>';
}

function initMap() {
  map = L.map('map').setView([51.533557, 46.034257], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);
}

document.addEventListener('DOMContentLoaded', async function() {
  initMap();
  const buildBtn = document.getElementById('build-route-btn');
  if (buildBtn) buildBtn.addEventListener('click', onBuildRouteClick);

  try {
    allMapObjects = await loadMapObjects();
    const routes = await loadRoutesWithDataStatus();
    routeLayers = [];
    routes.forEach(route => {
      const layers = drawRoute(route);
      if (layers && layers.length) routeLayers.push(...layers);
    });
    if (routeLayers.length > 0) {
      const group = new L.featureGroup(routeLayers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
    renderRoutesList(routes);
  } catch (err) {
    console.error(err);
    const listEl = document.getElementById('routes-list');
    if (listEl) listEl.innerHTML = '<p style="color:#c00;">Не удалось загрузить маршруты. Проверьте, что API доступен.</p>';
  }
});
