import {
  Analytics,
  getAnalytics,
  isSupported as isAnalyticsSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
} from 'firebase/analytics';
import { firebaseApp, GA_MEASUREMENT_ID } from './firebase';
import { ActiveTab, AnalyticsConsentStatus, MessageTypeKey, StudySubjectKey, SubjectKey, SurpriseKind, TaskTypeKey } from '../types/camp';

const CONSENT_STORAGE_KEY = 'moaskar_analytics_consent';
const GA_SCRIPT_ELEMENT_ID = 'moaskar-ga4-gtag-script';

export type AnalyticsScreenKey =
  | ActiveTab
  | 'little_question'
  | 'admin_exam_panel'
  | 'azkar'
  | 'auth_login'
  | 'auth_profile'
  | 'auth_camp';

const SCREEN_META: Record<AnalyticsScreenKey, { path: string; title: string }> = {
  group_camps: { path: '/group-camps', title: 'معسكر مغلق — المعسكرات الجماعية' },
  little_question: { path: '/little-question', title: 'معسكر مغلق — سؤال صغنن' },
  admin_exam_panel: { path: '/admin-exam-panel', title: 'معسكر مغلق — لوحة الأدمن' },
  azkar: { path: '/azkar', title: 'معسكر مغلق — ركن الأذكار' },
  auth_login: { path: '/auth/login', title: 'معسكر مغلق — تسجيل الدخول' },
  auth_profile: { path: '/auth/profile', title: 'معسكر مغلق — إعداد الملف الشخصي' },
  auth_camp: { path: '/auth/camp', title: 'معسكر مغلق — المعسكرات الجماعية' },
};

const SENSITIVE_PARAM_KEYS = new Set([
  'content',
  'text',
  'body',
  'note',
  'notes',
  'email',
  'displayName',
  'name',
  'senderName',
  'phone',
  'token',
  'fcmToken',
  'inviteCode',
  'avatarUrl',
  'imageUrl',
]);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;
let lastTrackedScreenKey: string | null = null;
let initialTrafficCaptured = false;
const recentEventTimestamps = new Map<string, number>();

export function isValidMeasurementId(id: string): boolean {
  return /^G-[A-Z0-9]{6,16}$/i.test(id.trim());
}

export function isAnalyticsConfigured(): boolean {
  return isValidMeasurementId(GA_MEASUREMENT_ID);
}

export function hasGlobalPrivacyControl(): boolean {
  if (typeof navigator === 'undefined') return false;
  return Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
}

export function getAnalyticsConsent(): AnalyticsConsentStatus {
  if (hasGlobalPrivacyControl()) {
    return 'denied';
  }
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === 'granted' || raw === 'denied') return raw;
    return 'unset';
  } catch {
    return 'unset';
  }
}

function getDeviceCategory(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function getTrafficSourceParams(): Record<string, string> {
  if (typeof window === 'undefined' || initialTrafficCaptured) return {};
  initialTrafficCaptured = true;
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  const utmSource = params.get('utm_source')?.trim();
  const utmMedium = params.get('utm_medium')?.trim();
  const utmCampaign = params.get('utm_campaign')?.trim();
  if (utmSource) out.campaign_source = utmSource.slice(0, 64);
  if (utmMedium) out.campaign_medium = utmMedium.slice(0, 64);
  if (utmCampaign) out.campaign_name = utmCampaign.slice(0, 64);
  if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      if (refUrl.hostname && refUrl.hostname !== window.location.hostname) {
        out.referrer_domain = refUrl.hostname.slice(0, 80);
      }
    } catch {
      // Ignore invalid referrer
    }
  }
  return out;
}

function bootstrapGtagStub(measurementId: string): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  // Disable automatic initial page_view so SPA tab navigation emits a single clean page_view
  window.gtag('config', measurementId, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

function injectGtagScript(measurementId: string): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(GA_SCRIPT_ELEMENT_ID)) return;
  const script = document.createElement('script');
  script.id = GA_SCRIPT_ELEMENT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export async function initAnalyticsIfConsented(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (!isAnalyticsConfigured()) return null;
  if (getAnalyticsConsent() !== 'granted') return null;
  if (analyticsInstance) return analyticsInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      window[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
      bootstrapGtagStub(GA_MEASUREMENT_ID);
      injectGtagScript(GA_MEASUREMENT_ID);

      window.gtag?.('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });

      const supported = await isAnalyticsSupported().catch(() => false);
      if (supported) {
        analyticsInstance = getAnalytics(firebaseApp);
        setAnalyticsCollectionEnabled(analyticsInstance, true);
      }
      return analyticsInstance;
    } catch (err) {
      console.warn('Analytics initialization skipped:', err);
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function setAnalyticsConsent(status: 'granted' | 'denied'): Promise<void> {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, status);
  } catch {
    // Ignore storage errors
  }

  if (typeof window === 'undefined') return;

  if (status === 'denied') {
    if (GA_MEASUREMENT_ID) {
      window[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
    }
    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    if (analyticsInstance) {
      setAnalyticsCollectionEnabled(analyticsInstance, false);
    }
    lastTrackedScreenKey = null;
    return;
  }

  if (GA_MEASUREMENT_ID) {
    window[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
  }
  await initAnalyticsIfConsented();
}

function sanitizeParams(
  params?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  if (!params) return safe;
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (SENSITIVE_PARAM_KEYS.has(k)) continue;
    if (!/^[a-z][a-z0-9_]{0,39}$/i.test(k)) continue;
    if (typeof v === 'string') {
      safe[k] = v.slice(0, 100);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      safe[k] = v;
    } else if (typeof v === 'boolean') {
      safe[k] = v;
    }
  }
  return safe;
}

function shouldDeduplicate(signature: string, windowMs = 600): boolean {
  const now = Date.now();
  const prev = recentEventTimestamps.get(signature);
  if (prev !== undefined && now - prev < windowMs) {
    return true;
  }
  recentEventTimestamps.set(signature, now);
  if (recentEventTimestamps.size > 100) {
    for (const [k, ts] of recentEventTimestamps.entries()) {
      if (now - ts > 10_000) recentEventTimestamps.delete(k);
    }
  }
  return false;
}

function sendRawGaEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>,
  dedupKey?: string
): void {
  if (typeof window === 'undefined') return;
  if (!isAnalyticsConfigured() || getAnalyticsConsent() !== 'granted') return;

  const safeParams = sanitizeParams(params);
  const sig = dedupKey || `${eventName}:${JSON.stringify(safeParams)}`;
  if (shouldDeduplicate(sig)) return;

  void initAnalyticsIfConsented().then((analytics) => {
    if (getAnalyticsConsent() !== 'granted') return;
    if (analytics) {
      logEvent(analytics, eventName, safeParams);
    } else if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, {
        ...safeParams,
        send_to: GA_MEASUREMENT_ID,
      });
    }
  });
}

export function trackPageView(screenKey: AnalyticsScreenKey, hasCamp = false): void {
  if (getAnalyticsConsent() !== 'granted' || !isAnalyticsConfigured()) return;
  if (lastTrackedScreenKey === screenKey) return;
  lastTrackedScreenKey = screenKey;

  const meta = SCREEN_META[screenKey];
  const traffic = getTrafficSourceParams();

  sendRawGaEvent(
    'page_view',
    {
      page_title: meta.title,
      page_path: meta.path,
      page_location: `${window.location.origin}${meta.path}`,
      screen_name: screenKey,
      device_category: getDeviceCategory(),
      has_active_camp: hasCamp,
      ...traffic,
    },
    `page_view:${screenKey}`
  );
}

// --- Required GA4 Custom Events (Zero PII) ---

export type AuthTrackingMethod = 'phone_password' | 'phone_recovery' | 'google';

export function trackUserSignup(method: AuthTrackingMethod = 'phone_password'): void {
  sendRawGaEvent('user_signup', { method }, `user_signup:${method}`);
}

export function trackUserLogin(method: AuthTrackingMethod = 'phone_password'): void {
  sendRawGaEvent('user_login', { method }, `user_login:${method}`);
}

export function trackCampCreated(): void {
  sendRawGaEvent('camp_created', { duration_days: 20 });
}

export function trackCampJoined(): void {
  sendRawGaEvent('camp_joined', { duration_days: 20 });
}

export function trackTaskCompleted(params: {
  subject: SubjectKey;
  taskType: TaskTypeKey;
  day: number;
  becameBothDone: boolean;
}): void {
  sendRawGaEvent('task_completed', {
    subject: params.subject,
    task_type: params.taskType,
    day_number: params.day,
    both_partners_done: params.becameBothDone,
  });
}

export function trackDailyTasksCompleted(params: {
  day: number;
  totalTasksInDay: number;
  bothDone: boolean;
}): void {
  sendRawGaEvent(
    'daily_tasks_completed',
    {
      day_number: params.day,
      tasks_count: params.totalTasksInDay,
      both_partners_done: params.bothDone,
    },
    `daily_tasks_completed:${params.day}:${params.bothDone}`
  );
}

export function trackMessageSent(params: {
  channel: 'messages' | 'little_question';
  messageType: MessageTypeKey | 'question';
  isReply: boolean;
  isBanner: boolean;
  hasImage: boolean;
}): void {
  sendRawGaEvent('message_sent', {
    channel: params.channel,
    message_type: params.messageType,
    is_reply: params.isReply,
    is_banner: params.isBanner,
    has_image: params.hasImage,
  });
}

export function trackSurpriseSent(params: { kind: SurpriseKind }): void {
  sendRawGaEvent('surprise_sent', { surprise_kind: params.kind });
}

export function trackPomodoroStarted(params: {
  subject: StudySubjectKey;
  plannedMinutes: number;
}): void {
  sendRawGaEvent('pomodoro_started', {
    subject: params.subject,
    planned_minutes: params.plannedMinutes,
  });
}

export function trackPomodoroCompleted(params: {
  subject: StudySubjectKey;
  durationMinutes: number;
  day: number;
}): void {
  sendRawGaEvent('pomodoro_completed', {
    subject: params.subject,
    duration_minutes: params.durationMinutes,
    day_number: params.day,
  });
}
