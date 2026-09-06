const CACHE = "ai-tsekh-map-static-2026-09-06-v4";
const FILES = [
  "./index.html",
  "./app.js",
  "./state.js",
  "./render.js",
  "./styles.css",
  "./data/products.json",
  "./data/external-ring.json",
];
const BASE = new URL(".", self.registration.scope).pathname;

self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(FILES.map((f) => new URL(f, self.registration.scope).href)),
      )
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ai-tsekh-map-static-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET")
    return;
  const path = url.pathname.startsWith(BASE)
    ? url.pathname.slice(BASE.length)
    : url.pathname;
  if (
    event.request.mode === "navigate" &&
    ["", "index.html", "map", "map/"].includes(path)
  ) {
    event.respondWith(
      caches
        .match(new URL("./index.html", self.registration.scope).href)
        .then((cached) => cached || fetch(event.request)),
    );
    return;
  }
  const file = FILES.find((f) => f.slice(2) === path);
  if (file)
    event.respondWith(
      caches
        .match(new URL(file, self.registration.scope).href)
        .then((cached) => cached || fetch(event.request)),
    );
});
