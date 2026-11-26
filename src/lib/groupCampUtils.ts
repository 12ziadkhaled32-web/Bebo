import {
  GroupCampMember,
  GroupExam,
  GroupExamAttempt,
  GroupExamQuestion,
  GroupExamTimeStatus,
  LeaderboardEntry,
} from '../types/camp';

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getExamTimeStatus(
  exam: Pick<GroupExam, 'startsAtMs' | 'endsAtMs'>,
  nowMs: number = Date.now()
): GroupExamTimeStatus {
  if (nowMs < exam.startsAtMs) return 'upcoming';
  if (nowMs > exam.endsAtMs) return 'ended';
  return 'available';
}

export function computeExamDeadlineMs(
  startedAtMs: number,
  durationMinutes: number,
  examEndsAtMs: number
): number {
  const durationMs = Math.max(1, durationMinutes) * 60 * 1000;
  return Math.min(startedAtMs + durationMs, examEndsAtMs);
}

export function computeRemainingSeconds(deadlineAtMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((deadlineAtMs - nowMs) / 1000));
}

export function areResultsReleased(
  exam: Pick<GroupExam, 'resultsReleaseAtMs'>,
  nowMs: number = Date.now()
): boolean {
  if (!exam.resultsReleaseAtMs || exam.resultsReleaseAtMs <= 0) return true;
  return nowMs >= exam.resultsReleaseAtMs;
}

export function canStudentStartAttempt(
  exam: GroupExam,
  studentAttempts: GroupExamAttempt[],
  nowMs: number = Date.now()
): {
  allowed: boolean;
  reason?: string;
  activeAttempt?: GroupExamAttempt;
  nextAttemptNumber: number;
} {
  if (exam.status !== 'published') {
    return {
      allowed: false,
      reason: 'الامتحان ده مش منشور دلوقتي.',
      nextAttemptNumber: 1,
    };
  }

  const activeAttempt = studentAttempts.find((a) => a.status === 'in_progress');
  if (activeAttempt) {
    const deadline = activeAttempt.deadlineAtMs || computeExamDeadlineMs(
      activeAttempt.startedAtMs,
      exam.durationMinutes,
      exam.endsAtMs
    );
    if (nowMs <= deadline) {
      return {
        allowed: true,
        activeAttempt,
        nextAttemptNumber: activeAttempt.attemptNumber,
      };
    }
  }

  const timeStatus = getExamTimeStatus(exam, nowMs);
  if (timeStatus === 'upcoming') {
    return {
      allowed: false,
      reason: 'ميعاد الامتحان ده لسه مجاش.',
      nextAttemptNumber: studentAttempts.length + 1,
    };
  }
  if (timeStatus === 'ended') {
    return {
      allowed: false,
      reason: 'وقت دخول الامتحان ده خلص خلاص.',
      nextAttemptNumber: studentAttempts.length + 1,
    };
  }

  const usedAttempts = studentAttempts.length;
  if (usedAttempts >= exam.maxAttempts) {
    return {
      allowed: false,
      reason: `خلصت / خلصتي كل المحاولات المسموح بيها (${exam.maxAttempts}).`,
      nextAttemptNumber: usedAttempts + 1,
    };
  }

  return {
    allowed: true,
    nextAttemptNumber: usedAttempts + 1,
  };
}

export interface GradedExamSummary {
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
}

export function gradeObjectiveExam(
  questions: GroupExamQuestion[],
  answers: Record<string, number>
): GradedExamSummary {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;

  for (const q of questions) {
    const qScore = Number(q.score) > 0 ? Number(q.score) : 1;
    maxScore += qScore;
    const selected = answers[q.id];
    if (typeof selected === 'number' && selected === q.correctOptionIndex) {
      score += qScore;
      correctCount += 1;
    }
  }

  const roundedScore = roundScore(score);
  const roundedMax = roundScore(maxScore);
  const percentage =
    roundedMax > 0 ? Math.min(100, Math.max(0, roundScore((roundedScore / roundedMax) * 100))) : 0;

  return {
    score: roundedScore,
    maxScore: roundedMax,
    percentage,
    correctCount,
    totalQuestions: questions.length,
  };
}

export function isQuestionAnswered(
  question: Pick<GroupExamQuestion, 'id' | 'options'>,
  answers: Record<string, number>
): boolean {
  const chosen = answers[question.id];
  return (
    typeof chosen === 'number' &&
    Number.isInteger(chosen) &&
    chosen >= 0 &&
    chosen < question.options.length
  );
}

export function countAnsweredQuestions(
  questions: Pick<GroupExamQuestion, 'id' | 'options'>[],
  answers: Record<string, number>
): number {
  let count = 0;
  for (const q of questions) {
    if (isQuestionAnswered(q, answers)) {
      count += 1;
    }
  }
  return count;
}

export function findFirstUnansweredQuestionIndex(
  questions: Pick<GroupExamQuestion, 'id' | 'options'>[],
  answers: Record<string, number>
): number {
  for (let i = 0; i < questions.length; i++) {
    if (!isQuestionAnswered(questions[i], answers)) {
      return i;
    }
  }
  return -1;
}

export function areAllQuestionsAnswered(
  questions: Pick<GroupExamQuestion, 'id' | 'options'>[],
  answers: Record<string, number>
): boolean {
  return questions.length > 0 && findFirstUnansweredQuestionIndex(questions, answers) === -1;
}

export function computeMemberTotalsFromAttempts(params: {
  finishedAttempts: GroupExamAttempt[];
  publishedExamsCount: number;
  latestExamScore: number;
}): {
  totalScore: number;
  examsTakenCount: number;
  totalCorrectAnswers: number;
  totalQuestionsAnswered: number;
  completionPercent: number;
  lastExamScore: number;
} {
  const { finishedAttempts, publishedExamsCount, latestExamScore } = params;
  const bestByExam = new Map<string, GroupExamAttempt>();

  for (const att of finishedAttempts) {
    if (att.status === 'in_progress') continue;
    const prev = bestByExam.get(att.examId);
    if (
      !prev ||
      att.score > prev.score ||
      (att.score === prev.score && att.correctCount > prev.correctCount)
    ) {
      bestByExam.set(att.examId, att);
    }
  }

  let totalScore = 0;
  let totalCorrectAnswers = 0;
  let totalQuestionsAnswered = 0;

  for (const best of bestByExam.values()) {
    totalScore += best.score;
    totalCorrectAnswers += best.correctCount;
    totalQuestionsAnswered += best.totalQuestions;
  }

  const examsTakenCount = bestByExam.size;
  const completionPercent =
    publishedExamsCount > 0
      ? Math.min(100, Math.round((examsTakenCount / publishedExamsCount) * 100))
      : 0;

  return {
    totalScore: roundScore(totalScore),
    examsTakenCount,
    totalCorrectAnswers,
    totalQuestionsAnswered,
    completionPercent,
    lastExamScore: roundScore(latestExamScore),
  };
}

/**
 * Ranks group camp members deterministically without unfair speed bias:
 * 1. Total Score (desc)
 * 2. Total Correct Answers (desc)
 * 3. Latest Exam Score (desc)
 * 4. Completion Percentage (desc)
 * 5. UID (asc)
 */
export function rankGroupMembers(members: GroupCampMember[]): LeaderboardEntry[] {
  const sorted = [...members].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.totalCorrectAnswers !== a.totalCorrectAnswers) {
      return b.totalCorrectAnswers - a.totalCorrectAnswers;
    }
    if (b.lastExamScore !== a.lastExamScore) return b.lastExamScore - a.lastExamScore;
    if (b.completionPercent !== a.completionPercent) {
      return b.completionPercent - a.completionPercent;
    }
    return a.uid.localeCompare(b.uid);
  });

  return sorted.map((member, idx) => {
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const scoreDiffFromPrev = prev ? Math.max(0, roundScore(prev.totalScore - member.totalScore)) : 0;
    return {
      rank: idx + 1,
      member,
      scoreDiffFromPrev,
      isChampion: idx === 0,
    };
  });
}

export function generateGroupInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part = '';
  for (let i = 0; i < 6; i++) {
    part += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GRP-${part}`;
}

export function formatCountdownClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatArabicDateTime(ms: number): string {
  if (!ms) return 'مش متحدد';
  try {
    return new Date(ms).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function toDatetimeLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface ParsedBulkMcqQuestion {
  promptText: string;
  options: string[];
  correctOptionIndex: number;
  score: number;
  hasMarkedCorrectAnswer: boolean;
  warnings: string[];
}

export interface BulkMcqParseResult {
  questions: ParsedBulkMcqQuestion[];
  skippedCount: number;
  missingStarNumbers: number[];
}

function normalizeDigits(str: string): string {
  return str
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

function extractQuestionHeader(line: string): { isExplicitHeader: boolean; text: string } {
  const trimmed = line.trim();

  // Matches e.g.: "السؤال الاول : ماهي عاصمة مصر ؟" or "السؤال 15: ..." or "السؤال الخامس عشر :"
  const arabicWordHeader = /^(?:السؤال|سؤال)\s+[^:\n：]{1,50}[:：]\s*(.*)$/;
  const mWord = trimmed.match(arabicWordHeader);
  if (mWord) {
    return { isExplicitHeader: true, text: mWord[1].trim() };
  }

  // Matches e.g.: "السؤال 1 - ..." or "السؤال ١) ..."
  const arabicNumHeader = /^(?:السؤال|سؤال)\s+[\d\u0660-\u0669\u06F0-\u06F9]+\s*[-–.)：:]?\s*(.+)$/;
  const mNum = trimmed.match(arabicNumHeader);
  if (mNum) {
    return { isExplicitHeader: true, text: mNum[1].trim() };
  }

  // Matches e.g.: "س1:" or "س ١ -" or "Q1:"
  const shortHeader = /^(?:س|Q|q)\s*[\d\u0660-\u0669\u06F0-\u06F9]+\s*[:：\-–.)]\s*(.+)$/;
  const mShort = trimmed.match(shortHeader);
  if (mShort) {
    return { isExplicitHeader: true, text: mShort[1].trim() };
  }

  return { isExplicitHeader: false, text: trimmed };
}

function parseMcqOptionLine(line: string): {
  isOption: boolean;
  markerNum: number | null;
  text: string;
  isStarred: boolean;
} {
  let working = line.trim();
  if (!working) {
    return { isOption: false, markerNum: null, text: '', isStarred: false };
  }

  let isStarred = false;
  if (working.startsWith('*')) {
    isStarred = true;
    working = working.replace(/^\*+\s*/, '');
  }

  // Option prefix: Arabic-Indic 1..6, Extended 1..6, Western 1..6, or Arabic letters أ/ب/ج/د/هـ
  const optRegex =
    /^([1-6\u0661-\u0666\u06F1-\u06F6]|[أإآاابجدهـ])\s*[-–.):：]\s*(.+)$/;
  const match = working.match(optRegex);
  if (!match) {
    return { isOption: false, markerNum: null, text: '', isStarred: false };
  }

  const rawMarker = normalizeDigits(match[1]);
  const markerNum = /^[1-6]$/.test(rawMarker) ? Number(rawMarker) : null;
  let optText = match[2].trim();

  if (/^\*+/.test(optText)) {
    isStarred = true;
    optText = optText.replace(/^\*+\s*/, '');
  }
  if (/\*+$/.test(optText)) {
    isStarred = true;
    optText = optText.replace(/\s*\*+$/, '');
  }

  return {
    isOption: true,
    markerNum,
    text: optText.trim(),
    isStarred,
  };
}

/**
 * Parses bulk MCQ text pasted by an admin/instructor in formats like:
 *   السؤال الاول : ماهي عاصمة مصر ؟
 *   ١-الاسنكدرية
 *   ٢-العاصمة الادارية
 *   ٣-القاهرة*
 *   ٤- المنيا
 * Any option marked with `*` is automatically selected as the correct answer.
 */
export function parseBulkMcqQuestions(
  rawText: string,
  defaultScore: number = 1
): BulkMcqParseResult {
  const safeScore = Math.max(0.25, Math.min(1000, Number(defaultScore) || 1));
  const lines = rawText.replace(/\r\n?/g, '\n').split('\n');

  interface DraftQuestion {
    promptLines: string[];
    options: string[];
    correctOptionIndex: number | null;
  }

  const completed: ParsedBulkMcqQuestion[] = [];
  let skippedCount = 0;
  let current: DraftQuestion | null = null;

  const finalizeCurrent = () => {
    if (!current) return;
    const promptText = current.promptLines.join('\n').trim();
    const cleanOptions = current.options.slice(0, 6).map((o) => o.trim()).filter(Boolean);
    if (!promptText || cleanOptions.length < 2) {
      skippedCount += 1;
      current = null;
      return;
    }

    const hasMarkedCorrectAnswer =
      current.correctOptionIndex !== null &&
      current.correctOptionIndex >= 0 &&
      current.correctOptionIndex < cleanOptions.length;

    const warnings: string[] = [];
    if (!hasMarkedCorrectAnswer) {
      warnings.push('مفيش نجمة (*) جنب الإجابة الصح؛ حطينا الاختيار الأول مؤقتًا لحد ما تعدّله.');
    }

    completed.push({
      promptText: promptText.slice(0, 2000),
      options: cleanOptions.map((o) => o.slice(0, 400)),
      correctOptionIndex: hasMarkedCorrectAnswer ? current.correctOptionIndex! : 0,
      score: safeScore,
      hasMarkedCorrectAnswer,
      warnings,
    });
    current = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      // Blank line finalizes a question only if it already has >= 2 options
      if (current && current.options.length >= 2) {
        finalizeCurrent();
      }
      continue;
    }

    const headerInfo = extractQuestionHeader(trimmed);
    const optInfo = headerInfo.isExplicitHeader
      ? { isOption: false, markerNum: null, text: '', isStarred: false }
      : parseMcqOptionLine(trimmed);

    if (headerInfo.isExplicitHeader) {
      finalizeCurrent();
      current = {
        promptLines: headerInfo.text ? [headerInfo.text] : [],
        options: [],
        correctOptionIndex: null,
      };
      continue;
    }

    if (optInfo.isOption && current) {
      if (current.options.length >= 2 && optInfo.markerNum === 1) {
        finalizeCurrent();
        current = {
          promptLines: [trimmed],
          options: [],
          correctOptionIndex: null,
        };
        continue;
      }
      if (current.options.length < 6) {
        const nextIdx = current.options.length;
        current.options.push(optInfo.text);
        if (optInfo.isStarred && current.correctOptionIndex === null) {
          current.correctOptionIndex = nextIdx;
        }
        continue;
      }
    }

    // Non-option text line
    if (!current) {
      current = {
        promptLines: [trimmed],
        options: [],
        correctOptionIndex: null,
      };
    } else if (current.options.length >= 2) {
      // Previous question already has its options -> start next question
      finalizeCurrent();
      current = {
        promptLines: [trimmed],
        options: [],
        correctOptionIndex: null,
      };
    } else {
      // Multi-line question prompt before options begin
      current.promptLines.push(trimmed);
    }
  }

  finalizeCurrent();

  const missingStarNumbers: number[] = [];
  completed.forEach((q, idx) => {
    if (!q.hasMarkedCorrectAnswer) {
      missingStarNumbers.push(idx + 1);
    }
  });

  return {
    questions: completed,
    skippedCount,
    missingStarNumbers,
  };
}

export {
  normalizeAiParsedQuestions,
  type AiParsedQuestion,
  type AiParsedQuestionsSummary,
  type AiSupportedQuestionType,
} from './aiQuestionUtils';

