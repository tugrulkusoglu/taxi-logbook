// ==========================================
// TAXI-CHIRON-01 - APP.JS
// ==========================================

const STORAGE_KEY = "taxi_trips";
const APP_NAME = "TAXI-CHIRON-01";
const APP_VERSION = "2.1.0";

// ==========================================
// VERİ OKUMA
// ==========================================

function getTrips() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    console.error("Trip data read error:", error);
    return [];
  }
}

// ==========================================
// VERİ KAYDETME
// ==========================================

function saveTrips(trips) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    return true;
  } catch (error) {
    console.error("Trip data save error:", error);
    alert("Kayıtlar kaydedilemedi!");
    return false;
  }
}

// ==========================================
// YENİ YOLCULUK EKLEME
// ==========================================

function addTrip(trip) {
  const trips = getTrips();

  const type = trip.type || "Normal";

  const newTrip = {
    id: Date.now(),
    type: type,
    provider: trip.provider || "",
    start: trip.start || new Date().toISOString(),
    pickup: trip.pickup || "",
    dropoff: trip.dropoff || "",
    km: Number(trip.km || 0),
    fare: Number(trip.fare || 0),
    payment: trip.payment || "",
    notes: trip.notes || "",

    // Uber ve Bolt Chiron'a gönderilmez.
    sendToChiron: type === "Normal",

    date: new Date().toISOString().slice(0, 10)
  };

  trips.push(newTrip);

  if (saveTrips(trips)) {
    return newTrip;
  }

  return null;
}

// ==========================================
// TOPLAM KİLOMETRE
// ==========================================

function totalKm() {
  return getTrips().reduce((sum, trip) => {
    return sum + Number(trip.km || 0);
  }, 0);
}

// ==========================================
// TOPLAM CİRO
// ==========================================

function totalFare() {
  return getTrips().reduce((sum, trip) => {
    return sum + Number(trip.fare || 0);
  }, 0);
}

// ==========================================
// CHIRON YOLCULUKLARI
// SADECE NORMAL YOLCULUK
// ==========================================

function getChironTrips() {
  return getTrips().filter(trip =>
    trip
