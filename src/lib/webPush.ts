import {
  deleteStudentPushSubscription,
  fetchStudentPushConsent,
  saveStudentPushSubscription,
  setStudentBroadcastConsent,
} from '../services/pushNotificationService';

const SUB_ID_STORAGE_KEY = 'duocamp_push_sub_id';
const BANNER_DISMISSED_KEY = 'duocamp_broadcast_prompt_dismissed';

export type StudentPushUiState =
  | 'ready'
  | 'needs_permission'
  | 'opted_out'
  | 'denied'
  | 'ios_install_required'
  | 'unsupported';

export interface PushEnvInfo {
  supported: boolean;
  iosInstallRequired: boolean;
  permission: NotificationPermission | 'unsupported';
  platform: 'android' | 'ios' | 'desktop' | 'web';
  installMode: 'pwa' | 'browser';
  deviceLabel: string;
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    nav.standalone === true
  );
}

export function getPushEnvironmentInfo(): PushEnvInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      iosInstallRequired: false,
      permission: 'unsupported',
      platform: 'web',
      installMode: 'browser',
      deviceLabel: 'Web',
    };
  }

  const ua = navigator.userAgent || '';
  const ios = isIOSDevice();
  const standalone = isRunningStandalone();
  const hasApis =
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let platform: 'android' | 'ios' | 'desktop' | 'web' = 'web';
  let osLabel = 'Web';
  if (/Android/i.test(ua)) {
    platform = 'android';
    osLabel = 'Android';
  } else if (ios) {
    platform = 'ios';
    osLabel = 'iOS';
  } else if (/Windows|Mac OS X|Linux/i.test(ua)) {
    platform = 'desktop';
    osLabel = /Windows/i.test(ua)
      ? 'Windows'
      : /Mac OS X/i.test(ua)
        ? 'macOS'
        : 'Linux';
  }

  const installMode: 'pwa' | 'browser' = standalone ? 'pwa' : 'browser';
  const deviceLabel = `${browser} · ${osLabel}${standalone ? ' (تطبيق)' : ''}`.slice(0, 80);

  return {
    supported: hasApis,
    iosInstallRequired: ios && !standalone,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    platform,
    installMode,
    deviceLabel,
  };
}

export function computeDeterministicSubscriptionId(endpoint: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < endpoint.length; i++) {
    const code = endpoint.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `sub_${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

export function getStoredSubscriptionId(): string {
  try {
    return localStorage.getItem(SUB_ID_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function wasBroadcastBannerDismissed(): boolean {
  try {
    return localStorage.getItem(BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markBroadcastBannerDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(BANNER_DISMISSED_KEY, '1');
    } else {
      localStorage.removeItem(BANNER_DISMISSED_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function cleanupLegacyMessagingWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (reg) => {
        const scriptUrl =
          reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (scriptUrl.includes('firebase-messaging-sw.js')) {
          await reg.unregister().catch(() => false);
        }
      })
    );
  } catch {
    // Non-fatal
  }
}

async function getUnifiedSwRegistration(): Promise<ServiceWorkerRegistration> {
  await cleanupLegacyMessagingWorkers();
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('المتصفح مش راضي يجهّز خدمة الإشعارات دلوقتي.')), 8000)
  );
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing && existing.active) {
    return existing;
  }
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function fetchVapidPublicKey(): Promise<{ publicKey: string; persistent: boolean }> {
  const res = await fetch('/api/push/public-key', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('مش عارفين نجيب مفتاح الإشعارات من السيرفر دلوقتي.');
  }
  const data = (await res.json()) as {
    ok?: boolean;
    publicKey?: string;
    persistent?: boolean;
  };
  if (!data.ok || !data.publicKey) {
    throw new Error('سيرفر الإشعارات مش جاهز دلوقتي.');
  }
  return { publicKey: data.publicKey, persistent: Boolean(data.persistent) };
}

export interface EnableWebPushResult {
  ok: boolean;
  state: StudentPushUiState | 'error';
  subId?: string;
  errorMessage?: string;
}

export async function enableWebPushForStudent(params: {
  uid: string;
  askPermissionIfDefault: boolean;
  preRequestedPermission?: NotificationPermission;
}): Promise<EnableWebPushResult> {
  const { uid, askPermissionIfDefault, preRequestedPermission } = params;
  const env = getPushEnvironmentInfo();

  if (env.iosInstallRequired) {
    return {
      ok: false,
      state: 'ios_install_required',
      errorMessage:
        'على أجهزة iPhone وiPad، لازم الأول تثبت / تثبتي المنصة على الشاشة الرئيسية وبعدها تفعّل / تفعّلي الإشعارات من جوه التطبيق نفسه.',
    };
  }

  if (!env.supported) {
    return {
      ok: false,
      state: 'unsupported',
      errorMessage: 'المتصفح ده للأسف مش بيدعم إشعارات Web Push.',
    };
  }

  const effectivePermission = preRequestedPermission || Notification.permission;

  if (effectivePermission === 'denied') {
    return {
      ok: false,
      state: 'denied',
      errorMessage:
        'إذن الإشعارات مقفول من إعدادات المتصفح. افتح / افتحي إعدادات الموقع في المتصفح واعمل / اعملي سماح للإشعارات وبعدين جرب / جربي تاني.',
    };
  }

  if (effectivePermission === 'default') {
    if (!askPermissionIfDefault) {
      return { ok: false, state: 'needs_permission' };
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      if (perm === 'denied') {
        await setStudentBroadcastConsent({ uid, enabled: false }).catch(() => undefined);
      }
      return {
        ok: false,
        state: perm === 'denied' ? 'denied' : 'needs_permission',
        errorMessage:
          perm === 'denied'
            ? 'اتعمل رفض لإذن الإشعارات. مش هنزعجك تاني، وتقدر / تقدري تعمل / تعملي سماح من إعدادات المتصفح في أي وقت.'
            : 'الإشعارات متفعلتش دلوقتي.',
      };
    }
  }

  try {
    const [reg, vapid] = await Promise.all([
      getUnifiedSwRegistration(),
      fetchVapidPublicKey(),
    ]);

    const desiredAppKey = urlBase64ToUint8Array(vapid.publicKey);
    let sub = await reg.pushManager.getSubscription();

    if (sub) {
      const currentAppKeyBuf = sub.options?.applicationServerKey;
      const keyMismatch =
        currentAppKeyBuf &&
        !uint8ArraysEqual(new Uint8Array(currentAppKeyBuf), desiredAppKey);
      if (keyMismatch) {
        await sub.unsubscribe().catch(() => false);
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: desiredAppKey as unknown as BufferSource,
      });
    }

    const endpoint = sub.endpoint;
    const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh'));
    const authKey = arrayBufferToBase64Url(sub.getKey('auth'));
    if (!endpoint || !p256dh || !authKey) {
      throw new Error('بيانات اشتراك المتصفح ناقصة، جرب / جربي تاني.');
    }

    const subId = computeDeterministicSubscriptionId(endpoint);
    const prevSubId = getStoredSubscriptionId();
    if (prevSubId && prevSubId !== subId) {
      await deleteStudentPushSubscription(uid, prevSubId).catch(() => undefined);
    }

    await saveStudentPushSubscription({
      uid,
      subId,
      endpoint,
      p256dh,
      auth: authKey,
      platform: env.platform,
      installMode: env.installMode,
      deviceLabel: env.deviceLabel,
    });

    await setStudentBroadcastConsent({ uid, enabled: true });
    markBroadcastBannerDismissed(false);

    try {
      localStorage.setItem(SUB_ID_STORAGE_KEY, subId);
    } catch {
      // Ignore storage errors
    }

    return { ok: true, state: 'ready', subId };
  } catch (err) {
    return {
      ok: false,
      state: 'error',
      errorMessage:
        err instanceof Error && err.message
          ? err.message
          : 'معرفناش نفعّل الإشعارات على الجهاز ده. اتأكد / اتأكدي من النت وجرب / جربي تاني.',
    };
  }
}

export async function optOutWebPushForStudent(uid: string): Promise<void> {
  const subId = getStoredSubscriptionId();
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        const computedId = computeDeterministicSubscriptionId(sub.endpoint);
        await sub.unsubscribe().catch(() => false);
        await deleteStudentPushSubscription(uid, computedId).catch(() => undefined);
      }
    }
  } catch {
    // Continue ensuring Firestore opt-out state is written
  }

  if (subId) {
    await deleteStudentPushSubscription(uid, subId).catch(() => undefined);
  }
  await setStudentBroadcastConsent({ uid, enabled: false });

  try {
    localStorage.removeItem(SUB_ID_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export async function resolveStudentPushState(uid: string): Promise<{
  state: StudentPushUiState;
  hasExplicitPreference: boolean;
}> {
  const env = getPushEnvironmentInfo();
  const consent = await fetchStudentPushConsent(uid);

  if (consent.hasDoc && !consent.enabled) {
    return { state: 'opted_out', hasExplicitPreference: true };
  }
  if (env.iosInstallRequired) {
    return { state: 'ios_install_required', hasExplicitPreference: consent.hasDoc };
  }
  if (!env.supported) {
    return { state: 'unsupported', hasExplicitPreference: consent.hasDoc };
  }
  if (env.permission === 'denied') {
    return { state: 'denied', hasExplicitPreference: consent.hasDoc };
  }

  if (env.permission === 'granted' && consent.enabled) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        return { state: 'ready', hasExplicitPreference: consent.hasDoc };
      }
    } catch {
      // Fall through to needs_permission
    }
  }

  return { state: 'needs_permission', hasExplicitPreference: consent.hasDoc };
}

export async function syncActiveWebPushIfGranted(uid: string): Promise<void> {
  try {
    const env = getPushEnvironmentInfo();
    if (!env.supported || env.iosInstallRequired || env.permission !== 'granted') return;
    const consent = await fetchStudentPushConsent(uid);
    // Respect explicit opt-out strictly
    if (consent.hasDoc && !consent.enabled) return;
    await enableWebPushForStudent({ uid, askPermissionIfDefault: false });
  } catch {
    // Silent background sync
  }
}
