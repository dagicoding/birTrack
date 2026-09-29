# Bīr Income Tracker — Setup Guide

Your app is now:
- **Responsive** — one phone-card column on mobile/tablet, a two-column dashboard (summary panel + history) on desktop.
- **Cloud-backed** — data lives in **Firestore** instead of the browser's localStorage, so it survives clearing browser data and can sync across tabs/devices signed into the same install.
- **PDF export** instead of JSON import/export — see "Export PDF Statement" in Settings.

The code is split into:
```
index.html
css/styles.css
js/
  calendar.js        Ethiopian calendar math (unchanged)
  utils.js           formatting/helpers (unchanged)
  animations.js       count-up / ripple effects (unchanged)
  firebase-config.js  <-- YOU EDIT THIS
  firebase-init.js    Firebase app + anonymous auth + offline cache
  db.js               Firestore data layer (records, settings, security)
  security.js         PIN lock, now persisted to Firestore
  pdf-export.js       builds the PDF statement (jsPDF + autotable)
  fonts/*.js          embedded fonts used only by the PDF export
  app.js              all UI logic / event wiring
```

Nothing will work until you connect it to your own Firebase project — that takes about 5 minutes.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com and click **Add project** (the free "Spark" plan is enough for personal use).
2. Once created, click the **</> (Web)** icon on the project overview page to register a web app.
3. Firebase will show you a `firebaseConfig` object. Copy it.

## 2. Paste your config in

Open `js/firebase-config.js` and replace the placeholder values with the ones Firebase gave you:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

These are public client identifiers, not secrets — real protection comes from Firestore Security Rules (step 4).

## 3. Turn on Firestore and Anonymous Auth

In the Firebase Console for your project:
- **Build → Firestore Database → Create database** — start in production mode, pick a region close to you.
- **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
  The app signs each browser/device in anonymously so your data is private to your install without needing you to create an account or type a password. (If you'd rather use email/password or Google sign-in across multiple devices, that's a natural next upgrade — see "Ideas to go further" below.)

## 4. Lock down your data with Security Rules

This is the important part — without rules, anyone who found your config could read or write your data. In **Firestore Database → Rules**, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This means: a signed-in device can only ever read or write documents under its **own** `users/{uid}/...` path. Click **Publish**.

## 5. Run it

Because this app now makes network requests (Firebase) and uses ES-module-free but file-based script loading, open it through a local web server rather than double-clicking the HTML file:

```bash
cd bir-income-tracker
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

Any static file server works (VS Code's "Live Server", `npx serve`, etc). To use it on your phone too, host these files anywhere that serves static files over HTTPS (Firebase Hosting itself is a free, one-command option: `firebase init hosting` then `firebase deploy`, using the same project).

## What changed from the original

- **Removed:** "Export JSON Backup" and "Import JSON Backup" from Settings.
- **Added:** "Export PDF Statement" — generates a polished PDF of whatever transactions are currently visible (respecting your active date filter and search), with the total, transaction count, and Ethiopian dates. Fonts are embedded so it renders correctly everywhere, including Amharic notes.
- **Storage:** every read/write that used to touch `localStorage` now talks to Firestore through `db.js`. The rest of the app's logic (filtering, sorting, the Ethiopian calendar, the PIN lock) is untouched.
- **Responsive:** the balance/stats panel and the transaction history now form a two-column dashboard from 980px wide upward; below that it's the same single-column phone layout as before, just with a slightly wider card on tablet widths (from 640px).

## Ideas to go further

A few things worth considering if you want to take this further:

- **Real sign-in instead of anonymous auth** — right now each browser/device gets its own anonymous account, so the same person on their phone and laptop would see *different* data unless they're the same browser profile. Adding email/password or Google sign-in (Firebase Auth supports both) would let one person's data follow them across devices.
- **Multi-currency or multi-user households** — the data model (`users/{uid}/records/*`) would extend naturally to a shared `households/{id}/records/*` collection if you ever want to track income with a partner or business.
- **PWA install support** — a `manifest.json` + service worker would let people "Add to Home Screen" on mobile for an app-like icon and splash screen; happy to add this if useful.
- **Export range** — right now PDF export uses whatever filter/search is active on screen. An explicit "choose a date range to export" step in the export flow itself would be a nice refinement if you often export something different from what you're currently viewing.

Let me know if you'd like help with any of these, or with deploying it.
