/* Unified DUO CAMP Web Push Service Worker Handler (imported by /sw.js) */

function buildTargetAppUrl(targetRoute, notificationId, subscriptionId) {
  const params = new URLSearchParams();
  if (notificationId) params.set('notif', String(notificationId));
  if (targetRoute) params.set('to', String(targetRoute));
  if (subscriptionId) params.set('sub', String(subscriptionId));
  const qs = params.toString();
  return new URL(qs ? `/?${qs}` : '/', self.location.origin).href;
}

function sendBackgroundAck(payload, eventName) {
  if (!payload || !payload.notificationId || !payload.subscriptionId || !payload.ackToken) {
    return Promise.resolve();
  }
  return fetch('/api/push/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notificationId: payload.notificationId,
      subscriptionId: payload.subscriptionId,
      ackToken: payload.ackToken,
      event: eventName,
    }),
  }).catch(function () {
    return undefined;
  });
}

self.addEventListener('push', function (event) {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (_err) {
      try {
        payload = { body: event.data.text() };
      } catch (_err2) {
        payload = {};
      }
    }
  }

  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : 'إشعار جديد من معسكر مغلق';
  const body =
    typeof payload.body === 'string' && payload.body.trim()
      ? payload.body.trim()
      : 'عندك رسالة جديدة جوه منصة DUO CAMP.';
  const notificationId =
    typeof payload.notificationId === 'string' ? payload.notificationId : '';
  const subscriptionId =
    typeof payload.subscriptionId === 'string' ? payload.subscriptionId : '';
  const ackToken = typeof payload.ackToken === 'string' ? payload.ackToken : '';
  const targetRoute =
    typeof payload.targetRoute === 'string' && payload.targetRoute
      ? payload.targetRoute
      : 'notification_view';
  const imageUrl =
    typeof payload.imageUrl === 'string' && /^https?:\/\//i.test(payload.imageUrl)
      ? payload.imageUrl
      : undefined;

  const options = {
    body: body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: notificationId ? `duocamp_bc_${notificationId}` : 'duocamp_bc_default',
    renotify: false,
    requireInteraction: false,
    vibrate: [140, 60, 140],
    data: {
      notificationId: notificationId,
      subscriptionId: subscriptionId,
      ackToken: ackToken,
      targetRoute: targetRoute,
      url: buildTargetAppUrl(targetRoute, notificationId, subscriptionId),
    },
  };

  if (imageUrl) {
    options.image = imageUrl;
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      sendBackgroundAck(
        { notificationId: notificationId, subscriptionId: subscriptionId, ackToken: ackToken },
        'delivered'
      ),
    ])
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const data = (event.notification && event.notification.data) || {};
  const notificationId = data.notificationId || '';
  const subscriptionId = data.subscriptionId || '';
  const ackToken = data.ackToken || '';
  const targetRoute = data.targetRoute || 'notification_view';
  const destinationUrl =
    data.url || buildTargetAppUrl(targetRoute, notificationId, subscriptionId);

  const ackPromise = sendBackgroundAck(
    { notificationId: notificationId, subscriptionId: subscriptionId, ackToken: ackToken },
    'opened'
  );

  const navPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'DUO_CAMP_PUSH_NAVIGATE',
            notificationId: notificationId,
            targetRoute: targetRoute,
            subscriptionId: subscriptionId,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(destinationUrl);
      }
      return undefined;
    });

  event.waitUntil(Promise.all([ackPromise, navPromise]));
});
