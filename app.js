/* ==========================================
   TAXI LOGBOOK — TAXI-CHIRON-01
   Version 3.1.0
   ========================================== */

"use strict";

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
          1: "Konum izni verilmedi. Tarayıcı ayarlarından konum izni ver.",
          2: "GPS konumu alınamadı. Telefonun konum servislerini kontrol et.",
          3: "GPS zaman aşımına uğradı. Tekrar dene."
        };

        reject(
          new Error(messages[error.code] || "GPS hatası oluştu.")
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
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
    error => {
      console.warn("GPS takip hatası:", error.message);
    },
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
    const position = await getPosition();

    const shift = {
      active: true,
      startTime: nowISO(),
      startPosition: position,
      endTime: null,
      endPosition: null
    };

    saveShift(shift);

    render();

    alert("Vardiya başarıyla başlatıldı.");

  } catch (error) {
    alert(error.message);

  } finally {
    if (button) button.disabled = false;
  }
}

async function endShift() {
  const shift = getShift();

  if (!shift || !shift.active) {
    alert("Açık vardiya bulunamadı.");
    return;
  }

  if (activeTrip) {
    alert("Önce devam eden yolculuğu bitir.");
    return;
  }

  if (pendingTrip) {
    alert("Önce yolculuk ücretini kaydet.");
    return;
  }

  const button = document.getElementById("endShift");

  if (button) button.disabled = true;

  try {
    const position = await getPosition();

    shift.active = false;
    shift.endTime = nowISO();
    shift.endPosition = position;

    saveShift(shift);

    render();

    alert("Vardiya başarıyla bitirildi.");

  } catch (error) {
    alert(error.message);

  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- YOLCULUK BAŞLAT ---------- */

async function beginTrip(kind) {
  if (!["uber", "bolt", "normal"].includes(kind)) {
    alert("Geçersiz yolculuk türü.");
    return;
  }

  if (!getShift()?.active) {
    alert("Önce vardiyayı başlatmalısın.");
    return;
  }

  if (activeTrip || pendingTrip) {
    alert("Önce mevcut yolculuğu tamamla.");
    return;
  }

  const button = document.querySelector(
    `.type-btn[data-kind="${kind}"]`
  );

  if (button) button.disabled = true;

  try {
    const position = await getPosition();

    activeTrip = {
      id: Date.now(),
      type: kind,
      startTime: nowISO(),
      endTime: null,
      startPosition: position,
      endPosition: null,
      distanceMeters: 0,
      route: [],
      lastPoint: null
    };

    addGpsPoint({
      coords: {
        latitude: position.lat,
        longitude: position.lon,
        accuracy: position.accuracy
      },
      timestamp: position.time
    });

    saveActiveTrip();

    startGpsTracking();

    render();

    alert(
      kind.toUpperCase() + " yolculuğu başlatıldı."
    );

  } catch (error) {
    alert(error.message);

  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- ÇİFT TIKLAMA ---------- */

function requestTripStart(kind) {
  if (activeTrip || pendingTrip) {
    alert("Önce mevcut yolculuğu tamamla.");
    return;
  }

  const time = Date.now();

  if (
    lastClickKind === kind &&
    time - lastClickTime <= DOUBLE_CLICK_MS
  ) {
    lastClickKind = null;
    lastClickTime = 0;

    beginTrip(kind);
    return;
  }

  lastClickKind = kind;
  lastClickTime = time;

  const box = document.getElementById("activeTrip");

  if (box) {
    box.textContent =
      kind.toUpperCase() +
      " seçildi. Başlatmak için aynı butona tekrar bas.";
  }
}

/* ---------- YOLCULUK BİTİR ---------- */

async function finishTrip() {
  if (!activeTrip) {
    alert("Aktif yolculuk yok.");
    return;
  }

  const button = document.getElementById("finishTrip");

  if (button) button.disabled = true;

  try {
    const position = await getPosition();

    activeTrip.endPosition = position;
    activeTrip.endTime = nowISO();

    const previous = activeTrip.lastPoint;

    if (previous && position.accuracy <= 50) {
      const meters = distanceBetween(previous, position);

      if (meters >= 5) {
        activeTrip.distanceMeters += meters;

        activeTrip.route.push({
          lat: position.lat,
          lon: position.lon,
          accuracy: position.accuracy,
          time: position.time
        });
      }
    }

    stopGpsTracking();

    pendingTrip = activeTrip;
    activeTrip = null;

    saveActiveTrip();
    savePendingTrip();

    renderActiveTrip();
    showFareScreen();

  } catch (error) {
    alert(error.message);

  } finally {
    if (button) button.disabled = false;
  }
}

/* ---------- ÜCRET EKRANI ---------- */

function showFareScreen() {
  if (!pendingTrip) return;

  const card = document.getElementById("fareCard");
  const details = document.getElementById("tripDetails");

  if (!card || !details) return;

  const trip = pendingTrip;
  const km = trip.distanceMeters / 1000;

  details.innerHTML = `
    <p><strong>Tür:</strong>
      ${escapeHTML(trip.type.toUpperCase())}
    </p>

    <p><strong>Başlangıç:</strong>
      ${formatDate(trip.startTime)}
    </p>

    <p><strong>Bitiş:</strong>
      ${formatDate(trip.endTime)}
    </p>

    <p><strong>Başlangıç koordinatı:</strong>
      ${trip.startPosition.lat.toFixed(5)},
      ${trip.startPosition.lon.toFixed(5)}
    </p>

    <p><strong>Varış koordinatı:</strong>
      ${trip.endPosition.lat.toFixed(5)},
      ${trip.endPosition.lon.toFixed(5)}
    </p>

    <p><strong>GPS mesafesi:</strong>
      ${km.toFixed(2)} km
    </p>

    <p><small>
      GPS mesafesi tahminidir; gerçek yol mesafesi olmayabilir.
    </small></p>
  `;

  document.getElementById("tripFare").value = "";

  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth" });
}

/* ---------- YOLCULUK KAYDET ---------- */

function completeTrip() {
  if (!pendingTrip) return;

  const fareInput = document.getElementById("tripFare");

  if (!fareInput) {
    alert("Ücret alanı bulunamadı.");
    return;
  }

  const fare = Number(fareInput.value);

  if (
    fareInput.value.trim() === "" ||
    !Number.isFinite(fare) ||
    fare < 0
  ) {
    alert("Lütfen geçerli bir ücret gir.");
    return;
  }

  const trip = {
    id: pendingTrip.id,

    type: pendingTrip.type === "normal"
      ? "Normal"
      : pendingTrip.type.charAt(0).toUpperCase() +
        pendingTrip.type.slice(1),

    start: pendingTrip.startTime,
    end
