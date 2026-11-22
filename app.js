const trips = JSON.parse(localStorage.getItem("taxi_trips") || "[]");

function addTrip(trip) {
  trips.push({
    id: Date.now(),
    type: trip.type,
    provider: trip.provider || "",
    start: trip.start || "",
    pickup: trip.pickup || "",
    dropoff: trip.dropoff || "",
    km: Number(trip.km || 0),
    fare: Number(trip.fare || 0),
    payment: trip.payment || "",
    notes: trip.notes || ""
  });

  localStorage.setItem("taxi_trips", JSON.stringify(trips));
}

function getTrips() {
  return JSON.parse(localStorage.getItem("taxi_trips") || "[]");
}

function totalKm() {
  return getTrips().reduce((sum, trip) => sum + trip.km, 0);
}

function totalFare() {
  return getTrips().reduce((sum, trip) => sum + trip.fare, 0);
}

function exportTrips() {
  const data = JSON.stringify(getTrips(), null, 2);
  const file = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = "taxi-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

window.TaxiLogbook = {
  addTrip,
  getTrips,
  totalKm,
  totalFare,
  exportTrips
};
