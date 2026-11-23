/* ==========================================
   TAXI LOGBOOK — TAXI-CHIRON-01
   Version 3.2.0
   ========================================== */

"use strict";

/* ---------- AYARLAR ---------- */

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

/* ---------- GENEL ---------- */

function nowISO() {
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("tr-TR");
}

function money(value) {
  return Number(value || 0).toFixed(2) + " €";
}

function getTrips() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
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
      position => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          time: position.timestamp
        });
      },
      error => {
        const messages = {
          1: "Konum izni verilmedi.",
          2: "GPS konumu alınamadı.",
          3: "GPS zaman aşımına uğradı."
        };

        reject(new Error(
          messages[error.code] || "GPS hatası oluştu."
        ));
      },
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
  const rad = value => value * Math.PI / 180;

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

    activeTrip.distanceMeters += meters;
  }

  activeTrip.route.push(point);
  activeTrip.lastPoint = point;

  saveActiveTrip();
  renderActiveTrip();
}

function startGpsTracking() {
  if (!navigator.geolocation || gpsWatcher !== null) return;

  gpsWatcher = navigator.geolocation.watchPosition(
    addGpsPoint,
    error => console.warn("GPS takip hatası:", error.message),
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

/* ---------- VARDİYA ---------- */

async function startShift() {
  const existingShift = getShift();

  if (existingShift?.active) {
    alert("Vardiya zaten açık.");
    return;
  }

  const button = document.getElementById("startShift");

  if (button) button.disabled = true;

  try {
    // Vardiya GPS beklemeden hemen başlar.
    const shift = {
      active: true,
      startTime: nowISO(),
      startPosition: null,
      endTime: null,
      endPosition: null
    };

    saveShift(shift);
    render();

    alert("Vardiya başladı.");

    // GPS konumunu ayrıca almaya çalış.
    getPosition()
      .then(position => {
        const current = getShift();

        if (current?.active) {
          current.startPosition = position;
          saveShift(current);
        }
      })
