const CACHE = "gpaytrack-v7";
const STATIC = ["/", "/index.html", "/manifest.json", "/sw.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Handle share target POST
  if (url.pathname === "/share-target" && e.request.method === "POST") {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const file = fd.get("image");
        if (file) {
          const ab = await file.arrayBuffer();
          const bytes = new Uint8Array(ab);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.byteLength; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const b64 = btoa(binary);
          const payload = JSON.stringify({ b64, type: file.type || "image/jpeg", ts: Date.now() });

          // Try multiple storage methods
          // Method 1: Cache API
          try {
            const cache = await caches.open(CACHE);
            await cache.put("/__shared_image__", new Response(payload, {
              headers: { "Content-Type": "application/json" }
            }));
          } catch(e) { console.log("cache store failed", e); }

          // Method 2: Notify all open clients directly
          const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
          for (const client of clients) {
            client.postMessage({ type: "SHARED_IMAGE", b64, imgType: file.type || "image/jpeg" });
          }
        }
      } catch(err) {
        console.error("Share error:", err);
      }
      return Response.redirect("/?shared=1", 303);
    })());
    return;
  }

  if (e.request.mode === "navigate") {
    e.respondWith(caches.match("/index.html").then(r => r || fetch(e.request)));
    return;
  }

  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
