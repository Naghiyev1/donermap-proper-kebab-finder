
const APP_VERSION = "1.0";

const STORAGE = {
  notes: "donermap_notes_v1",
  favs: "donermap_favs_v1",
  last: "donermap_last_location_v1"
};

const state = {
  map: null,
  markers: [],
  places: [],
  selected: null,
  userLocation: null,
  loading: false,
  radius: 1800,
  queryCenter: null,
  filter: "all"
};

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
const round = (n,d=0) => Number.isFinite(Number(n)) ? Number(n).toFixed(d).replace(/\.0$/,"") : "—";
function safeParse(k,f){ try { const r=localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch { return f; } }
function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function notes(){ return safeParse(STORAGE.notes, {}); }
function favs(){ return new Set(safeParse(STORAGE.favs, [])); }
function setFavs(s){ saveJSON(STORAGE.favs, [...s]); }
function placeKey(p){ return `${p.osmType}-${p.osmId}`; }

function boot(){
  renderShell();
  initMap();
  registerSW();
}

function renderShell(){
  $("#app").innerHTML = `
    <div class="app-shell">
      <aside class="panel">
        <header class="brand">
          <div class="logo">🥙</div>
          <div>
            <strong>DonerMap</strong>
            <span>Find kebab. Judge meat yourself. Remember the good ones. · v${APP_VERSION}</span>
          </div>
        </header>

        <section class="hero-card">
          <h1>Find nearby kebab places.</h1>
          <p>Then keep your own truth file: proper stacked meat, pressed/minced, good bread, avoid, or worth returning.</p>
          <div class="actions">
            <button class="primary" data-action="locate">Use my location</button>
            <button data-action="searchHere">Search map area</button>
          </div>
        </section>

        <section class="control-card">
          <label>
            <span>Search radius</span>
            <select id="radiusInput">
              <option value="800">800 m</option>
              <option value="1500">1.5 km</option>
              <option value="2500" selected>2.5 km</option>
              <option value="5000">5 km</option>
            </select>
          </label>
          <label>
            <span>Filter</span>
            <select id="filterInput">
              <option value="all">All found places</option>
              <option value="favs">Saved only</option>
              <option value="proper">Marked proper meat</option>
              <option value="avoid">Avoid list</option>
            </select>
          </label>
        </section>

        <section class="truth-card">
          <strong>Reality check</strong>
          <p>No map database reliably knows whether the meat is proper stacked döner or pressed/minced cone. This app finds candidates. Your notes make it accurate.</p>
        </section>

        <section id="results" class="results">
          ${emptyResults()}
        </section>
      </aside>

      <main class="map-wrap">
        <div id="map"></div>
        <div class="map-hint">Use location or click “Search map area”. Tap a result for directions and notes.</div>
      </main>
    </div>
  `;

  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
}

function emptyResults(){
  return `<div class="empty">
    <div class="big">No search yet</div>
    <p>Use your location or move the map and search the current area.</p>
  </div>`;
}

function initMap(){
  const last = safeParse(STORAGE.last, { lat: 41.3874, lon: 2.1686, zoom: 13 });
  state.queryCenter = { lat: last.lat, lon: last.lon };
  state.map = L.map("map", { zoomControl: false, worldCopyJump: true }).setView([last.lat, last.lon], last.zoom || 13);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  }).addTo(state.map);

  state.map.on("moveend", () => {
    const c = state.map.getCenter();
    saveJSON(STORAGE.last, { lat: c.lat, lon: c.lng, zoom: state.map.getZoom() });
  });
}

async function locate(){
  renderLoading("Finding your location…");
  if(!navigator.geolocation){
    renderError("Location is not available in this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude } = pos.coords;
    state.userLocation = { lat: latitude, lon: longitude };
    state.queryCenter = { lat: latitude, lon: longitude };
    state.map.setView([latitude, longitude], 15);
    L.circleMarker([latitude, longitude], {
      radius: 8,
      color: "#22c55e",
      fillColor: "#22c55e",
      fillOpacity: .9
    }).addTo(state.map).bindPopup("You are here");
    await searchNearby(latitude, longitude);
  }, err => {
    renderError("Location permission failed. Move the map to your area and use “Search map area”.");
  }, { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
}

async function searchHere(){
  const c = state.map.getCenter();
  state.queryCenter = { lat: c.lat, lon: c.lng };
  await searchNearby(c.lat, c.lng);
}

async function searchNearby(lat, lon){
  state.loading = true;
  renderLoading("Searching kebab places nearby…");
  clearMarkers();

  const radius = Number($("#radiusInput")?.value || state.radius || 2500);
  state.radius = radius;

  const query = `
    [out:json][timeout:18];
    (
      node(around:${radius},${lat},${lon})["amenity"~"restaurant|fast_food"]["cuisine"~"kebab|turkish|shawarma|doner|middle_eastern",i];
      way(around:${radius},${lat},${lon})["amenity"~"restaurant|fast_food"]["cuisine"~"kebab|turkish|shawarma|doner|middle_eastern",i];
      relation(around:${radius},${lat},${lon})["amenity"~"restaurant|fast_food"]["cuisine"~"kebab|turkish|shawarma|doner|middle_eastern",i];

      node(around:${radius},${lat},${lon})["name"~"kebab|kebap|doner|döner|shawarma|dürüm|durum|turk|turkish",i];
      way(around:${radius},${lat},${lon})["name"~"kebab|kebap|doner|döner|shawarma|dürüm|durum|turk|turkish",i];
      relation(around:${radius},${lat},${lon})["name"~"kebab|kebap|doner|döner|shawarma|dürüm|durum|turk|turkish",i];
    );
    out center tags 80;
  `.trim();

  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
      headers: { "Content-Type": "text/plain;charset=UTF-8" }
    });
    if(!r.ok) throw new Error("Overpass search failed");
    const j = await r.json();
    const places = normalizePlaces(j.elements || [], lat, lon);
    state.places = places.sort((a,b) => a.distance - b.distance);
    renderResults();
    addMarkers();
  } catch(err){
    renderError("Search failed. OpenStreetMap/Overpass may be busy. Try again or reduce the radius.");
  } finally {
    state.loading = false;
  }
}

function normalizePlaces(elements, lat, lon){
  const seen = new Set();
  return elements.map(el => {
    const pLat = el.lat ?? el.center?.lat;
    const pLon = el.lon ?? el.center?.lon;
    if(!pLat || !pLon) return null;
    const tags = el.tags || {};
    const p = {
      osmType: el.type,
      osmId: el.id,
      name: tags.name || "Unnamed kebab place",
      lat: Number(pLat),
      lon: Number(pLon),
      cuisine: tags.cuisine || "kebab / food",
      amenity: tags.amenity || "",
      opening: tags.opening_hours || "",
      phone: tags.phone || tags["contact:phone"] || "",
      website: tags.website || tags["contact:website"] || "",
      distance: distanceMeters(lat, lon, Number(pLat), Number(pLon)),
      tags
    };
    const key = `${p.name}-${round(p.lat,5)}-${round(p.lon,5)}`;
    if(seen.has(key)) return null;
    seen.add(key);
    return p;
  }).filter(Boolean);
}

function distanceMeters(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function renderLoading(text){
  $("#results").innerHTML = `<div class="loading"><div class="loader"></div><h2>${esc(text)}</h2><p>Looking for places tagged as kebab, döner, shawarma, Turkish or Middle Eastern.</p></div>`;
}

function renderError(text){
  $("#results").innerHTML = `<div class="error"><strong>Could not search.</strong><p>${esc(text)}</p></div>`;
}

function filteredPlaces(){
  const ns = notes();
  const fs = favs();
  const f = state.filter;
  return state.places.filter(p => {
    const key = placeKey(p);
    const n = ns[key] || {};
    if(f === "favs") return fs.has(key);
    if(f === "proper") return n.verdict === "proper";
    if(f === "avoid") return n.verdict === "avoid";
    return true;
  });
}

function renderResults(){
  const list = filteredPlaces();
  if(!state.places.length){
    $("#results").innerHTML = `<div class="empty"><div class="big">Nothing found</div><p>Try a bigger radius or search a denser area. OSM tags can be incomplete.</p></div>`;
    return;
  }

  $("#results").innerHTML = `
    <div class="results-head">
      <div>
        <div class="eyebrow">Results</div>
        <h2>${list.length} shown · ${state.places.length} found</h2>
      </div>
      <button data-action="searchHere">Refresh</button>
    </div>
    <div class="place-list">
      ${list.map(placeCard).join("")}
    </div>
  `;
}

function placeCard(p){
  const key = placeKey(p);
  const n = notes()[key] || {};
  const saved = favs().has(key);
  const verdict = verdictLabel(n.verdict);
  return `<article class="place-card" data-action="selectPlace" data-key="${esc(key)}">
    <div class="place-top">
      <div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.cuisine)} · ${distanceLabel(p.distance)}</p>
      </div>
      <span class="fav">${saved ? "★" : ""}</span>
    </div>
    <div class="verdict ${n.verdict || "unknown"}">${esc(verdict)}</div>
    ${n.note ? `<p class="user-note">${esc(n.note)}</p>` : ""}
    <div class="place-actions">
      <button data-action="directions" data-key="${esc(key)}">Walk there</button>
      <button data-action="toggleFav" data-key="${esc(key)}">${saved ? "Saved" : "Save"}</button>
      <button data-action="openNotes" data-key="${esc(key)}">Notes</button>
    </div>
  </article>`;
}

function distanceLabel(m){
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`;
}

function verdictLabel(v){
  if(v === "proper") return "Marked: proper stacked meat";
  if(v === "pressed") return "Marked: probably pressed/minced";
  if(v === "good") return "Marked: good overall";
  if(v === "avoid") return "Marked: avoid";
  return "Not judged yet";
}

function addMarkers(){
  clearMarkers();
  for(const p of filteredPlaces()){
    const key = placeKey(p);
    const n = notes()[key] || {};
    const color = n.verdict === "proper" ? "#22c55e" : n.verdict === "avoid" ? "#ef4444" : "#f59e0b";
    const marker = L.circleMarker([p.lat,p.lon], {
      radius: 8,
      color,
      fillColor: color,
      fillOpacity: .92,
      weight: 2
    }).addTo(state.map);
    marker.bindPopup(`<strong>${esc(p.name)}</strong><br>${distanceLabel(p.distance)}<br>${esc(verdictLabel(n.verdict))}`);
    marker.on("click", () => selectPlace(key));
    state.markers.push(marker);
  }
}

function clearMarkers(){
  for(const m of state.markers) state.map.removeLayer(m);
  state.markers = [];
}

function placeByKey(key){
  return state.places.find(p => placeKey(p) === key);
}

function selectPlace(key){
  const p = placeByKey(key);
  if(!p) return;
  state.selected = p;
  state.map.setView([p.lat,p.lon], Math.max(state.map.getZoom(), 17), { animate: true });
  renderDrawer(p);
}

function renderDrawer(p){
  const key = placeKey(p);
  const n = notes()[key] || {};
  const saved = favs().has(key);

  const drawer = document.createElement("div");
  drawer.className = "drawer";
  drawer.innerHTML = `
    <div class="drawer-head">
      <div>
        <div class="eyebrow">Kebab candidate</div>
        <h2>${esc(p.name)}</h2>
        <p>${esc(p.cuisine)} · ${distanceLabel(p.distance)}</p>
      </div>
      <button class="close" data-action="closeDrawer">×</button>
    </div>

    <div class="drawer-actions">
      <button class="primary" data-action="directions" data-key="${esc(key)}">Walk there</button>
      <button data-action="toggleFav" data-key="${esc(key)}">${saved ? "Saved ★" : "Save"}</button>
    </div>

    <label class="field">
      <span>Your meat verdict</span>
      <select id="verdictInput">
        <option value="" ${!n.verdict ? "selected" : ""}>Not judged yet</option>
        <option value="proper" ${n.verdict === "proper" ? "selected" : ""}>Proper stacked meat</option>
        <option value="pressed" ${n.verdict === "pressed" ? "selected" : ""}>Probably pressed/minced</option>
        <option value="good" ${n.verdict === "good" ? "selected" : ""}>Good overall</option>
        <option value="avoid" ${n.verdict === "avoid" ? "selected" : ""}>Avoid</option>
      </select>
    </label>

    <label class="field">
      <span>Your notes</span>
      <textarea id="noteInput" placeholder="Meat, bread, sauce, queue, price, vibe...">${esc(n.note || "")}</textarea>
    </label>

    <div class="tag-row">
      ${noteTag("real-lamb", "real lamb", n)}
      ${noteTag("stacked", "stacked meat", n)}
      ${noteTag("pressed", "pressed cone", n)}
      ${noteTag("good-bread", "good bread", n)}
      ${noteTag("bad-sauce", "bad sauce", n)}
      ${noteTag("late-night", "late-night safe", n)}
    </div>

    <button class="primary full" data-action="saveNotes" data-key="${esc(key)}">Save verdict</button>

    <div class="source-box">
      <strong>OSM data</strong>
      <p>${esc(p.amenity || "food")} · ${esc(p.opening || "opening hours unknown")}</p>
      ${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">Website</a>` : ""}
    </div>
  `;

  document.querySelector(".drawer")?.remove();
  document.body.appendChild(drawer);
}

function noteTag(id, label, n){
  const tags = new Set(n.tags || []);
  return `<button class="note-tag ${tags.has(id) ? "active" : ""}" data-action="toggleNoteTag" data-tag="${esc(id)}">${esc(label)}</button>`;
}

function openDirections(key){
  const p = placeByKey(key);
  if(!p) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const apple = `http://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=w`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`;
  window.open(isIOS ? apple : google, "_blank");
}

function toggleFav(key){
  const s = favs();
  s.has(key) ? s.delete(key) : s.add(key);
  setFavs(s);
  renderResults();
  addMarkers();
  if(state.selected && placeKey(state.selected) === key) renderDrawer(state.selected);
}

function saveNotes(key){
  const all = notes();
  const current = all[key] || {};
  const verdict = $("#verdictInput")?.value || "";
  const note = $("#noteInput")?.value || "";
  all[key] = { ...current, verdict, note, updatedAt: new Date().toISOString() };
  saveJSON(STORAGE.notes, all);
  renderResults();
  addMarkers();
  document.querySelector(".drawer")?.remove();
}

function toggleNoteTag(tag){
  const p = state.selected;
  if(!p) return;
  const key = placeKey(p);
  const all = notes();
  const n = all[key] || {};
  const tags = new Set(n.tags || []);
  tags.has(tag) ? tags.delete(tag) : tags.add(tag);
  all[key] = { ...n, tags: [...tags], updatedAt: new Date().toISOString() };
  saveJSON(STORAGE.notes, all);
  renderDrawer(p);
}

function handleClick(e){
  const action = e.target.closest("[data-action]");
  if(!action) return;
  const a = action.dataset.action;

  if(a === "locate") locate();
  if(a === "searchHere") searchHere();
  if(a === "selectPlace") selectPlace(action.dataset.key);
  if(a === "directions") openDirections(action.dataset.key);
  if(a === "toggleFav") toggleFav(action.dataset.key);
  if(a === "openNotes") selectPlace(action.dataset.key);
  if(a === "closeDrawer") document.querySelector(".drawer")?.remove();
  if(a === "saveNotes") saveNotes(action.dataset.key);
  if(a === "toggleNoteTag") toggleNoteTag(action.dataset.tag);
}

function handleChange(e){
  if(e.target.id === "radiusInput"){
    state.radius = Number(e.target.value);
  }
  if(e.target.id === "filterInput"){
    state.filter = e.target.value;
    renderResults();
    addMarkers();
  }
}

function registerSW(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }
}

document.addEventListener("DOMContentLoaded", boot);
