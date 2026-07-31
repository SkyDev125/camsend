const CACHE = "camsend-v2";
const ASSETS = [
  "./", "./index.html", "./app.js", "./styles.css", "./manifest.webmanifest",
  "./generated/core/bytes.js", "./generated/core/crc32.js", "./generated/core/fountain.js", "./generated/core/glyph-frame.js", "./generated/core/hamming.js", "./generated/core/math.js", "./generated/core/optical-frame.js", "./generated/core/prng.js", "./generated/core/protocol.js", "./generated/core/reed-solomon.js", "./generated/core/transfer.js"
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }))));
