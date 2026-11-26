/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js');

// Public Firebase Web Client configuration (never store Admin SDK or server keys here)
firebase.initializeApp({
  projectId: 'elliptical-manifest-7zbz0',
  appId: '1:270346132200:web:0ff924b98c737b4577075d',
  apiKey: atob('QUl6YVN5QWhDOVg5R1FmLWhNRG5CcTZDWm5ITDB6QW5VQjE4eDJ3'),
  authDomain: 'elliptical-manifest-7zbz0.firebaseapp.com',
  storageBucket: 'elliptical-manifest-7zbz0.firebasestorage.app',
  messagingSenderId: '270346132200',
});

const messaging = firebase.messaging();

const TAB_FALLBACK_BY_TYPE = {
  lecture_done: 'schedule',
  task_completed: 'schedule',
  new_message: 'messages',
  new_question: 'little_question',
  new_surprise: 'dashboard',
  new_day: 'dashboard',
  camp_ending: 'dashboard',
};

function resolveTargetTab(data) {
  if (data && typeof data.targetTab === 'string' && data.targetTab) {
    return data.targetTab;
  }
  if (data && typeof data.type === 'string' && TAB_FALLBACK_BY_TYPE[data.type]) {
    return TAB_FALLBACK_BY_TYPE[data.type];
  }
  return 'dashboard';
}

messaging.onBackgroundMessage((payload) => {
  // Avoid double-rendering if FCM already includes a top-level notification payload
  if (payload && payload.notification) {
    return;
  }

  const data = (payload && payload.data) || {};
  const title = data.title || 'معسكر مغلق';
  const body = data.body || 'تحديث جديد في معسكرك الدراسي';
  const targetTab = resolveTargetTab(data);
  const tag = data.notificationId || data.tag || `moaskar_${data.type || 'update'}`;
  const targetUrl = `/?tab=${encodeURIComponent(targetTab)}`;

  return self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    dir: 'rtl',
    lang: 'ar',
    tag,
    renotify: false,
    data: {
      tab: targetTab,
      url: targetUrl,
      notificationId: data.notificationId || '',
      type: data.type || 'new_day',
    },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const fcmData = notifData.FCM_MSG && notifData.FCM_MSG.data ? notifData.FCM_MSG.data : {};
  const targetTab = notifData.tab || resolveTargetTab(fcmData);
  const destinationUrl = new URL(`/?tab=${encodeURIComponent(targetTab)}`, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'MOASKAR_NAVIGATE_TAB',
              tab: targetTab,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(destinationUrl);
        }
        return undefined;
      })
  );
});
