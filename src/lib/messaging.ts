import { getMessaging, getToken, isSupported as isMessagingSupported, MessagePayload, onMessage } from 'firebase/messaging';
import { FIREBASE_VAPID_KEY, firebaseApp } from './firebase';
import { deactivateFcmToken, upsertFcmToken } from '../services/campService';
import { NotificationTypeKey } from '../types/camp';

const PROMPT_DISMISSED_KEY = 'moaskar_notif_prompt_dismissed';
const TOKEN_HASH_STORAGE_KEY = 'moaskar_fcm_token_id';
const RAW_TOKEN_STORAGE_KEY = 'moaskar_fcm_raw_token';

export type PushSupportStatus =
  | 'ready'
  | 'default'
  | 'denied'
  | 'unsupported'
  | 'missing_vapid';

export interface ForegroundPushEvent {
  notificationId: string;
  type: NotificationTypeKey;
  title: string;
  body: string;
  targetTab: string;
}

function computeDeterministicTokenId(token: string): string {
  // FNV-1a dual-lane hash -> purely alphanumeric safe document ID <= 128 chars
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(36);
  const part2 = (h2 >>> 0).toString(36);
  return `tok_${part1}_${part2}`;
}

export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let os = 'Web';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} · ${os}`.slice(0, 80);
}

export function isVapidConfigured(): boolean {
  return FIREBASE_VAPID_KEY.length >= 40;
}

export async function isWebPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  return isMessagingSupported().catch(() => false);
}

export async function getPushStatus(): Promise<PushSupportStatus> {
  const supported = await isWebPushSupported();
  if (!supported) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (!isVapidConfigured()) return 'missing_vapid';
  if (Notification.permission === 'granted') return 'ready';
  return 'default';
}

export function wasPrePromptDismissed(): boolean {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPrePromptDismissed(): void {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
  } catch {
    // Ignore storage errors
  }
}

export function getStoredTokenId(): string | null {
  try {
    return localStorage.getItem(TOKEN_HASH_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
}

export interface RegisterPushResult {
  ok: boolean;
  status: PushSupportStatus | 'error';
  tokenId?: string;
  errorMessage?: string;
}

export async function requestAndRegisterPushToken(params: {
  uid: string;
  campId: string;
  askPermissionIfDefault?: boolean;
}): Promise<RegisterPushResult> {
  const { uid, campId, askPermissionIfDefault = false } = params;

  const supported = await isWebPushSupported();
  if (!supported) {
    return {
      ok: false,
      status: 'unsupported',
      errorMessage: 'المتصفح ده للأسف مش بيدعم إشعارات Web Push.',
    };
  }

  if (Notification.permission === 'denied') {
    return {
      ok: false,
      status: 'denied',
      errorMessage: 'اتعمل رفض لإذن الإشعارات في المتصفح. تقدر / تقدري تعمّل / تعملي سماح من إعدادات الموقع في المتصفح.',
    };
  }

  if (Notification.permission === 'default') {
    if (!askPermissionIfDefault) {
      return { ok: false, status: 'default' };
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      markPrePromptDismissed();
      return {
        ok: false,
        status: perm === 'denied' ? 'denied' : 'default',
        errorMessage:
          perm === 'denied'
            ? 'اتعمل رفض لإذن الإشعارات. مش هنطلب منك تاني، وتقدر / تقدري تفعّلها من إعدادات المتصفح في أي وقت.'
            : 'لسه متعملش سماح للإشعارات دلوقتي.',
      };
    }
  }

  if (!isVapidConfigured()) {
    return {
      ok: false,
      status: 'missing_vapid',
      errorMessage:
        'مفتاح Web Push (VITE_FIREBASE_VAPID_KEY) لسه مش متضاف في الإعدادات.',
    };
  }

  try {
    const registration = await getSwRegistration();
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return {
        ok: false,
        status: 'error',
        errorMessage: 'معرفناش نجيب كود الإشعارات للجهاز ده.',
      };
    }

    const tokenId = computeDeterministicTokenId(token);
    const prevRawToken = localStorage.getItem(RAW_TOKEN_STORAGE_KEY);
    const prevTokenId = localStorage.getItem(TOKEN_HASH_STORAGE_KEY);

    if (prevTokenId && prevTokenId !== tokenId && prevRawToken !== token) {
      await deactivateFcmToken(uid, prevTokenId).catch(() => undefined);
    }

    await upsertFcmToken({
      uid,
      campId,
      tokenId,
      token,
      deviceLabel: getDeviceLabel(),
    });

    try {
      localStorage.setItem(TOKEN_HASH_STORAGE_KEY, tokenId);
      localStorage.setItem(RAW_TOKEN_STORAGE_KEY, token);
    } catch {
      // Ignore storage errors
    }

    return { ok: true, status: 'ready', tokenId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 'error',
      errorMessage: msg.includes('messaging/permission-blocked')
        ? 'الإشعارات مقفولة من إعدادات المتصفح.'
        : 'معرفناش نفعّل إشعارات الجهاز دلوقتي، جرب / جربي تاني بعد شوية.',
    };
  }
}

export async function unregisterDevicePushToken(uid: string): Promise<void> {
  const tokenId = getStoredTokenId();
  if (!tokenId) return;
  await deactivateFcmToken(uid, tokenId).catch(() => undefined);
}

export async function subscribeForegroundPush(
  onReceive: (event: ForegroundPushEvent) => void
): Promise<() => void> {
  const supported = await isWebPushSupported();
  if (!supported || !isVapidConfigured()) {
    return () => undefined;
  }

  try {
    const messaging = getMessaging(firebaseApp);
    const unsub = onMessage(messaging, (payload: MessagePayload) => {
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || 'معسكر مغلق';
      const body = data.body || payload.notification?.body || '';
      const type = (data.type as NotificationTypeKey) || 'new_day';
      const targetTab = data.targetTab || 'dashboard';
      const notificationId = data.notificationId || `push_${Date.now()}`;
      onReceive({
        notificationId,
        type,
        title,
        body,
        targetTab,
      });
    });
    return unsub;
  } catch {
    return () => undefined;
  }
}
