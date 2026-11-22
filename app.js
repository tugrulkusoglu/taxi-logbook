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
    end: pendingTrip.endTime,
    date: pendingTrip.startTime.slice(0, 10),

    pickup: "",
    dropoff: "",

    startPosition: pendingTrip.startPosition,
    endPosition: pendingTrip.endPosition,

    route: pendingTrip.route,

    km: Number(
      (pendingTrip.distanceMeters / 1000).toFixed(2)
    ),

    fare: fare,

    sendToChiron: pendingTrip.type === "normal"
  };

  const trips = getTrips();

  trips.push(trip);

  saveTrips(trips);

  pendingTrip = null;

  savePendingTrip();

  const card = document.getElementById("fareCard");

  if (card) card.hidden = true;

  render();

  alert("Yolculuk kaydedildi.");
}

/* ---------- YOLCULUK İPTAL ---------- */

function cancelPendingTrip() {
  if (!pendingTrip) return;

  if (!confirm("Bu yolculuk kaydı iptal edilsin mi?")) {
    return;
  }

  pendingTrip = null;

  savePendingTrip();

  const card = document.getElementById("fareCard");

  if (card) card.hidden = true;

  render();
}

/* ---------- EKRAN ---------- */

function renderActiveTrip() {
  const box = document.getElementById("activeTrip");
  const finish = document.getElementById("finishTrip");

  if (!box || !finish) return;

  if (!activeTrip) {
    box.textContent = "Aktif yolculuk yok";
    finish.disabled = true;
    return;
  }

  const km = activeTrip.distanceMeters / 1000;

  box.innerHTML = `
    <strong>
      ${escapeHTML(activeTrip.type.toUpperCase())}
      yolculuğu devam ediyor
    </strong>
    <br>
    Başlangıç: ${formatDate(activeTrip.startTime)}
    <br>
    GPS mesafesi: ${km.toFixed(2)} km
    <br>
    GPS takibi aktif
  `;

  finish.disabled = false;
}

function renderShift() {
  const box = document.getElementById("shiftStatus");

  if (!box) return;

  const shift = getShift();

  if (!shift) {
    box.textContent = "Vardiya açık değil";

  } else if (shift.active) {
    box.textContent =
      "Vardiya açık · Başlangıç: " +
      formatDate(shift.startTime);

  } else {
    box.textContent =
      "Vardiya kapalı · Başlangıç: " +
      formatDate(shift.startTime) +
      " · Bitiş: " +
      formatDate(shift.endTime);
  }
}

function renderTrips() {
  const tbody = document.getElementById("tripRows");

  if (!tbody) return;

  tbody.innerHTML = getTrips().slice().reverse().map(trip => `
    <tr>
      <td>${escapeHTML(trip.date || "")}</td>
      <td>${escapeHTML(trip.type || "")}</td>
      <td>${escapeHTML(trip.pickup || "GPS")}</td>
      <td>${escapeHTML(trip.dropoff || "GPS")}</td>
      <td>${Number(trip.km || 0).toFixed(2)}</td>
      <td>${money(trip.fare)}</td>
      <td>
        <button type="button" data-delete="${trip.id}">
          Sil
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.delete);

      if (!confirm("Bu yolculuk silinsin mi?")) return;

      saveTrips(
        getTrips().filter(t => t.id !== id)
      );

      render();
    });
  });
}

function renderSummary() {
  const box = document.getElementById("summary");

  if (!box) return;

  const trips = getTrips();

  const km = trips.reduce(
    (sum, t) => sum + Number(t.km || 0),
    0
  );

  const fare = trips.reduce(
    (sum, t) => sum + Number(t.fare || 0),
    0
  );

  box.innerHTML = `
    <div class="summary-item">
      <strong>${trips.length}</strong>
      <span>Yolculuk</span>
    </div>

    <div class="summary-item">
      <strong>${km.toFixed(2)} km</strong>
      <span>Toplam km</span>
    </div>

    <div class="summary-item">
      <strong>${money(fare)}</strong>
      <span>Toplam ücret</span>
    </div>
  `;
}

function render() {
  renderShift();
  renderActiveTrip();
  renderTrips();
  renderSummary();
}

/* ---------- YEDEKLEME ---------- */

function exportBackup() {
  const data = {
    app: "TAXI-CHIRON-01",
    version: "3.1.0",
    exportDate: nowISO(),
    trips: getTrips(),
    shift: getShift(),
    activeTrip: activeTrip,
    pendingTrip: pendingTrip
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "taxi-logbook-backup.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function importBackupFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      const trips = Array.isArray(data)
        ? data
        : data.trips;

      if (!Array.isArray(trips)) {
        throw new Error("Geçersiz yedek dosyası.");
      }

      if (!confirm(
        "Mevcut yolculukların yerine yedek dosyası yüklensin mi?"
      )) {
        return;
      }

      saveTrips(trips);

      if (Array.isArray(data)) {
        activeTrip = null;
        pendingTrip = null;
      } else {
        if (data.shift) saveShift(data.shift);

        activeTrip = data.activeTrip || null;
        pendingTrip = data.pendingTrip || null;
      }

      saveActiveTrip();
      savePendingTrip();

      stopGpsTracking();

      render();

      if (activeTrip) startGpsTracking();
      if (pendingTrip) showFareScreen();

      alert("Yedek geri yüklendi.");

    } catch (error) {
      alert("Yedek açılamadı: " + error.message);
    }
  };

  reader.readAsText(file);
}

/* ---------- BAŞLAT ---------- */

function initializeApp() {
  loadData();

  const startButton = document.getElementById("startShift");
  const endButton = document.getElementById("endShift");
  const finishButton = document.getElementById("finishTrip");
  const completeButton = document.getElementById("completeTrip");
  const cancelButton = document.getElementById("cancelTrip");
  const backupButton = document.getElementById("backup");
  const restoreInput = document.getElementById("restore");

  if (startButton) {
    startButton.addEventListener("click", startShift);
  }

  if (endButton) {
    endButton.addEventListener("click", endShift);
  }

  if (finishButton) {
    finishButton.addEventListener("click", finishTrip);
  }

  if (completeButton) {
    completeButton.addEventListener("click", completeTrip);
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", cancelPendingTrip);
  }

  if (backupButton) {
    backupButton.addEventListener("click", exportBackup);
  }

  if (restoreInput) {
    restoreInput.addEventListener("change", event => {
      importBackupFile(event.target.files[0]);
      event.target.value = "";
    });
  }

  document.querySelectorAll(".type-btn").forEach(button => {
    button.addEventListener("click", () => {
      requestTripStart(button.dataset.kind);
    });
  });

  render();

  if (activeTrip) {
    startGpsTracking();
  }

  if (pendingTrip) {
    showFareScreen();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

/* ---------- DIŞ ERİŞİM ---------- */

window.TaxiLogbook = {
  getTrips,
  getShift,
  exportBackup,
  importBackupFile,
  render,
  startShift,
  endShift
};
