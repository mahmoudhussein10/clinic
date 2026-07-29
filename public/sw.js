self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "لديك إشعار جديد" }; }
  event.waitUntil(self.registration.showNotification(data.title || "عيادة الريم", {
    body: data.body || "لديك إشعار جديد",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/badge-96.png",
    tag: data.tag || "alreem-notification",
    renotify: data.priority === "urgent",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) { if ("focus" in client) { client.navigate(target); return client.focus(); } }
    return self.clients.openWindow(target);
  }));
});
