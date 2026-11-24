/* ==========================================
   TAXI LOGBOOK — TAXI-CHIRON-01
   Version 4.1.0
   GPS + PAUZE + SHIFT HISTORY
   ========================================== */

"use strict";

/* ---------- STORAGE ---------- */

const STORAGE_KEY = "taxi_trips";
const SHIFT_KEY = "taxi_shift";
const ACTIVE_TRIP_KEY = "taxi_active_trip";
const PENDING_TRIP_KEY = "taxi_pending_trip";
const SHIFT_HISTORY_KEY = "taxi_shifts_history";

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

function getShiftHistory() {
  try {
    const data = JSON.parse(
      localStorage.getItem(SHIFT_HISTORY_KEY) || "[]"
    );

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveShiftHistory(history) {
  localStorage.setItem(SHIFT_HISTORY_KEY, JSON.stringify(history));
}

function loadData() {
  try {
    activeTrip = JSON.parse(
      localStorage.getItem(ACTIVE_TRIP_KEY) || "null"
    );
  } catch {
    activeTrip = null;
  }

  try {
    pendingTrip = JSON.parse(
      localStorage.getItem(PENDING_TRIP_KEY) || "null"
    );
  } catch {
    pendingTrip = null;
  }
}

function saveActiveTrip() {
  if (activeTrip) {
    localStorage.setItem(
      ACTIVE_TRIP_KEY,
      JSON.stringify(activeTrip)
    );
  } else {
    localStorage.removeItem(ACTIVE_TRIP_KEY);
  }
}

function savePendingTrip() {
  if (pendingTrip) {
    localStorage.setItem(
      PENDING_TRIP_KEY,
      JSON.stringify(pendingTrip)
    );
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
      error => reject(
        new Error("GPS konumu alınamadı: " + error.message)
      ),
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

  return 2 * R * Math.atan2(
    Math.sqrt(x),
    Math.sqrt(1 - x)
  );
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
    id: Date.now(),
    active: true,
    startTime: nowISO(),
    startPosition: null,
    endTime: null,
    endPosition: null,
    pauses: [],
    pauseActive: false
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

/* ---------- PAUSE / PAUZE ---------- */

function togglePause() {
  const shift = getShift();

  if (!shift?.active) {
    alert("Önce vardiyayı başlat.");
    return;
  }

  if (activeTrip) {
    alert("Pauze başlatmadan önce aktif yolculuğu bitir.");
    return;
  }

  shift.pauses = Array.isArray(shift.pauses)
    ? shift.pauses
    : [];

  const time = nowISO();

  if (shift.pauseActive) {
    // PAUZE BİTİR
    const openPause = shift.pauses.find(p => !p.endTime);

    if (openPause) {
      openPause.endTime = time;
    }

    shift.pauseActive = false;

    saveShift(shift);
    render();

    alert("Pauze bitti. Vardiya devam ediyor.");
  } else {
    // PAUZE BAŞLAT
    shift.pauses.push({
      startTime: time,
      endTime: null
    });

    shift.pauseActive = true;

    saveShift(shift);
    render();

    alert("Pauze başladı.");
  }
}

/* ---------- END SHIFT ---------- */

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

  if (!confirm("Vardiyayı bitirmek istiyor musun?")) {
    return;
  }

  const endTime = nowISO();

  // Açık pauze varsa otomatik kapat
  if (shift.pauseActive) {
    const openPause = (shift.pauses || []).find(p => !p.endTime);

    if (openPause) {
      openPause.endTime = endTime;
    }

    shift.pauseActive = false;
  }

  shift.active = false;
  shift.endTime = endTime;

  try {
    shift.endPosition = await getPosition();
  } catch (error) {
    console.warn("Vardiya bitiş GPS:", error.message);
  }

  // Vardiya arşivi
  const history = getShiftHistory();

  // Aynı vardiyanın iki kez kaydedilmesini önle
  const shiftId = shift.id || shift.startTime;

  const exists = history.some(s =>
    String(s.id || s.startTime) === String(shiftId)
  );

  if (!exists) {
    history.push({
      ...shift,
      id: shiftId
    });

    saveShiftHistory(history);
  }

  // Son vardiyayı eski sistemle uyumluluk için sakla
  saveShift(shift);

  render();

  alert("Vardiya bitti ve arşive kaydedildi.");
}

/* ---------- TRIP START ---------- */

function startTrip(kind) {
  const shift = getShift();

  if (!shift?.active) {
    alert("Önce vardiyayı başlat.");
    return;
  }

  if (shift.pauseActive) {
    alert("Pauze sırasında yolculuk başlatamazsın. Önce pauzeyi bitir.");
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
    if (
      lastClickKind === kind &&
      Date.now() - lastClickTime >= DOUBLE_CLICK_MS
    ) {
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

  pendingTrip = { ...
