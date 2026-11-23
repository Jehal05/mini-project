// Service worker for hospital alerts when the portal tab is closed (feature 61).
self.addEventListener('push', (event) => {
  let data = { title: 'Cardiac emergency', body: 'A new emergency needs your response.' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      requireInteraction: true,
      tag: data.caseId || 'emergency',
      data: { caseId: data.caseId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((wins) => (wins.length ? wins[0].focus() : self.clients.openWindow('/'))),
  );
});
