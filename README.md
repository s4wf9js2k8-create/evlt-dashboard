# Elham Valley Line Trust (EVLT) Operations Dashboard

🚂 **Operational Management & Safety System for Peene Yard 7¼″ Railway**

---

## 📁 Repository Structure & Consolidation

All features and code have been consolidated into **a single main file** for simplicity and ease of maintenance:

- **`index.html`** — **The entire application!** Contains all UI screens, CSS styles, JavaScript logic, operational check forms, volunteer attendance, fleet roster, interactive track diagrams, and real-time Firebase database synchronization. If you want to customize or edit anything, **this is the only file you need to edit**.
- **`firebase-messaging-sw.js`** — Background service worker handling Web Push & FCM device alert notifications.
- **`apple-touch-icon.png`** — App icon for iOS "Add to Home Screen" and notification badges.

---

## 🌐 Hosted on GitHub Pages

The platform is served directly from `index.html` with full offline support, PWA installability, and real-time database sync with Firebase.
