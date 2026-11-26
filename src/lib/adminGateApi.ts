import { AiParsedQuestion, AiParsedQuestionsSummary } from './groupCampUtils';

export type AdminGateMode = 'env' | 'claimed' | 'claim_required';

export interface AdminGateStatus {
  configured: boolean;
  mode: AdminGateMode;
}

export interface AdminGateUnlockResult {
  ok: boolean;
  token?: string;
  mode?: AdminGateMode;
  error?: string;
}

export interface AiQuestionParseResponse {
  ok: boolean;
  questions?: AiParsedQuestion[];
  summary?: AiParsedQuestionsSummary;
  error?: string;
}

export async function fetchAdminGateStatus(): Promise<AdminGateStatus> {
  const res = await fetch('/api/admin-gate/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('معرفناش نتأكد من حالة بوابة الأدمن دلوقتي.');
  }
  return (await res.json()) as AdminGateStatus;
}

export async function claimAdminGatePasscode(passcode: string): Promise<AdminGateUnlockResult> {
  const res = await fetch('/api/admin-gate/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return (await res.json()) as AdminGateUnlockResult;
}

export async function verifyAdminGatePasscode(passcode: string): Promise<AdminGateUnlockResult> {
  const res = await fetch('/api/admin-gate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return (await res.json()) as AdminGateUnlockResult;
}

export async function validateAdminGateToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('/api/admin-gate/session', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { valid?: boolean };
    return Boolean(data.valid);
  } catch {
    return false;
  }
}

export async function parseQuestionsWithAI(params: {
  token: string;
  rawText: string;
  defaultScore: number;
}): Promise<{
  questions: AiParsedQuestion[];
  summary: AiParsedQuestionsSummary;
}> {
  if (!params.token) {
    throw new Error('جلسة بوابة الأدمن مش شغالة، اكتب باسورد لوحة الأدمن تاني.');
  }

  const res = await fetch('/api/admin-ai/parse-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      rawText: params.rawText,
      defaultScore: params.defaultScore,
    }),
  });

  let data: AiQuestionParseResponse | null = null;
  try {
    data = (await res.json()) as AiQuestionParseResponse;
  } catch {
    data = null;
  }

  if (!res.ok || !data?.ok || !data.questions || !data.summary) {
    const err = new Error(
      data?.error || 'معرفناش نفرز الأسئلة بالذكاء الاصطناعي دلوقتي، جرب تاني.'
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return {
    questions: data.questions,
    summary: data.summary,
  };
}

export interface CampExamGateVerifyResult {
  ok: boolean;
  token?: string;
  expiresAt?: number;
  accessProof?: string;
  error?: string;
}

export async function verifyCampExamGatePasscode(
  passcode: string
): Promise<CampExamGateVerifyResult> {
  const res = await fetch('/api/camp-exam-gate/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return (await res.json()) as CampExamGateVerifyResult;
}

export async function validateCampExamGateToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('/api/camp-exam-gate/session', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { valid?: boolean };
    return Boolean(data.valid);
  } catch {
    return false;
  }
}

