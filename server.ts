import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import { normalizeAiParsedQuestions } from './src/lib/aiQuestionUtils.ts';

const PORT = Number(process.env.PORT) || 3000;
const FIREBASE_PROJECT_ID = 'elliptical-manifest-7zbz0';
const ADMIN_EMAIL_REGEX = /^201274011475(?:\.r[0-9]{1,16})?@phone\.moaskar\.app$/i;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 15;
const AI_RATE_LIMIT_MAX_REQUESTS = 20;
const PUSH_SEND_RATE_LIMIT_MAX = 30;
const AI_MAX_RAW_TEXT_CHARS = 120_000;
const MAX_PUSH_MEDIA_ENTRIES = 60;
const MAX_PUSH_IMAGE_BYTES = 450 * 1024;
const PUSH_ACKS_TMP_PATH = '/tmp/duocamp_push_acks.json';

// Signing key strictly in server memory (process.env override or ephemeral 32-byte key)
const rawSessionSecret = (process.env.ADMIN_GATE_SESSION_SECRET || '').trim();
const SESSION_SIGNING_KEY = rawSessionSecret
  ? crypto.createHash('sha256').update(rawSessionSecret, 'utf8').digest()
  : crypto.randomBytes(32);

interface ClaimedCredential {
  salt: Buffer;
  hash: Buffer;
}

type GateScope = 'admin_gate' | 'camp_exam_gate';

// Precomputed scrypt credential for the in-camp Exam Creator panel passcode (overridden by CAMP_EXAM_PANEL_PASSCODE env var)
const DEFAULT_CAMP_EXAM_CREDENTIAL: ClaimedCredential = {
  salt: Buffer.from('24d2bf747950be7e9db45f3d82a1d48a', 'hex'),
  hash: Buffer.from(
    '744c14eec5b1da2e167518c6ef4fee8c0601717d4e120e78e6855e2ee481254470a6d8be300f50d5d378a22cdc6d6feb5978aa8518d7824de53db42c2b58b901',
    'hex'
  ),
};

// First-run claimed passcode fallback (scrypt salted hash in server memory only, overridden by env var)
let claimedCredential: ClaimedCredential | null = null;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const attemptBuckets = new Map<string, RateLimitEntry>();
const campExamAttemptBuckets = new Map<string, RateLimitEntry>();
const aiAttemptBuckets = new Map<string, RateLimitEntry>();
const pushSendAttemptBuckets = new Map<string, RateLimitEntry>();

// ============================================================
// W3C Web Push (VAPID) + Public Google Firebase ID Token Verifier
// ============================================================
const envVapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
const envVapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:admin@moaskar.app').trim();
const vapidPersistent = Boolean(envVapidPublic && envVapidPrivate);
const activeVapidKeys = vapidPersistent
  ? { publicKey: envVapidPublic, privateKey: envVapidPrivate }
  : generateVAPIDKeys();

try {
  setVapidDetails(vapidSubject, activeVapidKeys.publicKey, activeVapidKeys.privateKey);
} catch (err) {
  console.error('[webpush] Invalid VAPID configuration:', err instanceof Error ? err.message : err);
}

interface StoredPushMedia {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  buffer: Buffer;
  createdAtMs: number;
}
const pushMediaStore = new Map<string, StoredPushMedia>();

interface AckCountsBucket {
  deliveredSubs: string[];
  openedSubs: string[];
}
const pushAckStore = new Map<string, { deliveredSubs: Set<string>; openedSubs: Set<string> }>();

function loadInitialAckStore(): void {
  try {
    if (!fs.existsSync(PUSH_ACKS_TMP_PATH)) return;
    const raw = fs.readFileSync(PUSH_ACKS_TMP_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, AckCountsBucket>;
    for (const [notifId, entry] of Object.entries(parsed)) {
      if (!/^[a-zA-Z0-9_-]{3,128}$/.test(notifId)) continue;
      pushAckStore.set(notifId, {
        deliveredSubs: new Set(Array.isArray(entry.deliveredSubs) ? entry.deliveredSubs.slice(0, 500) : []),
        openedSubs: new Set(Array.isArray(entry.openedSubs) ? entry.openedSubs.slice(0, 500) : []),
      });
    }
  } catch {
    // Non-fatal if /tmp cache cannot be read
  }
}

function persistAckStore(): void {
  try {
    const out: Record<string, AckCountsBucket> = {};
    const entries = Array.from(pushAckStore.entries()).slice(-100);
    for (const [notifId, bucket] of entries) {
      out[notifId] = {
        deliveredSubs: Array.from(bucket.deliveredSubs).slice(0, 500),
        openedSubs: Array.from(bucket.openedSubs).slice(0, 500),
      };
    }
    fs.writeFileSync(PUSH_ACKS_TMP_PATH, JSON.stringify(out), 'utf8');
  } catch {
    // Non-fatal if /tmp is read-only
  }
}

loadInitialAckStore();

function computeAckToken(notificationId: string, subscriptionId: string): string {
  return crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(`ack:${notificationId}:${subscriptionId}`, 'utf8')
    .digest('base64url');
}

function verifyAckToken(notificationId: string, subscriptionId: string, token: string): boolean {
  if (!notificationId || !subscriptionId || !token) return false;
  const expected = computeAckToken(notificationId, subscriptionId);
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let cachedGoogleCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;

async function fetchGoogleSecureTokenCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedGoogleCerts && cachedGoogleCerts.expiresAtMs > now) {
    return cachedGoogleCerts.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('معرفناش نجيب شهادات التحقق من Firebase Auth.');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.min(3600, Math.max(60, Number(maxAgeMatch[1]))) : 300;
  const certs = (await resp.json()) as Record<string, string>;
  cachedGoogleCerts = { certs, expiresAtMs: now + maxAgeSec * 1000 };
  return certs;
}

async function verifyAdminFirebaseIdToken(
  idToken: string
): Promise<{ ok: true; uid: string; email: string } | { ok: false; error: string }> {
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, error: 'لازم توثيق حساب Firebase للأدمن.' };
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'شكل كود توثيق Firebase مش مظبوط.' };
  }
  const [headerB64, payloadB64, sigB64] = parts;

  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      aud?: string;
      iss?: string;
      exp?: number;
      iat?: number;
      sub?: string;
      email?: string;
      email_verified?: boolean;
    };

    if (header.alg !== 'RS256' || !header.kid) {
      return { ok: false, error: 'توقيع كود Firebase مش مظبوط.' };
    }

    const certs = await fetchGoogleSecureTokenCerts();
    const certPem = certs[header.kid];
    if (!certPem) {
      return { ok: false, error: 'معرفناش نطابق شهادة التوقيع للكود ده.' };
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`, 'utf8');
    verifier.end();
    const signatureValid = verifier.verify(certPem, Buffer.from(sigB64, 'base64url'));
    if (!signatureValid) {
      return { ok: false, error: 'توقيع كود Firebase مش صح.' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (
      payload.aud !== FIREBASE_PROJECT_ID ||
      payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.exp !== 'number' ||
      payload.exp <= nowSec ||
      typeof payload.iat !== 'number' ||
      payload.iat > nowSec + 300
    ) {
      return { ok: false, error: 'جلسة Firebase خلصت أو مش تبع المشروع ده.' };
    }

    const verifiedEmail = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (!ADMIN_EMAIL_REGEX.test(verifiedEmail)) {
      return { ok: false, error: 'حساب Firebase الحالي مش حساب الأدمن المعتمد (01274011475).' };
    }

    return { ok: true, uid: payload.sub, email: verifiedEmail };
  } catch {
    return { ok: false, error: 'معرفناش نتأكد من هوية الأدمن عبر Firebase Auth.' };
  }
}

function isSafeHttpsPushEndpoint(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const rawHost = parsed.hostname.toLowerCase();
    const host = rawHost.replace(/^\[|\]$/g, '');
    if (
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0:0:0:0:0:0:0:1' ||
      host === '0.0.0.0' ||
      host === '::' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.startsWith('127.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('::ffff:') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function resolvePublicOrigin(req: Request): string {
  const envUrl = (process.env.APP_URL || '').trim();
  if (/^https?:\/\//i.test(envUrl) && !envUrl.includes('MY_APP_URL')) {
    return envUrl.replace(/\/+$/, '');
  }
  const forwardedHost = (req.get('x-forwarded-host') || req.get('host') || '').trim();
  const forwardedProto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  if (!forwardedHost) return '';
  const proto = forwardedHost.startsWith('localhost') || forwardedHost.startsWith('127.') ? forwardedProto : 'https';
  return `${proto}://${forwardedHost}`;
}

function parseDataImagePayload(
  dataUrl: string
): { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mimeType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp';
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PUSH_IMAGE_BYTES) return null;
  return { mimeType, buffer };
}

function getConfiguredEnvPasscode(): string {
  return (process.env.ADMIN_PORTAL_PASSCODE || '').trim();
}

function getConfiguredCampExamEnvPasscode(): string {
  return (process.env.CAMP_EXAM_PANEL_PASSCODE || '').trim();
}

function getGateMode(): 'env' | 'claimed' | 'claim_required' {
  if (getConfiguredEnvPasscode().length > 0) return 'env';
  if (claimedCredential !== null) return 'claimed';
  return 'claim_required';
}

function timingSafeEqualString(input: string, expected: string): boolean {
  const inputDigest = crypto.createHash('sha256').update(input, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(inputDigest, expectedDigest);
}

function verifyScryptCredential(input: string, cred: ClaimedCredential): boolean {
  const derived = crypto.scryptSync(input, cred.salt, 64);
  if (derived.length !== cred.hash.length) return false;
  return crypto.timingSafeEqual(derived, cred.hash);
}

function issueGateToken(scope: GateScope): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payloadObj = {
    scope,
    exp: expiresAt,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(payloadB64, 'utf8')
    .digest('base64url');
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt,
  };
}

function verifyGateToken(token: string, allowedScopes: GateScope[]): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  const expectedSigB64 = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(payloadB64, 'utf8')
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      scope?: string;
      exp?: number;
    };
    return (
      typeof decoded.scope === 'string' &&
      (allowedScopes as string[]).includes(decoded.scope) &&
      typeof decoded.exp === 'number' &&
      decoded.exp > Date.now()
    );
  } catch {
    return false;
  }
}

function isRateLimited(
  buckets: Map<string, RateLimitEntry>,
  ip: string,
  maxAttempts: number
): boolean {
  const now = Date.now();
  const entry = buckets.get(ip);
  if (!entry || entry.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= maxAttempts) {
    return true;
  }
  entry.count += 1;
  return false;
}

function resetRateLimit(ip: string): void {
  attemptBuckets.delete(ip);
}

function extractBearerToken(req: Request): string {
  const authHeader = req.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

const AI_QUESTIONS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['mcq', 'true_false', 'scientific_mcq', 'image_mcq'],
            description:
              'Question classification: true_false for True/False statements; scientific_mcq for math/physics/chemistry equations or scientific notation; image_mcq ONLY when the text explicitly refers to an external figure/image; otherwise mcq.',
          },
          promptText: {
            type: Type.STRING,
            description:
              'Clean question text without redundant numbering prefixes like "السؤال الأول:" or "Q1:". Keep mathematical/scientific formulas clean.',
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              'Array of 2 to 6 clean option texts without numbering markers ("١-", "أ-", "A.") and without "*". For true_false use ["صح", "خطأ"].',
          },
          correctOptionIndex: {
            type: Type.INTEGER,
            description:
              '0-based index of the correct answer in options[]. Respect * markers, bold/checkmarks, or answer keys at the end.',
          },
          hasMarkedCorrectAnswer: {
            type: Type.BOOLEAN,
            description:
              'True if the source text explicitly marked or provided the answer (e.g., * or answer key); false if no answer was marked in the input.',
          },
          score: {
            type: Type.NUMBER,
            description: 'Question score if explicitly specified in the text, otherwise defaultScore.',
          },
          explanation: {
            type: Type.STRING,
            description: 'Short explanation in Arabic only if present or helpful, otherwise empty string.',
          },
        },
        required: [
          'type',
          'promptText',
          'options',
          'correctOptionIndex',
          'hasMarkedCorrectAnswer',
        ],
      },
    },
  },
  required: ['questions'],
};

const AI_BULK_PARSE_SYSTEM_INSTRUCTION = `أنت محلل امتحانات متخصص لمنصة DUO CAMP التعليمية.
مهمتك قراءة النص المرسل دفعة واحدة واستخراج جميع الأسئلة الموجودة به (حتى 50 أو 150 سؤالًا) بالترتيب نفسه، وفرزها وتصنيف نوع كل سؤال بدقة، وإرجاع JSON مطابق للمخطط المحدد فقط.

قواعد الصرامة:
1. استخرج كل سؤال كامل موجود في النص دون حذف أي سؤال ودون اختراع أسئلة غير موجودة في النص.
2. حدد نوع كل سؤال في حقل type:
   - "true_false": لأسئلة الصواب والخطأ (مثل: صح أم خطأ، ضع علامة ✓ أو ×، True/False). اجعل options دائمًا ["صح", "خطأ"] وحدد correctOptionIndex (0 لـ صح، 1 لـ خطأ).
   - "scientific_mcq": لأسئلة الاختيار من متعدد التي تحتوي على معادلات، كسور، جذور، قوانين رياضية أو فيزيائية أو كيميائية أو رموز علمية (حول الرموز إلى صيغة نصية واضحة مثل ²، ³، √، ×، ÷، →، ⇌).
   - "image_mcq": فقط إذا نص السؤال صراحةً على وجود شكل أو صورة مرفقة (مثل: "في الشكل المقابل" أو "انظر الصورة").
   - "mcq": لأسئلة الاختيار من متعدد النصية العادية.
3. نظّف نص السؤال (promptText) من أرقام الترقيم الزائدة مثل "السؤال الأول:" أو "س5-" مع الإبقاء على نص السؤال كاملًا.
4. نظّف الاختيارات (options) من الترقيم البادئ (١-، ٢-، أ-، ب-، A.، 1)) ومن علامة النجمة (*) أو العلامات الزائدة، واحرص أن تكون بين 2 و6 اختيارات.
5. حدد correctOptionIndex (يبدأ من 0):
   - إذا وجدت علامة * أو ✓ أو عبارة "الإجابة الصحيحة:" أو نموذج إجابة في نهاية النص، التزم به واجعل hasMarkedCorrectAnswer = true.
   - إذا لم يُذكر حل السؤال في النص: إن أمكن تحديد الإجابة العلمية الصحيحة بيقين فاختر مؤشرها واجعل hasMarkedCorrectAnswer = false (كي يراجعها المعلم)، وإلا اجعل correctOptionIndex = 0 و hasMarkedCorrectAnswer = false.
6. إذا وُجدت درجة مكتوبة للسؤال استخدمها في score، وإلا استخدم الدرجة الافتراضية المرسلة.`;

async function startServer(): Promise<void> {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const gateJsonParser = express.json({ limit: '16kb' });
  const aiJsonParser = express.json({ limit: '512kb' });
  const pushAckJsonParser = express.json({ limit: '8kb' });
  const pushSendJsonParser = express.json({ limit: '1mb' });

  // ============================================================
  // W3C Web Push Public Key, Media Serving, Ack & Admin Broadcast
  // ============================================================
  app.get('/api/push/public-key', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      publicKey: activeVapidKeys.publicKey,
      persistent: vapidPersistent,
    });
  });

  app.get('/api/push/media/:imageId', (req: Request, res: Response) => {
    const imageId = String(req.params.imageId || '');
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(imageId)) {
      res.status(404).end();
      return;
    }
    const stored = pushMediaStore.get(imageId);
    if (!stored) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', stored.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(stored.buffer);
  });

  app.post('/api/push/ack', pushAckJsonParser, (req: Request, res: Response) => {
    const body = req.body as
      | {
          notificationId?: unknown;
          subscriptionId?: unknown;
          ackToken?: unknown;
          event?: unknown;
        }
      | undefined;

    const notificationId = typeof body?.notificationId === 'string' ? body.notificationId.trim() : '';
    const subscriptionId = typeof body?.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
    const ackToken = typeof body?.ackToken === 'string' ? body.ackToken.trim() : '';
    const event = body?.event === 'opened' ? 'opened' : body?.event === 'delivered' ? 'delivered' : '';

    if (
      !event ||
      !/^[a-zA-Z0-9_-]{3,128}$/.test(notificationId) ||
      !/^[a-zA-Z0-9_-]{3,128}$/.test(subscriptionId) ||
      !verifyAckToken(notificationId, subscriptionId, ackToken)
    ) {
      res.status(400).json({ ok: false });
      return;
    }

    let bucket = pushAckStore.get(notificationId);
    if (!bucket) {
      bucket = { deliveredSubs: new Set<string>(), openedSubs: new Set<string>() };
      pushAckStore.set(notificationId, bucket);
    }
    bucket.deliveredSubs.add(subscriptionId);
    if (event === 'opened') {
      bucket.openedSubs.add(subscriptionId);
    }
    persistAckStore();

    res.json({ ok: true });
  });

  app.get('/api/admin/push/stats', async (req: Request, res: Response) => {
    const gateToken = String(req.get('x-admin-gate-token') || '').trim();
    if (!verifyGateToken(gateToken, ['admin_gate'])) {
      res.status(401).json({ ok: false, error: 'جلسة بوابة الأدمن مش شغالة.' });
      return;
    }
    const idToken = extractBearerToken(req);
    const adminCheck = await verifyAdminFirebaseIdToken(idToken);
    if (!adminCheck.ok) {
      res.status(403).json({ ok: false, error: adminCheck.error });
      return;
    }

    const rawIds = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = rawIds
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-zA-Z0-9_-]{3,128}$/.test(s))
      .slice(0, 50);

    const stats: Record<string, { deliveredCount: number; openedCount: number }> = {};
    for (const id of ids) {
      const bucket = pushAckStore.get(id);
      stats[id] = {
        deliveredCount: bucket ? bucket.deliveredSubs.size : 0,
        openedCount: bucket ? bucket.openedSubs.size : 0,
      };
    }

    res.json({ ok: true, stats, persistent: vapidPersistent });
  });

  app.post('/api/admin/push/send', pushSendJsonParser, async (req: Request, res: Response) => {
    const gateToken = String(req.get('x-admin-gate-token') || '').trim();
    if (!verifyGateToken(gateToken, ['admin_gate'])) {
      res.status(401).json({
        ok: false,
        error: 'جلسة بوابة الأدمن خلصت، اكتب باسورد البوابة تاني.',
      });
      return;
    }

    const idToken = extractBearerToken(req);
    const adminCheck = await verifyAdminFirebaseIdToken(idToken);
    if (!adminCheck.ok) {
      res.status(403).json({ ok: false, error: adminCheck.error });
      return;
    }

    const clientIp = req.ip || 'unknown';
    if (isRateLimited(pushSendAttemptBuckets, clientIp, PUSH_SEND_RATE_LIMIT_MAX)) {
      res.status(429).json({
        ok: false,
        error: 'بعتّ إشعارات كتير ورا بعض، استنى شوية وجرب تاني.',
      });
      return;
    }

    const body = req.body as
      | {
          notificationId?: unknown;
          title?: unknown;
          body?: unknown;
          imageDataUrl?: unknown;
          targetRoute?: unknown;
          targets?: unknown;
        }
      | undefined;

    const notificationId =
      typeof body?.notificationId === 'string' ? body.notificationId.trim() : '';
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const messageBody = typeof body?.body === 'string' ? body.body.trim() : '';
    const imageDataUrl =
      typeof body?.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
    const targetRoute =
      typeof body?.targetRoute === 'string' ? body.targetRoute.trim() : 'notification_view';

    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(notificationId)) {
      res.status(400).json({ ok: false, error: 'كود الإشعار مش مظبوط.' });
      return;
    }
    if (title.length < 1 || title.length > 120) {
      res.status(400).json({ ok: false, error: 'عنوان الإشعار لازم يكون بين 1 و120 حرف.' });
      return;
    }
    if (messageBody.length < 1 || messageBody.length > 500) {
      res.status(400).json({ ok: false, error: 'نص الإشعار لازم يكون بين 1 و500 حرف.' });
      return;
    }

    const allowedRoutes = new Set([
      'home',
      'azkar',
      'exams',
      'leaderboard',
      'little_question',
      'settings',
      'notification_view',
    ]);
    const safeTargetRoute = allowedRoutes.has(targetRoute) ? targetRoute : 'notification_view';

    const rawTargets = Array.isArray(body?.targets) ? body.targets : [];
    const seenEndpoints = new Set<string>();
    const uniqueTargets: {
      uid: string;
      subId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }[] = [];

    for (const item of rawTargets) {
      if (!item || typeof item !== 'object') continue;
      const t = item as Record<string, unknown>;
      const uid = typeof t.uid === 'string' ? t.uid.trim() : '';
      const subId = typeof t.subId === 'string' ? t.subId.trim() : '';
      const endpoint = typeof t.endpoint === 'string' ? t.endpoint.trim() : '';
      const p256dh = typeof t.p256dh === 'string' ? t.p256dh.trim() : '';
      const authKey = typeof t.auth === 'string' ? t.auth.trim() : '';

      if (
        !/^[a-zA-Z0-9_-]{1,128}$/.test(uid) ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(subId) ||
        !isSafeHttpsPushEndpoint(endpoint) ||
        p256dh.length < 20 ||
        authKey.length < 10
      ) {
        continue;
      }

      if (seenEndpoints.has(endpoint)) continue;
      seenEndpoints.add(endpoint);
      uniqueTargets.push({ uid, subId, endpoint, p256dh, auth: authKey });
    }

    let servedImageUrl = '';
    if (imageDataUrl) {
      const parsedImg = parseDataImagePayload(imageDataUrl);
      if (!parsedImg) {
        res.status(400).json({
          ok: false,
          error: 'صورة الإشعار مش مظبوطة أو حجمها أكبر من المسموح (JPG/PNG).',
        });
        return;
      }
      const imageId = `img_${crypto.randomBytes(10).toString('hex')}`;
      if (pushMediaStore.size >= MAX_PUSH_MEDIA_ENTRIES) {
        const oldestKey = pushMediaStore.keys().next().value;
        if (oldestKey) pushMediaStore.delete(oldestKey);
      }
      pushMediaStore.set(imageId, {
        mimeType: parsedImg.mimeType,
        buffer: parsedImg.buffer,
        createdAtMs: Date.now(),
      });
      const origin = resolvePublicOrigin(req);
      if (origin) {
        servedImageUrl = `${origin}/api/push/media/${imageId}`;
      }
    }

    let acceptedCount = 0;
    let failedCount = 0;
    const staleTargets: { uid: string; subId: string }[] = [];
    const CONCURRENCY = 10;

    for (let i = 0; i < uniqueTargets.length; i += CONCURRENCY) {
      const batch = uniqueTargets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (target) => {
          const payloadJson = JSON.stringify({
            notificationId,
            subscriptionId: target.subId,
            ackToken: computeAckToken(notificationId, target.subId),
            title,
            body: messageBody,
            imageUrl: servedImageUrl || undefined,
            targetRoute: safeTargetRoute,
          });
          try {
            await sendNotification(
              {
                endpoint: target.endpoint,
                keys: {
                  p256dh: target.p256dh,
                  auth: target.auth,
                },
              },
              payloadJson,
              {
                TTL: 86400,
                urgency: 'high',
                topic: `bc_${notificationId.slice(-24)}`,
              }
            );
            acceptedCount += 1;
          } catch (err: unknown) {
            const statusCode =
              typeof err === 'object' && err !== null && 'statusCode' in err
                ? Number((err as { statusCode?: unknown }).statusCode)
                : 0;
            if (statusCode === 404 || statusCode === 410) {
              staleTargets.push({ uid: target.uid, subId: target.subId });
            } else {
              failedCount += 1;
            }
          }
        })
      );
    }

    res.json({
      ok: true,
      notificationId,
      imageUrl: servedImageUrl,
      totalUniqueDevices: uniqueTargets.length,
      acceptedCount,
      failedCount,
      staleTargets,
      persistentVapid: vapidPersistent,
    });
  });

  app.get('/api/admin-gate/status', (_req: Request, res: Response) => {
    const mode = getGateMode();
    res.json({
      configured: mode !== 'claim_required',
      mode,
    });
  });

  app.post('/api/admin-gate/claim', gateJsonParser, (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (isRateLimited(attemptBuckets, clientIp, RATE_LIMIT_MAX_ATTEMPTS)) {
      res.status(429).json({ ok: false, error: 'جربت كتير ورا بعض، استنى شوية وحاول تاني.' });
      return;
    }

    if (getGateMode() !== 'claim_required') {
      res.status(409).json({ ok: false, error: 'باسورد لوحة الأدمن متفعّل بالفعل.' });
      return;
    }

    const body = req.body as { passcode?: unknown } | undefined;
    const rawPasscode = typeof body?.passcode === 'string' ? body.passcode.trim() : '';
    if (rawPasscode.length < 4 || rawPasscode.length > 128) {
      res.status(400).json({
        ok: false,
        error: 'الباسورد لازم يكون من 4 لـ 128 حرف أو رقم.',
      });
      return;
    }

    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(rawPasscode, salt, 64);
    claimedCredential = { salt, hash };
    resetRateLimit(clientIp);

    const session = issueGateToken('admin_gate');
    res.json({
      ok: true,
      mode: 'claimed',
      token: session.token,
      expiresAt: session.expiresAt,
    });
  });

  app.post('/api/admin-gate/verify', gateJsonParser, (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (isRateLimited(attemptBuckets, clientIp, RATE_LIMIT_MAX_ATTEMPTS)) {
      res.status(429).json({ ok: false, error: 'جربت كتير ورا بعض، استنى شوية وحاول تاني.' });
      return;
    }

    const mode = getGateMode();
    if (mode === 'claim_required') {
      res.status(409).json({
        ok: false,
        mode,
        error: 'لسه متعملش باسورد للوحة الأدمن.',
      });
      return;
    }

    const body = req.body as { passcode?: unknown } | undefined;
    const rawPasscode = typeof body?.passcode === 'string' ? body.passcode.trim() : '';
    if (!rawPasscode || rawPasscode.length > 128) {
      res.status(400).json({ ok: false, error: 'اكتب الباسورد الأول.' });
      return;
    }

    const envPasscode = getConfiguredEnvPasscode();
    let matched = false;
    if (envPasscode.length > 0) {
      matched = timingSafeEqualString(rawPasscode, envPasscode);
    } else if (claimedCredential) {
      matched = verifyScryptCredential(rawPasscode, claimedCredential);
    }

    if (!matched) {
      res.status(401).json({ ok: false, error: 'باسورد لوحة الأدمن غلط.' });
      return;
    }

    resetRateLimit(clientIp);
    const session = issueGateToken('admin_gate');
    res.json({
      ok: true,
      mode,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  });

  app.get('/api/admin-gate/session', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!verifyGateToken(token, ['admin_gate'])) {
      res.status(401).json({ valid: false });
      return;
    }
    res.json({ valid: true });
  });

  // In-camp Exam Publisher Passcode Gate ("لوحة الأدمن" button inside Group Camps)
  app.post('/api/camp-exam-gate/verify', gateJsonParser, (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (isRateLimited(campExamAttemptBuckets, clientIp, RATE_LIMIT_MAX_ATTEMPTS)) {
      res.status(429).json({ ok: false, error: 'جربت كتير ورا بعض، استنى شوية وحاول تاني.' });
      return;
    }

    const body = req.body as { passcode?: unknown } | undefined;
    const rawPasscode = typeof body?.passcode === 'string' ? body.passcode.trim() : '';
    if (!rawPasscode || rawPasscode.length > 128) {
      res.status(400).json({ ok: false, error: 'اكتب باسورد لوحة الأدمن.' });
      return;
    }

    const envPasscode = getConfiguredCampExamEnvPasscode();
    const matched =
      envPasscode.length > 0
        ? timingSafeEqualString(rawPasscode, envPasscode)
        : verifyScryptCredential(rawPasscode, DEFAULT_CAMP_EXAM_CREDENTIAL);

    if (!matched) {
      res.status(401).json({ ok: false, error: 'باسورد لوحة الأدمن غلط.' });
      return;
    }

    campExamAttemptBuckets.delete(clientIp);
    const session = issueGateToken('camp_exam_gate');
    const accessProof = crypto
      .createHash('sha256')
      .update(`camp_gate_proof:${rawPasscode}`, 'utf8')
      .digest('hex');

    res.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      accessProof,
    });
  });

  app.get('/api/camp-exam-gate/session', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!verifyGateToken(token, ['camp_exam_gate'])) {
      res.status(401).json({ valid: false });
      return;
    }
    res.json({ valid: true });
  });

  app.post('/api/admin-ai/parse-questions', aiJsonParser, async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!verifyGateToken(token, ['admin_gate', 'camp_exam_gate'])) {
      res.status(401).json({
        ok: false,
        error: 'جلسة بوابة الأدمن خلصت أو مش مسموح بيها، اكتب باسورد البوابة تاني.',
      });
      return;
    }

    const clientIp = req.ip || 'unknown';
    if (isRateLimited(aiAttemptBuckets, clientIp, AI_RATE_LIMIT_MAX_REQUESTS)) {
      res.status(429).json({
        ok: false,
        error: 'عملت طلبات فرز كتير بالذكاء الاصطناعي ورا بعض، استنى شوية وجرب تاني.',
      });
      return;
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        error: 'مفتاح GEMINI_API_KEY مش متضاف في إعدادات السيرفر (Secrets). ضيفه وجرب تاني.',
      });
      return;
    }

    const body = req.body as { rawText?: unknown; defaultScore?: unknown } | undefined;
    const rawText = typeof body?.rawText === 'string' ? body.rawText.trim() : '';
    if (rawText.length < 10) {
      res.status(400).json({
        ok: false,
        error: 'النص اللي بعتّه قصير أوي، اعمل لصق لنص الأسئلة واختياراتها الأول.',
      });
      return;
    }
    if (rawText.length > AI_MAX_RAW_TEXT_CHARS) {
      res.status(400).json({
        ok: false,
        error: 'حجم النص كبير أوي على المرة الواحدة (أقصى حاجة 120 ألف حرف). قسّمه على مرتين.',
      });
      return;
    }

    const parsedDefaultScore = Number(body?.defaultScore);
    const defaultScore =
      Number.isFinite(parsedDefaultScore) && parsedDefaultScore >= 0.25 && parsedDefaultScore <= 1000
        ? Math.round(parsedDefaultScore * 100) / 100
        : 1;

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `الدرجة الافتراضية لكل سؤال إذا لم تُذكر في النص هي: ${defaultScore}\n\nالنص المطلوب فرزه وتصنيفه إلى أسئلة:\n"""\n${rawText}\n"""`,
        config: {
          systemInstruction: AI_BULK_PARSE_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: AI_QUESTIONS_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawOutput = (response.text || '').trim();
      if (!rawOutput) {
        res.status(502).json({
          ok: false,
          error: 'الذكاء الاصطناعي مرجعش رد مظبوط، جرب تاني.',
        });
        return;
      }

      const cleanedJson = rawOutput
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsedObj: { questions?: unknown };
      try {
        parsedObj = JSON.parse(cleanedJson) as { questions?: unknown };
      } catch {
        res.status(502).json({
          ok: false,
          error: 'معرفناش نقرأ رد الذكاء الاصطناعي بصيغة JSON. جرب بنص أوضح أو بدفعة أصغر.',
        });
        return;
      }

      const normalized = normalizeAiParsedQuestions(parsedObj.questions, defaultScore);
      if (normalized.questions.length === 0) {
        res.status(422).json({
          ok: false,
          error: 'معرفناش نلاقي ولا سؤال كامل باختياراته جوه النص ده.',
        });
        return;
      }

      res.json({
        ok: true,
        questions: normalized.questions,
        summary: normalized.summary,
      });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : 500;

      if (status === 429) {
        res.status(429).json({
          ok: false,
          error: 'الضغط عالي على خدمة الذكاء الاصطناعي دلوقتي (429). استنى لحظات وجرب تاني.',
        });
        return;
      }
      if (status === 401 || status === 403) {
        res.status(502).json({
          ok: false,
          error: 'مفتاح GEMINI_API_KEY مرفوض أو ملوش صلاحية كفاية.',
        });
        return;
      }
      if (status === 400) {
        res.status(400).json({
          ok: false,
          error: 'معرفناش نعالِج النص ده بالذكاء الاصطناعي. اتأكد من النص أو قسّم الدفعة.',
        });
        return;
      }

      console.error('[admin-ai/parse-questions] Gemini API error:', err instanceof Error ? err.message : err);
      res.status(502).json({
        ok: false,
        error: 'حصلت مشكلة وإحنا بنتصل بخدمة الذكاء الاصطناعي، جرب تاني.',
      });
    }
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err) {
      const errType = (err as { type?: string }).type;
      if (errType === 'entity.too.large') {
        res.status(413).json({
          ok: false,
          error: 'حجم البيانات كبير أوي، قسّم الأسئلة على مرتين وجرب تاني.',
        });
        return;
      }
      if (errType === 'entity.parse.failed') {
        res.status(400).json({
          ok: false,
          error: 'شكل الطلب مش مظبوط (JSON).',
        });
        return;
      }
    }
    next(err);
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.resolve(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DUO CAMP server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
