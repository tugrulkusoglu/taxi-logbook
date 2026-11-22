# Taxi Logbook — TAXI-CHIRON-01

A first working offline-friendly prototype for a taxi driver's personal trip log.

## Included
- Log normal trips and app trips (Uber/Bolt)
- Local trip history with trip totals, distance, and fares
- Shift start/end with odometer fields
- CSV export, browser print/save as PDF, JSON backup/restore
- PWA install metadata and service-worker cache

## Important limitations
- This is a prototype, not a completed native Android APK.
- Data is stored locally in the browser/device. Clearing browser storage can remove it; export backups regularly.
- Chiron Vlaanderen API is not connected. Do not enter API secrets into this app. API integration requires official API documentation and a secure server-side component.
- VAT/report totals are not yet validated against the user's official Z-report and Dienststaat templates.

## Run
Open `index.html` in a browser. For install/offline PWA support, serve it over HTTPS (GitHub Pages can be used after configuration).
