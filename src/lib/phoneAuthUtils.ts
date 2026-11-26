export const EGYPTIAN_MOBILE_LOCAL_REGEX = /^01[0125][0-9]{8}$/;
export const EGYPTIAN_MOBILE_E164_REGEX = /^\+201[0125][0-9]{8}$/;
export const EGYPTIAN_PHONE_DIGITS_REGEX = /^201[0125][0-9]{8}$/;
export const SYNTHETIC_PHONE_EMAIL_REGEX = /^201[0125][0-9]{8}(?:\.r[0-9]{1,16})?@phone\.moaskar\.app$/i;

export const ADMIN_PHONE_LOCAL = '01274011475';
export const ADMIN_PHONE_DIGITS = '201274011475';
export const ADMIN_PHONE_E164 = '+201274011475';
export const ADMIN_PRIMARY_SYNTHETIC_EMAIL = '201274011475@phone.moaskar.app';
export const ADMIN_SYNTHETIC_EMAIL_REGEX = /^201274011475(?:\.r[0-9]{1,16})?@phone\.moaskar\.app$/i;

export function isAdminPhoneAuthEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_SYNTHETIC_EMAIL_REGEX.test(email.trim());
}

export const MIN_STUDENT_PASSWORD_LENGTH = 6;
export const MAX_STUDENT_PASSWORD_LENGTH = 128;
export const MIN_SECURITY_ANSWER_LENGTH = 2;
export const MAX_SECURITY_ANSWER_LENGTH = 120;

export const SECURITY_QUESTIONS: readonly string[] = [
  'إيه أكتر مادة دراسية بتحبها؟',
  'إيه اسم أعز صاحب أو صاحبة ليك؟',
  'إيه اسم مدرستك أو سنترك المفضل؟',
  'إيه حلمك أو الكلية اللي نفسك تدخلها؟',
  'كلمة سرية أو كود أمان خاص بيك',
];

const ARABIC_INDIC_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function normalizeDigitsToLatin(raw: string): string {
  return raw.replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_INDIC_MAP[ch] ?? ch);
}

/**
 * Normalizes Egyptian mobile inputs (including spaces, hyphens, +20 / 0020 / 20 prefixes,
 * or Eastern Arabic numerals) toward the canonical 11-digit local form `01xxxxxxxxx`.
 */
export function normalizeEgyptianPhoneInput(raw: string): string {
  const latin = normalizeDigitsToLatin(raw || '');
  const stripped = latin.replace(/[\s\-().+]/g, '').replace(/[^0-9]/g, '');
  if (stripped.startsWith('00201') && stripped.length === 14) {
    return stripped.slice(3); // 01xxxxxxxxx
  }
  if (stripped.startsWith('201') && stripped.length === 12) {
    return `0${stripped.slice(2)}`; // 01xxxxxxxxx
  }
  return stripped;
}

export function isValidEgyptianMobile(rawOrLocal: string): boolean {
  const local = normalizeEgyptianPhoneInput(rawOrLocal);
  return EGYPTIAN_MOBILE_LOCAL_REGEX.test(local);
}

export function getEgyptianPhoneValidationError(raw: string): string | null {
  const local = normalizeEgyptianPhoneInput(raw);
  if (!local) {
    return 'اكتب / اكتبي رقم الموبايل الأول.';
  }
  if (!local.startsWith('01')) {
    return 'لازم رقم الموبايل المصري يبدأ بـ 01 (زي 010 أو 011 أو 012 أو 015).';
  }
  if (!/^01[0125]/.test(local)) {
    return 'ثالث رقم في الموبايل المصري لازم يكون 0 أو 1 أو 2 أو 5 (010 / 011 / 012 / 015).';
  }
  if (local.length !== 11) {
    return `رقم الموبايل لازم يكون 11 رقم بالظبط (مكتوب دلوقتي ${local.length} أرقام).`;
  }
  return null;
}

export function toE164EgyptianPhone(rawOrLocal: string): string {
  const local = normalizeEgyptianPhoneInput(rawOrLocal);
  if (!EGYPTIAN_MOBILE_LOCAL_REGEX.test(local)) {
    throw new Error('رقم الموبايل المصري مش مظبوط.');
  }
  return `+2${local}`;
}

export function toPhoneDigitsKey(rawOrLocalOrE164: string): string {
  const local = normalizeEgyptianPhoneInput(rawOrLocalOrE164);
  if (!EGYPTIAN_MOBILE_LOCAL_REGEX.test(local)) {
    throw new Error('رقم الموبايل المصري مش مظبوط.');
  }
  return `2${local}`; // e.g. 201012345678
}

export function isSyntheticPhoneEmail(email?: string | null): boolean {
  if (!email) return false;
  return SYNTHETIC_PHONE_EMAIL_REGEX.test(email.trim());
}

export function buildPrimarySyntheticEmail(rawOrLocal: string): string {
  return `${toPhoneDigitsKey(rawOrLocal)}@phone.moaskar.app`;
}

export function buildRecoveryAliasEmail(rawOrLocal: string, timestampMs = Date.now()): string {
  const safeTs = Math.max(1, Math.floor(timestampMs));
  return `${toPhoneDigitsKey(rawOrLocal)}.r${safeTs}@phone.moaskar.app`;
}

export function toLocalEgyptianPhone(input?: string | null): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (SYNTHETIC_PHONE_EMAIL_REGEX.test(trimmed)) {
    const localDigits = trimmed.split('@')[0].split('.')[0]; // 201012345678
    return `0${localDigits.slice(2)}`;
  }
  const normalized = normalizeEgyptianPhoneInput(trimmed);
  return EGYPTIAN_MOBILE_LOCAL_REGEX.test(normalized) ? normalized : trimmed;
}

export function resolveStudentPhoneE164FromAuth(params: {
  phoneNumber?: string | null;
  email?: string | null;
  profilePhone?: string | null;
}): string {
  if (params.phoneNumber && EGYPTIAN_MOBILE_E164_REGEX.test(params.phoneNumber.trim())) {
    return params.phoneNumber.trim();
  }
  if (params.profilePhone && EGYPTIAN_MOBILE_E164_REGEX.test(params.profilePhone.trim())) {
    return params.profilePhone.trim();
  }
  if (params.email && SYNTHETIC_PHONE_EMAIL_REGEX.test(params.email.trim())) {
    const digits = params.email.trim().split('@')[0].split('.')[0];
    if (EGYPTIAN_PHONE_DIGITS_REGEX.test(digits)) {
      return `+${digits}`;
    }
  }
  return '';
}

export function getStudentPasswordValidationError(password: string): string | null {
  if (!password || password.length === 0) {
    return 'اكتب / اكتبي كلمة السر الأول.';
  }
  if (password.length < MIN_STUDENT_PASSWORD_LENGTH) {
    return `كلمة السر لازم تكون ${MIN_STUDENT_PASSWORD_LENGTH} حروف أو أرقام على الأقل.`;
  }
  if (password.length > MAX_STUDENT_PASSWORD_LENGTH) {
    return 'كلمة السر طويلة أوي.';
  }
  return null;
}

/**
 * Normalizes a student's security answer so minor Arabic spelling variations
 * (أ/إ/آ -> ا, ة -> ه, ى -> ي, diacritics, Eastern numerals, extra spaces) match reliably.
 */
export function normalizeSecurityAnswer(raw: string): string {
  const latin = normalizeDigitsToLatin(raw || '');
  return latin
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getSecurityAnswerValidationError(answer: string): string | null {
  const normalized = normalizeSecurityAnswer(answer);
  if (!normalized) {
    return 'اكتب / اكتبي إجابة سؤال الأمان الأول.';
  }
  if (normalized.length < MIN_SECURITY_ANSWER_LENGTH) {
    return `إجابة سؤال الأمان لازم تكون ${MIN_SECURITY_ANSWER_LENGTH} حروف أو أرقام على الأقل.`;
  }
  if (normalized.length > MAX_SECURITY_ANSWER_LENGTH) {
    return 'إجابة سؤال الأمان طويلة أوي.';
  }
  return null;
}

export async function computeRecoverySecretHash(
  rawPhoneOrDigits: string,
  securityAnswer: string
): Promise<string> {
  const phoneDigits = EGYPTIAN_PHONE_DIGITS_REGEX.test(rawPhoneOrDigits.trim())
    ? rawPhoneOrDigits.trim()
    : toPhoneDigitsKey(rawPhoneOrDigits);
  const normalizedAnswer = normalizeSecurityAnswer(securityAnswer);
  if (normalizedAnswer.length < MIN_SECURITY_ANSWER_LENGTH) {
    throw new Error('إجابة سؤال الأمان قصيرة أوي.');
  }
  const payload = `moaskar_sec_v1:${phoneDigits}:${normalizedAnswer}`;
  const encoded = new TextEncoder().encode(payload);

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  throw new Error('المتصفح الحالي مش بيدعم التشفير الآمن لاسترجاع كلمة السر.');
}

export function mapStudentAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err || '');

  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return 'رقم الموبايل ده متسجل قبل كده بالفعل. سجّل / سجّلي دخولك أو اضغط نسيت كلمة السر.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    msg.includes('invalid-credential') ||
    msg.includes('wrong-password') ||
    msg.includes('user-not-found')
  ) {
    return 'رقم الموبايل أو كلمة السر مش صح. راجعهم أو اضغط «نسيت كلمة السر؟».';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return 'كلمة السر ضعيفة، اختار / اختاري كلمة سر من 6 حروف أو أرقام على الأقل.';
  }
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
    return 'جربت كتير ورا بعض.. استنى شوية وحاول / حاولي تاني.';
  }
  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return 'تسجيل الدخول بالبريد وكلمة السر (Email/Password) مش متفعّل لسه في إعدادات Firebase Auth.';
  }
  if (code === 'auth/network-request-failed' || msg.includes('network-request-failed')) {
    return 'مفيش اتصال نت كفاية دلوقتي.. اتأكد من الشبكة وجرب تاني.';
  }
  if (code === 'auth/requires-recent-login' || msg.includes('requires-recent-login')) {
    return 'عشان الأمان، أكد كلمة السر الحالية الأول وبعدين كمّل.';
  }

  return err instanceof Error && err.message ? err.message : 'حصلت مشكلة في تسجيل الدخول دلوقتي.. حاول تاني.';
}
