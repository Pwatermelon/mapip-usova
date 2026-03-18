/**
 * Маршрутизатор: отображение маршрутов двумя цветами
 * — с данными о доступности (зелёный)
 * — без данных (оранжевый)
 */

const COLOR_WITH_DATA = '#28a745';
const COLOR_NO_DATA = '#fd7e14';

let map;
let routeLayers = [];

function getApiBase() {
  const path = window.location.pathname;
  if (path.indexOf('/clientapp/') !== -1) return '';
  return '/api';
}

async function loadRoutesWithDataStatus() {
  const base = getApiBase();
  const url = base ? base + '/routes/GetRoutesWithDataStatus' : '/api/routes/GetRoutesWithDataStatus';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Ошибка загрузки маршрутов: ' + res.status);
  return res.json();
}

function drawRoute(route) {
  const listObjects = route.listObjects || route.ListObjects || [];
  if (listObjects.length < 2) return null;

  const points = listObjects.map(o => [o.x ?? o.X, o.y ?? o.Y]);
  const hasData = route.hasAccessibilityData ?? route.HasAccessibilityData === true;
  const color = hasData ? COLOR_WITH_DATA : COLOR_NO_DATA;

  const polyline = L.polyline(points, {
    color: color,
    weight: 5,
    opacity: 0.8
  }).addTo(map);

  polyline.bindPopup(
    'Маршрут #' + route.id + ' (дата: ' + (route.date || route.Date) + '). ' +
    (hasData ? 'Есть данные о доступности (' + (route.objectsCount ?? route.ObjectsCount ?? 0) + ' объектов).' : 'Нет данных о доступности.')
  );
  return polyline;
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
  try {
    const routes = await loadRoutesWithDataStatus();
    routeLayers = [];
    routes.forEach(route => {
      const layer = drawRoute(route);
      if (layer) routeLayers.push(layer);
    });
    if (routeLayers.length > 0) {
      const group = new L.featureGroup(routeLayers);
      map.fitBounds(group.getBounds().pad(0.1));
    }
    renderRoutesList(routes);
  } catch (err) {
    console.error(err);
    document.getElementById('routes-list').innerHTML = '<p style="color:#c00;">Не удалось загрузить маршруты. Проверьте, что API доступен.</p>';
  }
});
