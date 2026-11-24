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

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("tr-BE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2) + " €";
}

function formatDistance(meters) {
  return (Number(meters || 0) / 1000).toFixed(2) + " km";
}

function localDateKey(value) {
  if (!value) return "";
  const d = new Date(value);

  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function safeJSON(value, fallback) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

function getTrips() {
  return safeJSON(localStorage.getItem(STORAGE_KEY), []);
}

function saveTrips(trips) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

function getShift() {
  return safeJSON(localStorage.getItem(SHIFT_KEY), null);
}

function saveShift(shift) {
  localStorage.setItem(SHIFT_KEY, JSON.stringify(shift));
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS desteklenmiyor."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      error => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

/* ---------- GPS ---------- */

function startGpsTracking() {
  if (!activeTrip || !navigator.geolocation) return;

  if (gpsWatcher !== null) {
    navigator.geolocation.clearWatch(gpsWatcher);
  }

  gpsWatcher = navigator.geolocation.watchPosition(
    position => {
      if (!activeTrip) return;

      const point = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };

      if (!activeTrip.route) {
        activeTrip.route = [];
      }

      if (!activeTrip.lastPoint) {
        activeTrip.lastPoint = point;
        activeTrip.route.push(point);
        saveActiveTrip();
        return;
      }

      const distance = calculateDistance(
        activeTrip.lastPoint,
        point
      );

      if (distance > 3) {
        activeTrip.distanceMeters =
          (activeTrip.distanceMeters || 0) + distance;

        activeTrip.lastPoint = point;
        activeTrip.route.push(point);

        saveActiveTrip();
        render();
      }
    },
    error => {
      console.warn("GPS hatası:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    }
  );
}

function stopGpsTracking() {
  if (gpsWatcher !== null) {
    navigator.geolocation.clearWatch(gpsWatcher);
    gpsWatcher = null;
  }
}

function calculateDistance(a, b) {
  if (!a || !b) return 0;

  const R = 6371000;

  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * c;
}

/* ---------- ACTIVE TRIP ---------- */

function saveActiveTrip() {
  if (!activeTrip) {
    localStorage.removeItem(ACTIVE_TRIP_KEY);
    return;
  }

  localStorage.setItem(
    ACTIVE_TRIP_KEY,
    JSON.stringify(activeTrip)
  );
}

function loadActiveTrip() {
  activeTrip = safeJSON(
    localStorage.getItem(ACTIVE_TRIP_KEY),
    null
  );
}

/* ---------- PENDING TRIP ---------- */

function savePendingTrip() {
  if (!pendingTrip) {
    localStorage.removeItem(PENDING_TRIP_KEY);
    return;
  }

  localStorage.setItem(
    PENDING_TRIP_KEY,
    JSON.stringify(pendingTrip)
  );
}

function loadPendingTrip() {
  pendingTrip = safeJSON(
    localStorage.getItem(PENDING_TRIP_KEY),
    null
  );
}

/* ---------- SHIFT ---------- */

function startShift() {
  if (getShift()) {
    alert("Dienst is al gestart.");
    return;
  }

  const shift = {
    id: Date.now(),
    startTime: nowISO(),
    endTime: null,
    pauses: [],
    currentPause: null
  };

  saveShift(shift);
  render();
}

function endShift() {
  const shift = getShift();

  if (!shift) {
    alert("Er is geen actieve dienst.");
    return;
  }

  if (activeTrip || pendingTrip) {
    alert("Beëindig eerst de rit.");
    return;
  }

  if (shift.currentPause) {
    alert("Beëindig eerst de pauze.");
    return;
  }

  shift.endTime = nowISO();

  saveShift(shift);
  render();
}

function startPause() {
  const shift = getShift();

  if (!shift) {
    alert("Start eerst de dienst.");
    return;
  }

  if (shift.currentPause) {
    alert("Pauze is al gestart.");
    return;
  }

  if (activeTrip || pendingTrip) {
    alert("Beëindig eerst de rit.");
    return;
  }

  shift.currentPause = {
    startTime: nowISO(),
    endTime: null
  };

  saveShift(shift);
  render();
}

function endPause() {
  const shift = getShift();

  if (!shift || !shift.currentPause) {
    alert("Er is geen actieve pauze.");
    return;
  }

  shift.currentPause.endTime = nowISO();

  shift.pauses = shift.pauses || [];
  shift.pauses.push(shift.currentPause);

  shift.currentPause = null;

  saveShift(shift);
  render();
}

/* ---------- TRIP START ---------- */

function startTrip(kind) {
  const shift = getShift();

  if (!shift) {
    alert("Start eerst de dienst.");
    return;
  }

  if (shift.currentPause) {
    alert("Beëindig eerst de pauze.");
    return;
  }

  if (activeTrip || pendingTrip) {
    alert("Er is al een rit bezig.");
    return;
  }

  const currentTime = Date.now();

  if (
    lastClickKind === kind &&
    currentTime - lastClickTime < DOUBLE_CLICK_MS
  ) {
    return;
  }

  lastClickKind = kind;
  lastClickTime = currentTime;

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

  getPosition()
    .then(position => {
      if (!activeTrip) return;

      activeTrip.startPosition = position;

      activeTrip.pickup =
        position.lat.toFixed(5) +
        ", " +
        position.lon.toFixed(5);

      activeTrip.lastPoint = position;

      activeTrip.route = [position];

      saveActiveTrip();
      render();
    })
    .catch(error => {
      console.warn("Başlangıç GPS:", error.message);
    });

  startGpsTracking();
  render();
}

/* ---------- TRIP FINISH ---------- */

async function finishTrip() {
  if (!activeTrip) {
    alert("Er is geen actieve rit.");
    return;
  }

  stopGpsTracking();

  activeTrip.endTime = nowISO();

  try {
    activeTrip.endPosition = await getPosition();

    const p = activeTrip.endPosition;

    activeTrip.dropoff =
      p.lat.toFixed(5) +
      ", " +
      p.lon.toFixed(5);
  } catch (error) {
    console.warn("Bitiş GPS:", error.message);
  }

  activeTrip.lastPoint = null;

  pendingTrip = {
    ...activeTrip
  };

  activeTrip = null;

  saveActiveTrip();
  savePendingTrip();

  renderFareCard();
  render();
}

/* ---------- FARE ---------- */

function renderFareCard() {
  const card = document.getElementById("fareCard");
  if (!card || !pendingTrip) return;

  card.classList.remove("hidden");

  const distance = document.getElementById("fareDistance");
  const duration = document.getElementById("fareDuration");

  if (distance) {
    distance.textContent = formatDistance(
      pendingTrip.distanceMeters
    );
  }

  if (duration) {
    const start = new Date(pendingTrip.startTime);
    const end = new Date(pendingTrip.endTime);

    const minutes = Math.max(
      0,
      Math.round((end - start) / 60000)
    );

    duration.textContent = minutes + " min";
  }

  const fareInput = document.getElementById("fareInput");

  if (fareInput) {
    fareInput.value = pendingTrip.fare || "";
  }
}

function completeTrip() {
  if (!pendingTrip) {
    alert("Er is geen rit om af te sluiten.");
    return;
  }

  const fareInput = document.getElementById("fareInput");

  const fare = Number(
    fareInput ? fareInput.value : 0
  );

  if (!Number.isFinite(fare) || fare < 0) {
    alert("Voer een geldig bedrag in.");
    return;
  }

  pendingTrip.fare = fare;

  const trips = getTrips();

  trips.push(pendingTrip);

  saveTrips(trips);

  pendingTrip = null;

  savePendingTrip();

  const card = document.getElementById("fareCard");

  if (card) {
    card.classList.add("hidden");
  }

  render();
}

/* ---------- CANCEL TRIP ---------- */

function cancelTrip() {
  if (!activeTrip && !pendingTrip) {
    alert("Er is geen rit om te annuleren.");
    return;
  }

  if (!confirm("Rit annuleren?")) {
    return;
  }

  stopGpsTracking();

  activeTrip = null;
  pendingTrip = null;

  saveActiveTrip();
  savePendingTrip();

  const card = document.getElementById("fareCard");

  if (card) {
    card.classList.add("hidden");
  }

  render();
}

/* ---------- DISPLAY ---------- */

function renderShift() {
  const shift = getShift();

  const shiftStatus = document.getElementById("shiftStatus");
  const shiftStart = document.getElementById("shiftStart");
  const shiftEnd = document.getElementById("shiftEnd");

  if (shiftStatus) {
    shiftStatus.textContent = shift
      ? "Dienst actief"
      : "Dienst niet gestart";
  }

  if (shiftStart) {
    shiftStart.textContent = shift
      ? formatTime(shift.startTime)
      : "—";
  }

  if (shiftEnd) {
    shiftEnd.textContent = shift
      ? formatTime(shift.endTime)
      : "—";
  }

  const startShiftButton =
    document.getElementById("startShift");

  const endShiftButton =
    document.getElementById("endShift");

  const startPauseButton =
    document.getElementById("startPause");

  const endPauseButton =
    document.getElementById("endPause");

  if (startShiftButton) {
    startShiftButton.disabled = !!shift;
  }

  if (endShiftButton) {
    endShiftButton.disabled = !shift;
  }

  if (startPauseButton) {
    startPauseButton.disabled =
      !shift || !!shift.currentPause;
  }

  if (endPauseButton) {
    endPauseButton.disabled =
      !shift || !shift.currentPause;
  }

  const pauseStatus =
    document.getElementById("pauseStatus");

  if (pauseStatus) {
    pauseStatus.textContent =
      shift && shift.currentPause
        ? "Pauze actief"
        : "Geen pauze";
  }
}

function renderTripStatus() {
  const status = document.getElementById("tripStatus");

  if (!status) return;

  if (activeTrip) {
    status.textContent =
      activeTrip.kind === "street"
        ? "Straatrit actief"
        : "Bestelde rit actief";

    return;
  }

  if (pendingTrip) {
    status.textContent = "Rit wacht op prijs";
    return;
  }

  status.textContent = "Geen actieve rit";
}

function renderTrips() {
  const container = document.getElementById("tripRows");

  if (!container) return;

  const trips = getTrips();

  if (!trips.length) {
    container.innerHTML = `
      <tr>
        <td colspan="6">Nog geen ritten.</td>
      </tr>
    `;
    return;
  }

  container.innerHTML = trips
    .slice()
    .reverse()
    .map(trip => {
      return `
        <tr>
          <td>${formatDate(trip.startTime)}</td>
          <td>${trip.kind === "street" ? "Straat" : "Besteld"}</td>
          <td>${formatTime(trip.startTime)}</td>
          <td>${formatTime(trip.endTime)}</td>
          <td>${formatDistance(trip.distanceMeters)}</td>
          <td>${formatMoney(trip.fare)}</td>
          <td>
            <button
              class="delete-trip"
              data-id="${trip.id}"
              type="button"
            >
              ×
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  renderShift();
  renderTripStatus();
  renderTrips();

  if (pendingTrip) {
    renderFareCard();
  }
}

/* ---------- DELETE ---------- */

function deleteTrip(id) {
  if (!confirm("Rit verwijderen?")) return;

  const trips = getTrips().filter(
    trip => String(trip.id) !== String(id)
  );

  saveTrips(trips);
  render();
}

/* ---------- BACKUP ---------- */

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

  const link = document.createElement("a");

  link.href = url;
  link.download = "taxi-logbook-backup.json";
  link.click();

  URL.revokeObjectURL(url);
}

function restoreData(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      if (!confirm("Backup terugzetten?")) return;

      if (Array.isArray(data.trips)) {
        saveTrips(data.trips);
      }

      if (data.shift) {
        saveShift(data.shift);
      }

      activeTrip = data.activeTrip || null;
      pendingTrip = data.pendingTrip || null;

      saveActiveTrip();
      savePendingTrip();

      render();

      alert("Backup succesvol teruggezet.");
    } catch (error) {
      alert("Ongeldig backupbestand.");
    }
  };

  reader.readAsText(file);
}

/* ---------- LOAD ---------- */

function loadData() {
  activeTrip = safeJSON(
    localStorage.getItem(ACTIVE_TRIP_KEY),
    null
  );

  pendingTrip = safeJSON(
    localStorage.getItem(PENDING_TRIP_KEY),
    null
  );
}

/* ---------- EVENTS ---------- */

function bindEvents() {
  document.getElementById("startShift")
    ?.addEventListener("click", startShift);

  document.getElementById("endShift")
    ?.addEventListener("click", endShift);

  document.getElementById("startPause")
    ?.addEventListener("click", startPause);

  document.getElementById("endPause")
    ?.addEventListener("click", endPause);

  document.getElementById("streetTrip")
    ?.addEventListener("click", () => startTrip("street"));

  document.getElementById("orderedTrip")
    ?.addEventListener("click", () => startTrip("ordered"));

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

      if (button) {
        deleteTrip(button.dataset.id);
      }
    });
}

/* ---------- INIT ---------- */

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  bindEvents();
  render();

  if (activeTrip) {
    startGpsTracking();
  }

  if (pendingTrip) {
    renderFareCard();
  }
});
