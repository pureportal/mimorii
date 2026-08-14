const DEFAULT_PATH = "/app/operations/incidents";

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        payload = {};
      }
      const title = typeof payload.title === "string" ? payload.title : "Mimorii notification";
      const body = typeof payload.body === "string" ? payload.body : "";
      const path =
        typeof payload.path === "string" && /^\/app(?:\/|$)/.test(payload.path)
          ? payload.path
          : DEFAULT_PATH;
      await self.registration.showNotification(title, {
        body,
        icon: "/mimorii-app-icon.png",
        badge: "/mimorii-app-icon.png",
        tag: typeof payload.tag === "string" ? payload.tag : undefined,
        renotify: payload.severity === "warning",
        data: { path },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.path || DEFAULT_PATH;
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = windows[0];
      if (client) {
        if ("navigate" in client) await client.navigate(target);
        return client.focus();
      }
      return self.clients.openWindow(target);
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      if (!event.oldSubscription) return;
      const subscription = await self.registration.pushManager.subscribe(
        event.oldSubscription.options
      );
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      windows.forEach((client) =>
        client.postMessage({ type: "mimorii:push-subscription-changed", subscription }, [])
      );
    })()
  );
});
