/* Spine Hunter offline support: keeps the app and covers available without internet. */
const VERSION = "spine-hunter-0.9.3";
const SHELL = ["./", "index.html", "app.css", "firebase.js", "config.js", "data.js", "core.js", "tools.js", "ui.js", "creatures.js", "more.js", "cloud.js", "privacy.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "creatures/adventure.png", "creatures/comedy.png", "creatures/cosy_mystery.png", "creatures/crime.png", "creatures/crime_thriller.png", "creatures/dark_romance.png", "creatures/fantasy.png", "creatures/fantasy_adventure.png", "creatures/fantasy_romance.png", "creatures/historical.png", "creatures/historical_fiction.png", "creatures/historical_romance.png", "creatures/horror.png", "creatures/horror_comedy.png", "creatures/literary.png", "creatures/mystery.png", "creatures/nonfiction.png", "creatures/romance.png", "creatures/romcom.png", "creatures/scifi.png", "creatures/scifi_thriller.png", "creatures/thriller.png", "creatures/true_crime.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== "covers").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // the app itself: use the network when online so updates arrive, fall back to the saved copy offline
    // no-cache: always ask GitHub whether the file has changed, so a new upload shows on the next open
    e.respondWith(fetch(req, { cache: "no-cache" }).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
  } else if (req.destination === "image") {
    // book covers: keep a copy so they show offline
    e.respondWith(caches.open("covers").then(c => c.match(req).then(hit => hit || fetch(req).then(r => { c.put(req, r.clone()); return r; }))));
  }
});
