/* ==========================================
   TAXI LOGBOOK — TAXI-CHIRON-01
   Version 4.0.0
   ========================================== */

"use strict";

/* ---------- STORAGE ---------- */

const STORAGE_KEY = "taxi_trips";
const SHIFT_KEY = "taxi_shift";
const ACTIVE_TRIP_KEY = "taxi_active_trip";
const PENDING_TRIP_KEY = "taxi_pending_trip";
const DOUBLE_CLICK_MS = 1500;

let activeTrip = null;
let pendingTrip = null;
let gpsWatcher = null;
let lastClickKind = null;
let lastClickTime = 0;

/* ---------- HELPERS ---------- */

function nowISO() {
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-BE");
}

function money(value) {
  return Number(value || 0).toFixed(2) + " €";
}

function getTrips() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveTrips(trips) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

function getShift() {
  try {
    return JSON.parse(localStorage.getItem(SHIFT_KEY) || "null");
  } catch {
    return null;
  }
}

function saveShift(shift) {
  localStorage.setItem(SHIFT_KEY, JSON.stringify(shift));
}

function loadData() {
  try {
    activeTrip = JSON.parse(localStorage.getItem(ACTIVE_TRIP_KEY) || "null");
  } catch {
    activeTrip = null;
  }

  try {
    pendingTrip = JSON.parse(localStorage.getItem(PENDING_TRIP_KEY) || "null");
  } catch {
    pendingTrip = null;
  }
}

function saveActiveTrip() {
  if (activeTrip) {
    localStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(activeTrip));
  } else {
    localStorage.removeItem(ACTIVE_TRIP_KEY);
  }
}

function savePendingTrip() {
  if (pendingTrip) {
    localStorage.setItem(PENDING_TRIP_KEY, JSON.stringify(pendingTrip));
  } else {
    localStorage.removeItem(PENDING_TRIP_KEY);
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

/* ---------- GPS ---------- */

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tarayıcı GPS desteği bulunamadı."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        time: position.timestamp
      }),
      error => reject(new Error("GPS konumu alınamadı: " + error.message)),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
      }
    );
  });
}

function distanceBetween(a, b) {
  const R = 6371000;
  const rad = v => v * Math.PI / 180;

  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);

  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function addGpsPoint(position) {
  if (!activeTrip) return;

  const point = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    time: position.timestamp
  };

  if (point.accuracy > 50) return;

  const previous = activeTrip.lastPoint;

  if (previous) {
    const meters = distanceBetween(previous, point);
    const seconds = (point.time - previous.time) / 1000;

    if (meters < 5) return;
    if (seconds > 0 && meters / seconds > 60) return;

    activeTrip.distanceMeters =
      (activeTrip.distanceMeters || 0) + meters;
  }

  activeTrip.route = activeTrip.route || [];
  activeTrip.route.push(point);
  activeTrip.lastPoint = point;

  saveActiveTrip();
  renderActiveTrip();
}

function startGpsTracking() {
  if (!navigator.geolocation || gpsWatcher !== null) return;

  gpsWatcher = navigator.geolocation.watchPosition(
    addGpsPoint,
    error => console.warn("GPS:", error.message),
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 20000
    }
  );
}

function stopGpsTracking() {
  if (gpsWatcher !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatcher);
  }
  gpsWatcher = null;
}

/* ---------- SHIFT ---------- */

async function startShift() {
  if (getShift()?.active) {
    alert("Vardiya zaten açık.");
    return;
  }

  const button = document.getElementById("startShift");
  if (button) button.disabled = true;

  const shift = {
    active: true,
    startTime: nowISO(),
    startPosition: null,
    endTime: null,
    endPosition: null
  };

  saveShift(shift);
  render();

  if (button) button.disabled = false;

  alert("Vardiya başladı.");

  getPosition()
    .then(position => {
      const current = getShift();
      if (current?.active) {
        current.startPosition = position;
        saveShift(current);
        render();
      }
    })
    .catch(error => console.warn("Vardiya GPS:", error.message));
}

async function endShift() {
  const shift = getShift();

  if (!shift?.active) {
    alert("Aktif vardiya bulunamadı.");
    return;
  }

  if (activeTrip) {
    alert("Önce aktif yolculuğu bitir.");
    return;
  }

  if (!confirm("Vardiyayı bitirmek istiyor musun?")) return;

  shift.active = false;
  shift.endTime = nowISO();

  try {
    shift.endPosition = await getPosition();
  } catch (error) {
    console.warn(error.message);
  }

  saveShift(shift);
  render();

  alert("Vardiya bitti.");
}

/* ---------- TRIP START ---------- */

function startTrip(kind) {
  if (!getShift()?.active) {
    alert("Önce vardiyayı başlat.");
    return;
  }

  if (activeTrip) {
    alert("Önce mevcut yolculuğu bitir.");
    return;
  }

  activeTrip = {
    id: Date.now(),
    kind,
    startTime: nowISO(),
    endTime: null,
    pickup: "GPS",
    dropoff: "GPS",
    startPosition: null,
    endPosition: null,
    distanceMeters: 0,
    route: [],
    lastPoint: null,
    fare: 0
  };

  saveActiveTrip();
  renderActiveTrip();

  getPosition()
    .then(position => {
      if (!activeTrip) return;

      activeTrip.startPosition = position;
      activeTrip.pickup = "GPS";
      activeTrip.route.push({
        lat: position.lat,
        lon: position.lon,
        accuracy: position.accuracy,
        time: position.time
      });
      activeTrip.lastPoint = {
        lat: position.lat,
        lon: position.lon,
        accuracy: position.accuracy,
        time: position.time
      };

      saveActiveTrip();
      renderActiveTrip();
    })
    .catch(error => console.warn("Başlangıç GPS:", error.message));

  startGpsTracking();
  render();

  alert(kind.toUpperCase() + " yolculuğu başladı.");
}

function handleTypeClick(kind) {
  const time = Date.now();

  if (
    lastClickKind === kind &&
    time - lastClickTime <= DOUBLE_CLICK_MS
  ) {
    lastClickKind = null;
    lastClickTime = 0;
    startTrip(kind);
    return;
  }

  lastClickKind = kind;
  lastClickTime = time;

  setTimeout(() => {
    if (lastClickKind === kind && Date.now() - lastClickTime >= DOUBLE_CLICK_MS) {
      lastClickKind = null;
    }
  }, DOUBLE_CLICK_MS + 50);
}

/* ---------- TRIP FINISH ---------- */

async function finishTrip() {
  if (!activeTrip) {
    alert("Aktif yolculuk yok.");
    return;
  }

  stopGpsTracking();

  activeTrip.endTime = nowISO();

  try {
    activeTrip.endPosition = await getPosition();

    const p = activeTrip.endPosition;

    activeTrip.dropoff =
      p.lat.toFixed(5) + ", " + p.lon.toFixed(5);
  } catch (error) {
    console.warn("Bitiş GPS:", error.message);
  }

  activeTrip.lastPoint = null;

  pendingTrip = { ...activeTrip };
  savePendingTrip();

  activeTrip = null;
  saveActiveTrip();

  renderFareCard();
  render();
}

function renderFareCard() {
  const card = document.getElementById("fareCard");
  const details = document.getElementById("tripDetails");

  if (!card || !pendingTrip) return;

  const distanceKm = (pendingTrip.distanceMeters || 0) / 1000;

  details.innerHTML = `
    <p><b>Tür:</b> ${escapeHTML(pendingTrip.kind.toUpperCase())}</p>
    <p><b>Başlangıç:</b> ${formatDate(pendingTrip.startTime)}</p>
    <p><b>Bitiş:</b> ${formatDate(pendingTrip.endTime)}</p>
    <p><b>Alış:</b> ${escapeHTML(pendingTrip.pickup)}</p>
    <p><b>Varış:</b> ${escapeHTML(pendingTrip.dropoff)}</p>
    <p><b>Mesafe:</b> ${distanceKm.toFixed(2)} km</p>
  `;

  card.hidden = false;

  const fareInput = document.getElementById("tripFare");
  if (fareInput) fareInput.value = "";
}

function completeTrip() {
  if (!pendingTrip) return;

  const fareInput = document.getElementById("tripFare");
  const fare = Number(fareInput?.value);

  if (!Number.isFinite(fare) || fare < 0) {
    alert("Geçerli bir ücret gir.");
    return;
  }

  pendingTrip.fare = fare;
  pendingTrip.distanceKm =
    (pendingTrip.distanceMeters || 0) / 1000;

  const trips = getTrips();
  trips.push(pendingTrip);
  saveTrips(trips);

  pendingTrip = null;
  savePendingTrip();

  const card = document.getElementById("fareCard");
  if (card) card.hidden = true;

  render();
  alert("Yolculuk kaydedildi.");
}

function cancelTrip() {
  if (!pendingTrip) return;

  if (!confirm("Bu yolculuk kaydını iptal etmek istiyor musun?")) return;

  pendingTrip = null;
  savePendingTrip();

  const card = document.getElementById("fareCard");
  if (card) card.hidden = true;

  render();
}

/* ---------- UI ---------- */

function renderActiveTrip() {
  const box = document.getElementById("activeTrip");
  const finishButton = document.getElementById("finishTrip");

  if (!box) return;

  if (!activeTrip) {
    box.textContent = "Aktif yolculuk yok";
    if (finishButton) finishButton.disabled = true;
    return;
  }

  const km = (activeTrip.distanceMeters || 0) / 1000;

  box.innerHTML = `
    <strong>${escapeHTML(activeTrip.kind.toUpperCase())} yolculuğu aktif</strong><br>
    Başlangıç: ${formatDate(activeTrip.startTime)}<br>
    Mesafe: ${km.toFixed(2)} km
  `;

  if (finishButton) finishButton.disabled = false;
}

function renderShift() {
  const shift = getShift();
  const status = document.getElementById("shiftStatus");
  const startButton = document.getElementById("startShift");
  const endButton = document.getElementById("endShift");

  if (!status) return;

  if (shift?.active) {
    status.innerHTML =
      "🟢 Vardiya açık · " + escapeHTML(formatDate(shift.startTime));

    if (startButton) startButton.disabled = true;
    if (endButton) endButton.disabled = false;
  } else {
    status.textContent = "Vardiya açık değil";

    if (startButton) startButton.disabled = false;
    if (endButton) endButton.disabled = true;
  }
}

function renderSummary() {
  const trips = getTrips();
  const total = trips.reduce((sum, t) => sum + Number(t.fare || 0), 0);

  const box = document.getElementById("summary");
  if (!box) return;

  box.innerHTML = `
    <strong>${trips.length} yolculuk</strong> ·
    <strong>${money(total)}</strong>
  `;
}

function renderTrips() {
  const tbody = document.getElementById("tripRows");
  if (!tbody) return;

  const trips = getTrips()
    .slice()
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  tbody.innerHTML = "";

  trips.forEach(trip => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHTML(formatDate(trip.startTime))}</td>
      <td>${escapeHTML(trip.kind)}</td>
      <td>${escapeHTML(trip.pickup || "GPS")}</td>
      <td>${escapeHTML(trip.dropoff || "GPS")}</td>
      <td>${Number(trip.distanceKm || 0).toFixed(2)}</td>
      <td>${money(trip.fare)}</td>
      <td><button type="button" class="secondary delete-trip" data-id="${trip.id}">Sil</button></td>
    `;

    tbody.appendChild(tr);
  });
}

function deleteTrip(id) {
  if (!confirm("Bu yolculuk silinsin mi?")) return;

  const trips = getTrips().filter(t => String(t.id) !== String(id));
  saveTrips(trips);
  render();
}

function render() {
  renderShift();
  renderActiveTrip();
  renderSummary();
  renderTrips();
}

/* ---------- BACKUP / RESTORE ---------- */

function backupData() {
  const data = {
    trips: getTrips(),
    shift: getShift(),
    activeTrip,
    pendingTrip,
    exportDate: nowISO()
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "taxi-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();

  URL.revokeObjectURL(url);
}

function restoreData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      let trips = [];

      if (Array.isArray(data)) {
        trips = data;
      } else if (Array.isArray(data.trips)) {
        trips = data.trips;
      } else {
        throw new Error("Yedek dosyası formatı tanınmadı.");
      }

      if (!confirm("Yedek içindeki " + trips.length + " yolculuk kaydı yüklensin mi? Mevcut kayıtlar korunarak birleştirilecek.")) {
        event.target.value = "";
        return;
      }

      // Var olan kayıtları koruyarak birleştir.
      const current = getTrips();
      const map = new Map();

      current.forEach(t => map.set(String(t.id ?? JSON.stringify(t)), t));
      trips.forEach(t => map.set(String(t.id ?? JSON.stringify(t)), t));

      saveTrips(Array.from(map.values()));

      if (!Array.isArray(data)) {
        if (data.shift) saveShift(data.shift);
        if (data.activeTrip) {
          activeTrip = data.activeTrip;
          saveActiveTrip();
        }
        if (data.pendingTrip) {
          pendingTrip = data.pendingTrip;
          savePendingTrip();
        }
      }

      render();
      alert("Yedek geri yüklendi.");
    } catch (error) {
      alert("Yedek dosyası okunamadı: " + error.message);
    }

    event.target.value = "";
  };

  reader.readAsText(file);
}

/* ---------- EVENTS ---------- */

function bindEvents() {
  document.getElementById("startShift")
    ?.addEventListener("click", startShift);

  document.getElementById("endShift")
    ?.addEventListener("click", endShift);

  document.querySelectorAll(".type-btn").forEach(button => {
    button.addEventListener("click", () => {
      handleTypeClick(button.dataset.kind);
    });
  });

  document.getElementById("finishTrip")
    ?.addEventListener("click", finishTrip);

  document.getElementById("completeTrip")
    ?.addEventListener("click", completeTrip);

  document.getElementById("cancelTrip")
    ?.addEventListener("click", cancelTrip);

  document.getElementById("backup")
    ?.addEventListener("click", backupData);

  document.getElementById("restore")
    ?.addEventListener("change", restoreData);

  document.getElementById("tripRows")
    ?.addEventListener("click", event => {
      const button = event.target.closest(".delete-trip");
      if (button) deleteTrip(button.dataset.id);
    });
}

/* ---------- INIT ---------- */

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  bindEvents();
  render();

  if (activeTrip) startGpsTracking();

  if (pendingTrip) renderFareCard();
});
