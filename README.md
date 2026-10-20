# Elham Valley Line Trust (EVLT) Operations Dashboard

Operational management and safety system for the Elham Valley Line Trust.

## Files

- `index.html` — page structure and app entry point.
- `styles.css` — application styles.
- `app.js` — Firebase connection, sign-in, page navigation, and application features.
- `help-guides.js` — built-in Help & Tutorials content and safe one-time guide migration.
- `firebase-messaging-sw.js` — Firebase background notification service worker.
- `database.rules.json` — Realtime Database security rules.
- `apple-touch-icon.png` — app icon.

The site is served from the repository root by GitHub Pages. Keep local asset paths relative so the app works under the repository's `/evlt-dashboard/` URL.

## External libraries

The Firebase web SDK is pinned to 9.22.2, Lucide to 1.60.0, and Tesseract.js to 5.1.1 in `index.html`. Update these versions deliberately and verify the app after changing them.

## Help guides

Built-in guides live in `help-guides.js`. When the System Admin signs in, the app adds missing built-in guides and updates only untouched legacy built-in guides in Realtime Database. Custom guides and guides edited by an admin are preserved.
