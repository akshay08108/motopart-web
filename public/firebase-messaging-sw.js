/* global firebase */
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDl38pRlgpMCqaeKe5gSj8263FSGS9z-UQ",
  authDomain: "partx-production.firebaseapp.com",
  projectId: "partx-production",
  storageBucket: "partx-production.firebasestorage.app",
  messagingSenderId: "536857278497",
  appId: "1:536857278497:web:8ba54cf1ee68a7a96c0b60",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const title = payload.data?.title || "PartX update";
  self.registration.showNotification(title, {
    body: payload.data?.body || "Open PartX to see the latest update.",
    icon: "/brand/partx-light.png",
    badge: "/brand/partx-light.png",
    data: { link: payload.data?.link || "/" },
    tag: payload.data?.tag || "partx-update",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = new URL(event.notification.data?.link || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.navigate(link).then(() => existing.focus());
    return clients.openWindow(link);
  }));
});
