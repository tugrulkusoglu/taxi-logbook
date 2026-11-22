const STORAGE_KEY = "taxi_trips";

function getTrips() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveTrips(trips) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

function addTrip(trip) {
  const trips = getTrips();

  const newTrip = {
    id: Date.now(),
    type: trip.type,
    provider: trip.provider || "",
    start: trip.start || new Date().toISOString(),
    pickup: trip.pickup || "",
    dropoff: trip.dropoff || "",
    km: Number(trip.km || 0),
    fare: Number(trip.fare || 0),
    payment: trip.payment || "",
    notes: trip.notes || "",

    // Uber ve Bolt Chiron'a gönderilmez.
    sendToChiron: trip.type === "Normal",

    date: new Date().toISOString().slice(0, 10)
  };

  trips.push(newTrip);
  saveTrips(trips);
  return newTrip;
}

function totalKm() {
  return getTrips().reduce((sum, t) => sum + Number(t.km || 0), 0);
}

function totalFare() {
  return getTrips().reduce((sum, t) => sum + Number(t.fare || 0), 0);
}

function getChironTrips() {
  return getTrips().filter(t => t.sendToChiron === true);
}

function getUberTrips() {
  return getTrips().filter(t => t.type === "Uber");
}

function getBoltTrips() {
  return getTrips().filter(t => t.type === "Bolt");
}

function exportBackup() {
  const data = JSON.stringify(getTrips(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "taxi-logbook-backup.json";
  a.click();

  URL.revokeObjectURL(url);
}

window.TaxiLogbook = {
  getTrips,
  addTrip,
  saveTrips,
  totalKm,
  totalFare,
  getChironTrips,
  getUberTrips,
  getBoltTrips,
  exportBackup
};
