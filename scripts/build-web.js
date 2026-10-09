#!/usr/bin/env node
// Copies the web game into www/ for the iOS app (Capacitor's webDir).
//
//   npm run build:web          then `npx cap sync ios` (npm run ios does both)
//
// The app opens straight into Tractor Rally, and gets its own build id so
// the in-app update checker (js/update.js) stays off: the App Store ships
// updates, not version.json.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const COPY = ['index.html', 'privacy.html', 'manifest.webmanifest', 'css', 'js', 'icons'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);
for (const p of COPY) fs.cpSync(path.join(ROOT, p), path.join(OUT, p), { recursive: true });

// Leave the app-version meta as the __BUILD__ placeholder, which update.js
// treats as dev (no update checks), and mark the page as running in the app.
const index = path.join(OUT, 'index.html');
let html = fs.readFileSync(index, 'utf8');
html = html.replace('<html lang="en">', '<html lang="en" class="native-app">');
// In the app the page must never zoom: after a rotation iOS can otherwise
// keep the web view scaled for the old orientation, leaving the race too
// small and the screen part-covered.
html = html.replace(
  'content="width=device-width, initial-scale=1, viewport-fit=cover"',
  'content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"',
);
if (!html.includes('maximum-scale=1')) throw new Error('viewport meta not found in index.html');
fs.writeFileSync(index, html);
console.log(`Copied ${COPY.join(', ')} to www/`);
