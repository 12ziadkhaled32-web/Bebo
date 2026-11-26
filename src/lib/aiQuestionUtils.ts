export type AiSupportedQuestionType =
  | 'mcq'
  | 'true_false'
  | 'scientific_mcq'
  | 'image_mcq';

export interface AiParsedQuestion {
  type: AiSupportedQuestionType;
  promptText: string;
  options: string[];
  correctOptionIndex: number;
  score: number;
  explanation: string;
  hasMarkedCorrectAnswer: boolean;
}

export interface AiParsedQuestionsSummary {
  total: number;
  byType: Record<AiSupportedQuestionType, number>;
  unmarkedCount: number;
}

const VALID_AI_TYPES = new Set<AiSupportedQuestionType>([
  'mcq',
  'true_false',
  'scientific_mcq',
  'image_mcq',
]);

function roundScoreValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function cleanOptionText(raw: string): string {
  return raw
    .trim()
    .replace(/^\*+\s*/, '')
    .replace(/\s*\*+$/, '')
    .trim()
    .slice(0, 400);
}

/**
 * Normalizes and validates raw AI-extracted questions against DUO CAMP Firestore rules:
 * - Max 150 questions
 * - type in ['mcq', 'true_false', 'scientific_mcq', 'image_mcq']
 * - true_false normalized to ['صح', 'خطأ']
 * - options length 2..6 (each <= 400 chars)
 * - correctOptionIndex clamped within [0, options.length - 1]
 * - score clamped within [0.25, 1000]
 * - explanation clamped <= 1000 chars
 */
export function normalizeAiParsedQuestions(
  rawList: unknown,
  defaultScore: number = 1
): {
  questions: AiParsedQuestion[];
  summary: AiParsedQuestionsSummary;
} {
  const safeDefaultScore = roundScoreValue(
    Math.max(0.25, Math.min(1000, Number(defaultScore) || 1))
  );

  const byType: Record<AiSupportedQuestionType, number> = {
    mcq: 0,
    true_false: 0,
    scientific_mcq: 0,
    image_mcq: 0,
  };

  if (!Array.isArray(rawList)) {
    return {
      questions: [],
      summary: { total: 0, byType, unmarkedCount: 0 },
    };
  }

  const questions: AiParsedQuestion[] = [];
  let unmarkedCount = 0;

  for (const rawItem of rawList) {
    if (questions.length >= 150) break;
    if (!rawItem || typeof rawItem !== 'object') continue;

    const item = rawItem as Record<string, unknown>;
    const promptText =
      typeof item.promptText === 'string'
        ? item.promptText.trim().slice(0, 2000)
        : '';
    if (!promptText) continue;

    const rawType = typeof item.type === 'string' ? item.type.trim() : 'mcq';
    const type: AiSupportedQuestionType = VALID_AI_TYPES.has(
      rawType as AiSupportedQuestionType
    )
      ? (rawType as AiSupportedQuestionType)
      : 'mcq';

    let options: string[] = [];
    if (Array.isArray(item.options)) {
      options = item.options
        .filter((o): o is string => typeof o === 'string')
        .map(cleanOptionText)
        .filter((o) => o.length > 0)
        .slice(0, 6);
    }

    if (type === 'true_false') {
      options = ['صح', 'خطأ'];
    } else if (type === 'image_mcq' && options.length < 2) {
      options = ['أ', 'ب', 'ج', 'د'];
    } else if (options.length < 2) {
      // Incomplete question without at least 2 options cannot pass Firestore rules
      continue;
    }

    const rawIdx = Number(item.correctOptionIndex);
    const isValidIndex =
      Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < options.length;
    const correctOptionIndex = isValidIndex ? rawIdx : 0;

    const hasMarkedCorrectAnswer =
      typeof item.hasMarkedCorrectAnswer === 'boolean'
        ? item.hasMarkedCorrectAnswer && isValidIndex
        : isValidIndex;

    if (!hasMarkedCorrectAnswer) {
      unmarkedCount += 1;
    }

    const rawScore = Number(item.score);
    const score =
      Number.isFinite(rawScore) && rawScore >= 0.25 && rawScore <= 1000
        ? roundScoreValue(rawScore)
        : safeDefaultScore;

    const explanation =
      typeof item.explanation === 'string'
        ? item.explanation.trim().slice(0, 1000)
        : '';

    byType[type] += 1;
    questions.push({
      type,
      promptText,
      options,
      correctOptionIndex,
      score,
      explanation,
      hasMarkedCorrectAnswer,
    });
  }

  return {
    questions,
    summary: {
      total: questions.length,
      byType,
      unmarkedCount,
    },
  };
}
