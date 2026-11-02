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

# Access and permissions

System Admins manage page access and editing from **Admin → Access & Permissions**. Permissions are assigned to volunteer roles; each approved account inherits the combined access of the roles on its linked volunteer profile. Editing is separate from viewing, and enabling editing also enables viewing.

The first time the permissions page is opened on an existing database, current account grants are shown against each linked volunteer role. Review the role matrix and choose **Save role permissions** to apply it. This migration is not written until an admin saves the matrix. Existing write access remains in place until that save; afterward, Firebase enforces the new edit permissions.

Deploy the updated Realtime Database rules with the application before using role based editing. The rules enforce edit access independently of the controls shown in the interface.

## Volunteer cards, roles and licences

The Volunteers page shows one card per volunteer, with their roles, DBS status, hours and licence/qualification records. System Admins can add and delete roles from **Admin → Access & Permissions** (deleting a role removes it from volunteers and recalculates linked account access). Anyone with Edit access to Documents can add or update licence records from a volunteer's card.

Deploy order: publish the database rules first (`firebase deploy --only database`), then upload the app files. The Volunteers page now reads `volunteerDocs` and `removedRoles`, and a signed-in volunteer would be signed out if the matching rules were not live yet.
