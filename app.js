/* ==========================================
   TAXI LOGBOOK — TAXI-CHIRON-01
   Version 2.2.0
   ========================================== */

const STORAGE_KEY = "taxi_trips";
const SHIFT_KEY = "taxi_shift";

// ---------- STORAGE ----------

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

// ---------- HELPERS ----------

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function money(value) {
  return Number(value || 0).toFixed(2) + " €";
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

// ---------- TRIPS ----------

function addTrip(data) {
  const trips = getTrips();

  const trip = {
    id: Date.now(),
    type: data.type,
    provider: data.provider || "",
    start: data.start || nowLocal(),
    end: data.end || "",
    pickup: data.pickup || "",
    dropoff: data.dropoff || "",
    km: Number(data.km || 0),
    fare: Number(data.fare || 0),
    payment: data.payment || "",
    notes: data.notes || "",
    sendToChiron: data.type === "Normal",
    date: (data.start || nowLocal()).slice(0, 10)
  };

  trips.push(trip);
  saveTrips(trips);
  render();

  return trip;
}

function deleteTrip(id) {
  if (!confirm("Bu yolculuk silinsin mi?")) return;

  saveTrips(getTrips().filter(t => t.id !== id));
  render();
}

function totalKm(trips = getTrips()) {
  return trips.reduce((sum, t) => sum + Number(t.km || 0), 0);
}

function totalFare(trips = getTrips()) {
  return trips.reduce((sum, t) => sum + Number(t.fare || 0), 0);
}

function getChironTrips() {
  return getTrips().filter(t => t.type === "Normal" && t.sendToChiron);
}

function getUberTrips() {
  return getTrips().filter(t => t.type === "Uber");
}

function getBoltTrips() {
  return getTrips().filter(t => t.type === "Bolt");
}

// ---------- SHIFT ----------

function startShift() {
  const km = document.getElementById("shiftStartKm").value;
  const time = document.getElementById("shiftStartTime").value || nowLocal();

  if (km === "") {
    alert("Lütfen başlangıç kilometresini gir.");
    return;
  }

  saveShift({
    startKm: Number(km),
    startTime: time,
    endKm: null,
    endTime: null,
    active: true
  });

  document.getElementById("shiftStartTime").value = time;
  render();
}

function endShift() {
  const shift = getShift();

  if (!shift || !shift.active) {
    alert("Önce vardiyayı başlatmalısın.");
    return;
  }

  const km = document.getElementById("shiftEndKm").value;

  if (km === "") {
    alert("Lütfen bitiş kilometresini gir.");
    return;
  }

  if (Number(km) < Number(shift.startKm)) {
    alert("Bitiş kilometresi başlangıç kilometresinden küçük olamaz.");
    return;
  }

  shift.endKm = Number(km);
  shift.endTime = document.getElementById("shiftEndTime").value || nowLocal();
  shift.active = false;

  saveShift(shift);
  render();
}

// ---------- SUMMARY & TABLE ----------

function renderSummary() {
  const el = document.getElementById("summary");
  if (!el) return;

  const trips = getTrips();
  const uber = getUberTrips();
  const bolt = getBoltTrips();
  const normal = getChironTrips();

  el.innerHTML = `
    <div class="summary-item">
      <strong>${trips.length}</strong>
      <span>Toplam yolculuk</span>
    </div>
    <div class="summary-item">
      <strong>${totalKm().toFixed(1)} km</strong>
      <span>Toplam km</span>
    </div>
    <div class="summary-item">
      <strong>${money(totalFare())}</strong>
      <span>Toplam ciro</span>
    </div>
    <div class="summary-item">
      <strong>${uber.length}</strong>
      <span>Uber</span>
    </div>
    <div class="summary-item">
      <strong>${bolt.length}</strong>
      <span>Bolt</span>
    </div>
    <div class="summary-item">
      <strong>${normal.length}</strong>
      <span>Normal / Chiron</span>
    </div>
  `;
}

function renderTrips() {
  const tbody = document.getElementById("tripRows");
  if (!tbody) return;

  const trips = getTrips().slice().reverse();

  tbody.innerHTML = trips.map(t => `
    <tr>
      <td>${escapeHTML(t.date || "")}</td>
      <td>${escapeHTML(t.type || "")}</td>
      <td>${escapeHTML(t.pickup || "")} → ${escapeHTML(t.dropoff || "")}</td>
      <td>${Number(t.km || 0).toFixed(1)}</td>
      <td>${money(t.fare)}</td>
      <td>${escapeHTML(t.payment || "")}</td>
      <td>
        <button type="button" class="delete-trip" data-id="${t.id}" title="Sil">✕</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".delete-trip").forEach(btn => {
    btn.addEventListener("click", () => deleteTrip(Number(btn.dataset.id)));
  });
}

function renderShift() {
  const shift = getShift();
  const status = document.getElementById("shiftStatus");

  if (!status) return;

  if (!shift) {
    status.textContent = "Vardiya açık değil";
    return;
  }

  if (shift.active) {
    status.textContent = `Vardiya açık • Başlangıç: ${shift.startKm} km`;
  } else {
    status.textContent = `Vardiya kapalı • ${shift.startKm} → ${shift.endKm} km • ${(shift.endKm - shift.startKm).toFixed(1)} km`;
  }
}

function render() {
  renderSummary();
  renderTrips();
  renderShift();
}

// ---------- BACKUP ----------

function exportBackup() {
  try {
    const backup = {
      app: "TAXI-CHIRON-01",
      version: "2.2.0",
      exportDate: new Date().toISOString(),
      trips: getTrips(),
      shift: getShift()
    };

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "taxi-logbook-backup-" + today() + ".json";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

  } catch (error) {
    console.error("Backup error:", error);
    alert("Yedek oluşturulamadı.");
  }
}

// ---------- RESTORE ----------

function importBackupFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function () {
    try {
      const data = JSON.parse(reader.result);

      const trips = Array.isArray(data) ? data : data.trips;

      if (!Array.isArray(trips)) {
        throw new Error("Invalid backup");
      }

      if (!confirm(
        "Yedek geri yüklenecek. Mevcut yolculukların yerine yedek dosyasındaki kayıtlar geçecek. Devam edilsin mi?"
      )) {
        return;
      }

      saveTrips(trips);

      if (data.shift) {
        saveShift(data.shift);
      }

      render();
      alert("Yedek başarıyla geri yüklendi.");

    } catch (error) {
      console.error("Restore error:", error);
      alert("Yedek dosyası geçersiz veya okunamadı.");
    }
  };

  reader.onerror = function () {
    alert("Dosya okunamadı.");
  };

  reader.readAsText(file);
}

// ---------- CSV EXPORT ----------

function exportCSV() {
  const trips = getTrips();

  const headers = [
    "Tarih",
    "Tür",
    "Başlangıç",
    "Bitiş",
    "Alış",
    "Varış",
    "Km",
    "Ücret",
    "Ödeme",
    "Not"
  ];

  const rows = trips.map(t => [
    t.date,
    t.type,
    t.start,
    t.end,
    t.pickup,
    t.dropoff,
    t.km,
    t.fare,
    t.payment,
    t.notes
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value =>
      '"' + String(value ?? "").replace(/"/g, '""') + '"'
    ).join(";"))
    .join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "taxi-logbook-" + today() + ".csv";
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- PRINT / PDF ----------

function printReport() {
  window.print();
}

// ---------- TRIP TYPE BUTTONS ----------

function setTripType(kind) {
  const hidden = document.getElementById("tripKind");
  const rule = document.getElementById("sendRule");

  if (hidden) hidden.value = kind;

  document.querySelectorAll(".type-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.kind === kind);
  });

  if (rule) {
    if (kind === "uber") {
      rule.textContent = "Uber yolculuğu kaydedilir; Chiron'a gönderilmez.";
    } else if (kind === "bolt") {
      rule.textContent = "Bolt yolculuğu kaydedilir; Chiron'a gönderilmez.";
    } else {
      rule.textContent = "Normal yolculuk Dienststaat'a dahil edilir ve Chiron için hazırlanır.";
    }
  }
}

// ---------- INITIALIZATION ----------

document.addEventListener("DOMContentLoaded", function () {

  // Default trip time
  const tripStart = document.getElementById("tripStart");
  if (tripStart && !tripStart.value) {
    tripStart.value = nowLocal();
  }

  // Trip type buttons
  document.querySelectorAll(".type-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      setTripType(btn.dataset.kind);
    });
  });

  // Add trip
  const form = document.getElementById("tripForm");

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const kind = document.getElementById("tripKind").value;
      const typeMap = {
        uber: "Uber",
        bolt: "Bolt",
        normal: "Normal"
      };

      addTrip({
        type: typeMap[kind] || "Uber",
        start: document.getElementById("tripStart").value,
        end: document.getElementById("tripEnd").value,
        pickup: document.getElementById("pickup").value,
        dropoff: document.getElementById("dropoff").value,
        km: document.getElementById("km").value,
        fare: document.getElementById("fare").value,
        payment: document.getElementById("payment").value,
        notes: document.getElementById("note").value
      });

      form.reset();
      if (tripStart) tripStart.value = nowLocal();
      setTripType("uber");
    });
  }

  // Shift buttons
  const startBtn = document.getElementById("startShift");
  const endBtn = document.getElementById("endShift");

  if (startBtn) startBtn.addEventListener("click", startShift);
  if (endBtn) endBtn.addEventListener("click", endShift);

  // Backup button
  const backupBtn = document.getElementById("backup");

  if (backupBtn) {
    backupBtn.addEventListener("click", exportBackup);
  }

  // Restore input
  const restoreInput = document.getElementById("restore");

  if (restoreInput) {
    restoreInput.addEventListener("change", function () {
      const file = restoreInput.files[0];
      importBackupFile(file);
      restoreInput.value = "";
    });
  }

  // CSV button
  const csvBtn = document.getElementById("exportCsv");

  if (csvBtn) {
    csvBtn.addEventListener("click", exportCSV);
  }

  // Print button
  const printBtn = document.getElementById("printReport");

  if (printBtn) {
    printBtn.addEventListener("click", printReport);
  }

  render();
});

// ---------- PUBLIC API ----------

window.TaxiLogbook = {
  addTrip,
  deleteTrip,
  getTrips,
  totalKm,
  totalFare,
  getChironTrips,
  getUberTrips,
  getBoltTrips,
  exportBackup,
  importBackupFile,
  exportCSV,
  startShift,
  endShift,
  render
};
