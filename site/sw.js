// Network-first service worker: keeps the app installable and loads fresh code after each deploy.
const CACHE = "pc-shell-v3";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("chat.html");
  }));
});

// Web Push: show a notification unless the chat is already open and focused.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: "Private Chat", body: e.data ? e.data.text() : "New message" }; }
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.some((c) => c.visibilityState === "visible" && c.focused)) return;
      return self.registration.showNotification(d.title || "Private Chat", {
        body: d.body || "", tag: d.tag || "msg", renotify: true,
        icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "chat.html" },
      });
    })
  );
});

// Share target: files shared from the phone's Share menu are parked in a cache, then the chat picks them up.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "POST" || !url.pathname.endsWith("/share-target")) return;
  e.respondWith((async () => {
    try {
      const fd = await e.request.formData();
      const cache = await caches.open("share");
      for (const k of await cache.keys()) await cache.delete(k);
      const files = fd.getAll("media").filter((f) => typeof f !== "string");
      for (const [i, f] of files.entries())
        await cache.put("/shared/" + i, new Response(f, { headers: { "Content-Type": f.type, "X-Name": encodeURIComponent(f.name) } }));
      const text = [fd.get("title"), fd.get("text"), fd.get("url")].filter(Boolean).join("\n");
      if (text) await cache.put("/shared/text", new Response(text));
    } catch {}
    return Response.redirect("chat.html?share=1", 303);
  })());
});
