/* global L */
'use strict';

// ── POI type catalogue ────────────────────────────────────────────────────────
// Each entry maps to an Overpass tag (key=value).
// Colors are chosen to be visually distinct.
const POI_TYPES = [
  { id: 'restaurant',   label: 'Restaurants',      key: 'amenity',  val: 'restaurant',     color: '#e74c3c', defaultOn: true  },
  { id: 'school',       label: 'Schools',           key: 'amenity',  val: 'school',         color: '#3498db', defaultOn: true  },
  { id: 'atm',          label: 'ATMs',              key: 'amenity',  val: 'atm',            color: '#2ecc71', defaultOn: true  },
  { id: 'cafe',         label: 'Cafés',             key: 'amenity',  val: 'cafe',           color: '#e67e22', defaultOn: false },
  { id: 'hospital',     label: 'Hospitals',         key: 'amenity',  val: 'hospital',       color: '#9b59b6', defaultOn: false },
  { id: 'pharmacy',     label: 'Pharmacies',        key: 'amenity',  val: 'pharmacy',       color: '#1abc9c', defaultOn: false },
  { id: 'supermarket',  label: 'Supermarkets',      key: 'shop',     val: 'supermarket',    color: '#f39c12', defaultOn: false },
  { id: 'park',         label: 'Parks',             key: 'leisure',  val: 'park',           color: '#27ae60', defaultOn: false },
  { id: 'hotel',        label: 'Hotels',            key: 'tourism',  val: 'hotel',          color: '#c0392b', defaultOn: false },
  { id: 'bank',         label: 'Banks',             key: 'amenity',  val: 'bank',           color: '#2980b9', defaultOn: false },
  { id: 'bus_stop',     label: 'Bus Stops',         key: 'highway',  val: 'bus_stop',       color: '#8e44ad', defaultOn: false },
  { id: 'fuel',         label: 'Petrol Stations',   key: 'amenity',  val: 'fuel',           color: '#d35400', defaultOn: false },
  { id: 'gym',          label: 'Gyms',              key: 'leisure',  val: 'fitness_centre', color: '#16a085', defaultOn: false },
  { id: 'post_office',  label: 'Post Offices',      key: 'amenity',  val: 'post_office',    color: '#7f8c8d', defaultOn: false },
  { id: 'kindergarten', label: 'Kindergartens',     key: 'amenity',  val: 'kindergarten',   color: '#fd79a8', defaultOn: false },
  { id: 'library',      label: 'Libraries',         key: 'amenity',  val: 'library',        color: '#6c5ce7', defaultOn: false },
];

// ── Application state ─────────────────────────────────────────────────────────
const state = {
  map:        null,
  center:     null,   // [lat, lon]
  range:      1000,   // metres
  shape:      'circle',
  markers:    [],
  areaLayer:  null,
  centerPin:  null,
  poiCounts:  {},
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const locationInput = document.getElementById('location-input');
const searchBtn     = document.getElementById('search-btn');
const rangeSelect   = document.getElementById('range-select');
const findBtn       = document.getElementById('find-btn');
const statusMsg     = document.getElementById('status-msg');
const legendDiv     = document.getElementById('legend');
const poiListDiv    = document.getElementById('poi-list');

// ── Initialise Leaflet map ────────────────────────────────────────────────────
function initMap() {
  state.map = L.map('map').setView([52.2297, 21.0122], 13); // Warsaw default

  // Use a tile provider suitable for browser apps to avoid OSM referer blocks.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors '
      + '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(state.map);

  // Allow clicking map to pick a location
  state.map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    setCenter(lat, lng);
    showStatus(`Location set to ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 'success');
  });
}

// ── Build POI checkbox list ───────────────────────────────────────────────────
function buildPoiList() {
  poiListDiv.innerHTML = '';
  POI_TYPES.forEach((poi) => {
    const label = document.createElement('label');
    label.className = 'poi-checkbox-label';
    label.innerHTML = `
      <input type="checkbox" value="${poi.id}" ${poi.defaultOn ? 'checked' : ''} />
      <span class="poi-color-dot" style="background:${poi.color}"></span>
      <span>${poi.label}</span>
    `;
    poiListDiv.appendChild(label);
  });
}

// ── Geocode an address with Nominatim ─────────────────────────────────────────
async function searchLocation() {
  const query = locationInput.value.trim();
  if (!query) { showStatus('Please enter a location.', 'error'); return; }

  showStatus('Searching…', 'loading');
  searchBtn.disabled = true;

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
      `&format=json&limit=1&accept-language=en`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    if (!data.length) {
      showStatus('Location not found – try a different search.', 'error');
      return;
    }

    const { lat, lon, display_name } = data[0];
    // Show a shortened version in the input
    locationInput.value = display_name;
    setCenter(parseFloat(lat), parseFloat(lon));
    showStatus(`📍 ${display_name.split(',').slice(0, 2).join(',')}`, 'success');
  } catch (err) {
    showStatus('Geocoding error: ' + err.message, 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

// ── Set map centre and refresh overlay ───────────────────────────────────────
function setCenter(lat, lon) {
  state.center = [lat, lon];
  state.map.setView([lat, lon], 15);
  findBtn.disabled = false;
  drawCenterPin(lat, lon);
  drawArea();
}

// ── Small red pin at the chosen centre ───────────────────────────────────────
function drawCenterPin(lat, lon) {
  if (state.centerPin) {
    state.map.removeLayer(state.centerPin);
  }
  const icon = L.divIcon({
    className: '',
    html: '<div class="center-pin"></div>',
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
  });
  state.centerPin = L.marker([lat, lon], { icon, zIndexOffset: 2000 })
    .bindTooltip('Search centre', { direction: 'top', offset: [0, -10] })
    .addTo(state.map);
}

// ── Draw circle or square overlay ────────────────────────────────────────────
function drawArea() {
  if (state.areaLayer) {
    state.map.removeLayer(state.areaLayer);
    state.areaLayer = null;
  }
  if (!state.center) return;

  const [lat, lon] = state.center;
  const r = state.range;
  const style = {
    color:       '#3498db',
    weight:      2,
    fillColor:   '#3498db',
    fillOpacity: 0.07,
    dashArray:   '6 4',
  };

  if (state.shape === 'circle') {
    state.areaLayer = L.circle([lat, lon], { radius: r, ...style }).addTo(state.map);
  } else {
    const bounds = computeSquareBounds(lat, lon, r);
    state.areaLayer = L.rectangle(bounds, style).addTo(state.map);
    state.map.fitBounds(bounds, { padding: [40, 40] });
  }
}

// Return [[sw_lat, sw_lon], [ne_lat, ne_lon]] for a square with half-side r
function computeSquareBounds(lat, lon, r) {
  const latDelta = r / 111320;
  const lonDelta = r / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lat - latDelta, lon - lonDelta],
    [lat + latDelta, lon + lonDelta],
  ];
}

// ── Build Overpass QL query ───────────────────────────────────────────────────
function buildOverpassQuery(selectedPois, lat, lon, range, shape) {
  let filter;
  if (shape === 'circle') {
    filter = `(around:${range},${lat},${lon})`;
  } else {
    const [[sLat, wLon], [nLat, eLon]] = computeSquareBounds(lat, lon, range);
    // Overpass bounding box format: (south, west, north, east)
    filter = `(${sLat},${wLon},${nLat},${eLon})`;
  }

  const statements = selectedPois
    .map(
      (poi) =>
        `node["${poi.key}"="${poi.val}"]${filter};\n` +
        `  way["${poi.key}"="${poi.val}"]${filter};`
    )
    .join('\n  ');

  return `[out:json][timeout:30];\n(\n  ${statements}\n);\nout center;`;
}

// ── Fetch POIs from Overpass API ──────────────────────────────────────────────
async function fetchPOIs() {
  const checkedIds = [...document.querySelectorAll('#poi-list input:checked')].map(
    (cb) => cb.value
  );
  const selectedPois = POI_TYPES.filter((p) => checkedIds.includes(p.id));

  if (!selectedPois.length) {
    showStatus('Please select at least one POI type.', 'error');
    return;
  }
  if (!state.center) {
    showStatus('Please set a location first.', 'error');
    return;
  }

  showStatus('Fetching POI data…', 'loading');
  findBtn.disabled = true;
  clearMarkers();

  const [lat, lon] = state.center;
  const query = buildOverpassQuery(selectedPois, lat, lon, state.range, state.shape);

  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!resp.ok) throw new Error(`Overpass API returned HTTP ${resp.status}`);
    const data = await resp.json();

    // Reset counts
    state.poiCounts = {};
    selectedPois.forEach((p) => { state.poiCounts[p.id] = 0; });

    data.elements.forEach((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) return;

      // Match element to the first POI type whose tag it satisfies
      const matched = selectedPois.find(
        (poi) => el.tags?.[poi.key] === poi.val
      );
      if (!matched) return;

      addMarker(elLat, elLon, matched, el.tags);
      state.poiCounts[matched.id] += 1;
    });

    const total = Object.values(state.poiCounts).reduce((a, b) => a + b, 0);
    showStatus(`Found ${total} POI${total !== 1 ? 's' : ''}.`, 'success');
    buildLegend(selectedPois);
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  } finally {
    findBtn.disabled = false;
  }
}

// ── Markers ───────────────────────────────────────────────────────────────────
function createPoiIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div class="poi-marker" style="background:${color}"></div>`,
    iconSize:    [16, 16],
    iconAnchor:  [8, 8],
    popupAnchor: [0, -10],
  });
}

function addMarker(lat, lon, poi, tags) {
  const name    = tags?.name || poi.label.replace(/s$/, '');
  const address = [tags?.['addr:street'], tags?.['addr:housenumber']]
    .filter(Boolean)
    .join(' ');

  const popup = `
    <strong>${escapeHtml(name)}</strong>
    <br/><em style="color:#7f8c8d">${poi.label}</em>
    ${address ? `<br/><small>${escapeHtml(address)}</small>` : ''}
  `.trim();

  const marker = L.marker([lat, lon], { icon: createPoiIcon(poi.color) })
    .bindPopup(popup)
    .addTo(state.map);
  state.markers.push(marker);
}

function clearMarkers() {
  state.markers.forEach((m) => state.map.removeLayer(m));
  state.markers = [];
  legendDiv.classList.add('hidden');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Legend ────────────────────────────────────────────────────────────────────
function buildLegend(selectedPois) {
  const activePois = selectedPois.filter((p) => state.poiCounts[p.id] > 0);
  if (!activePois.length) {
    legendDiv.classList.add('hidden');
    return;
  }

  legendDiv.innerHTML = '<h3>Legend</h3>';
  activePois.forEach((poi) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="legend-dot" style="background:${poi.color}"></span>
      <span>${poi.label}</span>
      <span class="legend-count">${state.poiCounts[poi.id]}</span>
    `;
    legendDiv.appendChild(item);
  });

  legendDiv.classList.remove('hidden');
}

// ── Status helper ─────────────────────────────────────────────────────────────
function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className   = `status-msg ${type || ''}`;
}

// ── Event listeners ───────────────────────────────────────────────────────────
searchBtn.addEventListener('click', searchLocation);
locationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchLocation();
});
findBtn.addEventListener('click', fetchPOIs);

rangeSelect.addEventListener('change', () => {
  state.range = parseInt(rangeSelect.value, 10);
  drawArea();
});

document.querySelectorAll('input[name="shape"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    state.shape = radio.value;
    drawArea();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
buildPoiList();
initMap();
