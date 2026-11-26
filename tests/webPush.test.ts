import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Group Push Broadcast security, opt-out, and unified Service Worker architecture contract checks', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
  const blueprint = fs.readFileSync(path.resolve('firebase-blueprint.json'), 'utf8');
  const server = fs.readFileSync(path.resolve('server.ts'), 'utf8');
  const viteConfig = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');
  const swHandler = fs.readFileSync(path.resolve('public/push-sw-handler.js'), 'utf8');
  const webPush = fs.readFileSync(path.resolve('src/lib/webPush.ts'), 'utf8');
  const pushService = fs.readFileSync(path.resolve('src/services/pushNotificationService.ts'), 'utf8');
  const adminTab = fs.readFileSync(path.resolve('src/components/AdminPushBroadcastTab.tsx'), 'utf8');
  const adminPortal = fs.readFileSync(path.resolve('src/components/AdminPortalView.tsx'), 'utf8');
  const modals = fs.readFileSync(path.resolve('src/components/Modals.tsx'), 'utf8');

  // 1. Firestore rules & blueprint strictly define pushSubscriptions, adminBroadcastNotifications & deliveries
  assert.ok(rules.includes('isValidPushSubscription'));
  assert.ok(rules.includes('isValidAdminBroadcastNotification'));
  assert.ok(rules.includes('isValidBroadcastDelivery'));
  assert.ok(rules.includes('match /pushSubscriptions/{subId}'));
  assert.ok(rules.includes('match /adminBroadcastNotifications/{notifId}'));
  assert.ok(rules.includes('match /deliveries/{deliveryId}'));
  assert.ok(blueprint.includes('"PushSubscription"'));
  assert.ok(blueprint.includes('"AdminBroadcastNotification"'));

  // 2. Express server holds VAPID private key only in server memory/env, never exposes it to client,
  //    enforces dual Admin verification (gate token + Google-signed Firebase ID token), and blocks SSRF endpoints
  assert.ok(server.includes('VAPID_PRIVATE_KEY'));
  assert.ok(!server.includes('publicKey: envVapidPrivate'));
  assert.ok(server.includes("app.get('/api/push/public-key'"));
  assert.ok(server.includes("app.post('/api/push/ack'"));
  assert.ok(server.includes("app.post('/api/admin/push/send'"));
  assert.ok(server.includes('verifyAdminFirebaseIdToken'));
  assert.ok(server.includes('verifyGateToken'));
  assert.ok(server.includes('isSafeHttpsPushEndpoint'));
  assert.ok(server.includes('statusCode === 404 || statusCode === 410'));

  // 3. Unified classic PWA + Push Service Worker wiring & legacy SW cleanup
  assert.ok(viteConfig.includes("'/push-sw-handler.js'"));
  assert.ok(viteConfig.includes("type: 'classic'"));
  assert.ok(swHandler.includes("self.addEventListener('push'"));
  assert.ok(swHandler.includes("self.addEventListener('notificationclick'"));
  assert.ok(swHandler.includes('/api/push/ack'));
  assert.ok(webPush.includes('cleanupLegacyMessagingWorkers'));
  assert.ok(webPush.includes('computeDeterministicSubscriptionId'));

  // 4. Opt-out enforcement & Admin "إرسال إشعارات" UI integration
  assert.ok(pushService.includes("s.consentState !== 'opt_out'"));
  assert.ok(pushService.includes('deleteStudentPushSubscription'));
  assert.ok(adminPortal.includes('إرسال إشعارات'));
  assert.ok(adminTab.includes('اختيار المستلمين من الطلاب المسجلين'));
  assert.ok(adminTab.includes('معاينة صورة الإشعار'));
  assert.ok(modals.includes('إشعارات المنصة الفورية'));
  assert.ok(modals.includes('PWAInstallSection'));
});
