import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  ImagePlus,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  ARABIC_OPTION_LETTERS,
  GROUP_CAMP_LIMITS,
  SCIENTIFIC_SYMBOL_SNIPPETS,
} from '../constants/campConfig';
import {
  parseQuestionsWithAI,
  verifyCampExamGatePasscode,
} from '../lib/adminGateApi';
import { generateSafeId } from '../lib/campUtils';
import {
  AiParsedQuestionsSummary,
  parseBulkMcqQuestions,
  toDatetimeLocalInput,
} from '../lib/groupCampUtils';
import {
  deleteStoredGroupImage,
  uploadExamQuestionImage,
} from '../lib/groupImageUpload';
import {
  adminSaveGroupExam,
  registerGroupExamPublisher,
} from '../services/groupCampService';
import {
  GroupCamp,
  GroupQuestionType,
  UserProfile,
} from '../types/camp';

interface EditableQuestion {
  id: string;
  order: number;
  type: GroupQuestionType;
  promptText: string;
  imageUrl: string;
  imageStoragePath: string;
  options: string[];
  correctOptionIndex: number;
  score: number;
  explanation: string;
}

const QUESTION_TYPE_LABELS: Record<GroupQuestionType, string> = {
  mcq: 'اختيار من متعدد',
  image_mcq: 'صورة سؤال + 4 أزرار اختيارات',
  true_false: 'صح أو خطأ',
  scientific_mcq: 'نص علمي ومعادلات + اختيارات',
};

function createBlankQuestion(type: GroupQuestionType, order: number): EditableQuestion {
  if (type === 'true_false') {
    return {
      id: generateSafeId('gq'),
      order,
      type,
      promptText: '',
      imageUrl: '',
      imageStoragePath: '',
      options: ['صح', 'خطأ'],
      correctOptionIndex: 0,
      score: 1,
      explanation: '',
    };
  }
  if (type === 'image_mcq') {
    return {
      id: generateSafeId('gq'),
      order,
      type,
      promptText: 'اختر الإجابة الصحيحة من الاختيارات أ / ب / ج / د الموجودة بالصورة:',
      imageUrl: '',
      imageStoragePath: '',
      options: ['أ', 'ب', 'ج', 'د'],
      correctOptionIndex: 0,
      score: 1,
      explanation: '',
    };
  }
  return {
    id: generateSafeId('gq'),
    order,
    type,
    promptText: '',
    imageUrl: '',
    imageStoragePath: '',
    options: ['', '', '', ''],
    correctOptionIndex: 0,
    score: 1,
    explanation: '',
  };
}

function formatReadableError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message || '';
  if (raw.includes('permission-denied') || raw.includes('Missing or insufficient permissions')) {
    return 'معرفناش ننفذ العملية عشان الصلاحيات. اتأكد من كلمة سر لوحة الأدمن الصح وإنك عضو في المعسكر.';
  }
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // Ignore JSON parse errors
    }
  }
  return raw || fallback;
}

interface CampExamPublisherPanelProps {
  camp: GroupCamp;
  profile: UserProfile;
  onExamPublished: () => Promise<void>;
  onOpenExamsTab: () => void;
}

export const CampExamPublisherPanel: React.FC<CampExamPublisherPanelProps> = ({
  camp,
  profile,
  onExamPublished,
  onOpenExamsTab,
}) => {
  // Passcode session held strictly in React state (never persisted to localStorage/sessionStorage)
  const [gateToken, setGateToken] = useState('');
  const [accessProof, setAccessProof] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [verifyingPasscode, setVerifyingPasscode] = useState(false);
  const [gateError, setGateError] = useState('');

  // Exam Creator & Publisher state (Create + Publish ONLY)
  const [exTitle, setExTitle] = useState('');
  const [exSubject, setExSubject] = useState('');
  const [exUnit, setExUnit] = useState('');
  const [exDesc, setExDesc] = useState('');
  const [exInstructions, setExInstructions] = useState('');
  const [exDurationMinutes, setExDurationMinutes] = useState(30);
  const [exStartsAt, setExStartsAt] = useState(() => toDatetimeLocalInput(Date.now()));
  const [exEndsAt, setExEndsAt] = useState(() =>
    toDatetimeLocalInput(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );
  const [exMaxAttempts, setExMaxAttempts] = useState(1);
  const [exImmediateResults, setExImmediateResults] = useState(true);
  const [exResultsAt, setExResultsAt] = useState(() => toDatetimeLocalInput(Date.now()));
  const [exAllowReview, setExAllowReview] = useState(true);
  const [exQuestions, setExQuestions] = useState<EditableQuestion[]>(() => [
    createBlankQuestion('mcq', 0),
  ]);

  const [bulkRawText, setBulkRawText] = useState('');
  const [bulkDefaultScore, setBulkDefaultScore] = useState(1);
  const [aiImportMode, setAiImportMode] = useState<'replace' | 'append'>('replace');
  const [aiParsingBulk, setAiParsingBulk] = useState(false);
  const [aiParseError, setAiParseError] = useState('');
  const [lastAiSortSummary, setLastAiSortSummary] = useState<AiParsedQuestionsSummary | null>(
    null
  );
  const [questionFilterType, setQuestionFilterType] = useState<'all' | GroupQuestionType>('all');
  const [showAdvancedExamFields, setShowAdvancedExamFields] = useState(false);
  const [expandedQuestionExtras, setExpandedQuestionExtras] = useState<
    Record<string, { image?: boolean; explanation?: boolean }>
  >({});
  const [uploadingQuestionId, setUploadingQuestionId] = useState('');
  const [publishingExam, setPublishingExam] = useState(false);
  const [formError, setFormError] = useState('');
  const [publishSuccessMsg, setPublishSuccessMsg] = useState('');

  // Re-sync publisher grant if the user switches camps while the panel stays open
  useEffect(() => {
    if (!gateToken || !accessProof) return;
    let active = true;
    void registerGroupExamPublisher({
      campId: camp.id,
      uid: profile.uid,
      accessProof,
    }).catch(() => {
      if (!active) return;
      setGateToken('');
      setAccessProof('');
    });
    return () => {
      active = false;
    };
  }, [camp.id, profile.uid, gateToken, accessProof]);

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = passcodeInput.trim();
    if (!trimmed) {
      setGateError('اكتب كلمة سر لوحة الأدمن الأول.');
      return;
    }

    setVerifyingPasscode(true);
    setGateError('');
    try {
      const result = await verifyCampExamGatePasscode(trimmed);
      if (!result.ok || !result.token || !result.accessProof) {
        setGateError(result.error || 'كلمة سر لوحة الأدمن غلط.');
        return;
      }

      await registerGroupExamPublisher({
        campId: camp.id,
        uid: profile.uid,
        accessProof: result.accessProof,
      });

      setPasscodeInput('');
      setGateToken(result.token);
      setAccessProof(result.accessProof);
    } catch (err) {
      setGateError(
        formatReadableError(err, 'معرفناش نتأكد من كلمة السر. اتأكد من النت وجرب تاني.')
      );
    } finally {
      setVerifyingPasscode(false);
    }
  };

  const handleLockPanel = () => {
    setGateToken('');
    setAccessProof('');
    setPasscodeInput('');
    setGateError('');
  };

  const resetExamCreator = () => {
    setExTitle('');
    setExSubject('');
    setExUnit('');
    setExDesc('');
    setExInstructions('');
    setExDurationMinutes(30);
    setExStartsAt(toDatetimeLocalInput(Date.now()));
    setExEndsAt(toDatetimeLocalInput(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setExMaxAttempts(1);
    setExImmediateResults(true);
    setExResultsAt(toDatetimeLocalInput(Date.now()));
    setExAllowReview(true);
    setExQuestions([createBlankQuestion('mcq', 0)]);
    setBulkRawText('');
    setAiParseError('');
    setLastAiSortSummary(null);
    setQuestionFilterType('all');
    setShowAdvancedExamFields(false);
    setExpandedQuestionExtras({});
  };

  const handleAddQuestion = (type: GroupQuestionType) => {
    setExQuestions((prev) => [...prev, createBlankQuestion(type, prev.length)]);
  };

  const handleUpdateQuestion = (
    qId: string,
    updater: (prev: EditableQuestion) => EditableQuestion
  ) => {
    setExQuestions((prev) => prev.map((q) => (q.id === qId ? updater(q) : q)));
  };

  const handleMoveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= exQuestions.length) return;
    setExQuestions((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy.map((q, i) => ({ ...q, order: i }));
    });
  };

  const handleDeleteQuestion = async (q: EditableQuestion) => {
    if (exQuestions.length <= 1) return;
    if (q.imageStoragePath) {
      await deleteStoredGroupImage(q.imageStoragePath);
    }
    setExQuestions((prev) =>
      prev.filter((item) => item.id !== q.id).map((item, idx) => ({ ...item, order: idx }))
    );
  };

  const handleUploadQuestionImage = async (
    q: EditableQuestion,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError('');
    setUploadingQuestionId(q.id);
    try {
      if (q.imageStoragePath) {
        await deleteStoredGroupImage(q.imageStoragePath);
      }
      const res = await uploadExamQuestionImage({
        file,
        campId: camp.id,
        examId: 'new_exam_draft',
        questionId: q.id,
      });
      handleUpdateQuestion(q.id, (prev) => ({
        ...prev,
        imageUrl: res.url,
        imageStoragePath: res.storagePath,
      }));
    } catch (err) {
      setFormError(formatReadableError(err, 'معرفناش نرفع صورة السؤال.'));
    } finally {
      setUploadingQuestionId('');
    }
  };

  const handleRemoveQuestionImage = async (q: EditableQuestion) => {
    if (q.imageStoragePath) {
      await deleteStoredGroupImage(q.imageStoragePath);
    }
    handleUpdateQuestion(q.id, (prev) => ({
      ...prev,
      imageUrl: '',
      imageStoragePath: '',
    }));
  };

  const bulkParseResult = useMemo(
    () => parseBulkMcqQuestions(bulkRawText, bulkDefaultScore),
    [bulkRawText, bulkDefaultScore]
  );

  const handleApplyBulkMcqImport = (mode: 'replace' | 'append') => {
    setFormError('');
    setPublishSuccessMsg('');
    if (bulkParseResult.questions.length === 0) {
      setFormError('ملقيناش أسئلة اختيار من متعدد مظبوطة في الكلام اللي كتبته.');
      return;
    }

    const mapped: EditableQuestion[] = bulkParseResult.questions.map((parsed, idx) => ({
      id: generateSafeId('gq'),
      order: idx,
      type: 'mcq',
      promptText: parsed.promptText,
      imageUrl: '',
      imageStoragePath: '',
      options: parsed.options,
      correctOptionIndex: parsed.correctOptionIndex,
      score: parsed.score,
      explanation: '',
    }));

    const hasOnlyUntouchedBlank =
      exQuestions.length === 1 &&
      !exQuestions[0].promptText.trim() &&
      !exQuestions[0].imageUrl.trim();
    const effectiveMode = hasOnlyUntouchedBlank ? 'replace' : mode;

    if (effectiveMode === 'replace') {
      const capped = mapped.slice(0, GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM);
      setExQuestions(capped.map((q, i) => ({ ...q, order: i })));
    } else {
      const remainingRoom = Math.max(
        0,
        GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM - exQuestions.length
      );
      if (remainingRoom === 0) {
        setFormError(`وصلت للحد الأقصى للأسئلة (${GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM}).`);
        return;
      }
      const toAdd = mapped.slice(0, remainingRoom);
      setExQuestions((prev) => [...prev, ...toAdd].map((q, i) => ({ ...q, order: i })));
    }

    setBulkRawText('');
    setLastAiSortSummary(null);
    setAiParseError('');
    setQuestionFilterType('all');
  };

  const handleAnalyzeBulkWithAI = async () => {
    setFormError('');
    setPublishSuccessMsg('');
    setAiParseError('');
    setLastAiSortSummary(null);

    if (bulkRawText.trim().length < 10) {
      setAiParseError('اكتب أو حط الأسئلة واختياراتها الأول وبعدها دوس «فرز بالذكاء الاصطناعي».');
      return;
    }
    if (!gateToken) {
      setAiParseError('الجلسة خلصت. اكتب كلمة سر لوحة الأدمن تاني.');
      return;
    }

    setAiParsingBulk(true);
    try {
      const result = await parseQuestionsWithAI({
        token: gateToken,
        rawText: bulkRawText,
        defaultScore: bulkDefaultScore,
      });

      const mapped: EditableQuestion[] = result.questions.map((parsed, idx) => ({
        id: generateSafeId('gq'),
        order: idx,
        type: parsed.type,
        promptText: parsed.promptText,
        imageUrl: '',
        imageStoragePath: '',
        options: parsed.options,
        correctOptionIndex: parsed.correctOptionIndex,
        score: parsed.score,
        explanation: parsed.explanation,
      }));

      const hasOnlyUntouchedBlank =
        exQuestions.length === 1 &&
        !exQuestions[0].promptText.trim() &&
        !exQuestions[0].imageUrl.trim();
      const effectiveMode = hasOnlyUntouchedBlank ? 'replace' : aiImportMode;

      if (effectiveMode === 'replace') {
        const capped = mapped.slice(0, GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM);
        setExQuestions(capped.map((q, i) => ({ ...q, order: i })));
      } else {
        const remainingRoom = Math.max(
          0,
          GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM - exQuestions.length
        );
        if (remainingRoom === 0) {
          setAiParseError(
            `وصلت للحد الأقصى للأسئلة (${GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM}).`
          );
          return;
        }
        const toAdd = mapped.slice(0, remainingRoom);
        setExQuestions((prev) => [...prev, ...toAdd].map((q, i) => ({ ...q, order: i })));
      }

      setLastAiSortSummary(result.summary);
      setQuestionFilterType('all');
      setTimeout(() => {
        document
          .getElementById('camp-publisher-questions-list')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : 0;
      setAiParseError(formatReadableError(err, 'معرفناش نفرز الأسئلة بالذكاء الاصطناعي. جرب تاني.'));
      if (status === 401) {
        handleLockPanel();
      }
    } finally {
      setAiParsingBulk(false);
    }
  };

  const computedTotalScore = useMemo(
    () =>
      Math.round(
        exQuestions.reduce((sum, q) => sum + Math.max(0.25, Number(q.score) || 1), 0) * 100
      ) / 100,
    [exQuestions]
  );

  const handlePublishExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setPublishSuccessMsg('');

    const startsAtMs = new Date(exStartsAt).getTime();
    const endsAtMs = new Date(exEndsAt).getTime();
    const resultsReleaseAtMs = exImmediateResults ? 0 : new Date(exResultsAt).getTime();

    if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) {
      setFormError('حدّد ميعاد بداية ونهاية صح للامتحان.');
      return;
    }
    if (endsAtMs <= startsAtMs) {
      setFormError('ميعاد انتهاء الامتحان لازم يكون بعد ميعاد البداية.');
      return;
    }

    for (let i = 0; i < exQuestions.length; i++) {
      const q = exQuestions[i];
      if (!q.promptText.trim() && !q.imageUrl.trim()) {
        setFormError(`السؤال رقم ${i + 1} لازم يكون فيه نص أو صورة على الأقل.`);
        return;
      }
      if (q.type === 'image_mcq' && !q.imageUrl.trim()) {
        setFormError(`السؤال رقم ${i + 1} من نوع «صورة سؤال + 4 أزرار» ولازم ترفعله صورة.`);
        return;
      }
    }

    setPublishingExam(true);
    try {
      const saved = await adminSaveGroupExam({
        campId: camp.id,
        adminUid: profile.uid,
        title: exTitle,
        subject: exSubject || 'عام',
        unit: exUnit,
        description: exDesc,
        instructions: exInstructions,
        durationMinutes: exDurationMinutes,
        startsAtMs,
        endsAtMs,
        maxAttempts: exMaxAttempts,
        resultsReleaseAtMs: Number.isNaN(resultsReleaseAtMs) ? 0 : resultsReleaseAtMs,
        allowReviewAfterSubmit: exAllowReview,
        status: 'published',
        questions: exQuestions.map((q, idx) => ({
          id: q.id,
          order: idx,
          type: q.type,
          promptText: q.promptText,
          imageUrl: q.imageUrl,
          imageStoragePath: q.imageStoragePath,
          options: q.options,
          correctOptionIndex: q.correctOptionIndex,
          score: Number(q.score) || 1,
          explanation: q.explanation,
        })),
      });

      resetExamCreator();
      await onExamPublished();
      setPublishSuccessMsg(
        `عملنا ونشرنا امتحان «${saved.title}» (${saved.questionsCount} سؤال · الدرجة النهائية ${saved.totalScore}) في معسكر «${camp.name}» بنجاح!`
      );
    } catch (err) {
      setFormError(formatReadableError(err, 'معرفناش نعمل وننشر الامتحان. جرب تاني.'));
    } finally {
      setPublishingExam(false);
    }
  };

  if (!gateToken) {
    return (
      <section className="glass-surface-strong rounded-3xl p-6 sm:p-10 border border-purple-200/80 dark:border-fuchsia-500/25">
        <div className="max-w-md mx-auto space-y-5 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 text-slate-950 flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              لوحة الأدمن — إنشاء ونشر امتحان
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              اي اللى جابك هنا 😏.
              <br />
              ما قلنا للأدمن بس
            </p>
          </div>

          <form onSubmit={handleUnlockSubmit} className="space-y-4 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-500" />
                <span>كلمة سر لوحة الأدمن</span>
              </label>
              <div className="relative">
                <input
                  type={showPasscode ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="off"
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    if (gateError) setGateError('');
                  }}
                  placeholder="اكتب كلمة السر..."
                  className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/35 px-4 py-3 pl-11 text-sm font-mono font-bold text-slate-900 dark:text-white focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  aria-label={showPasscode ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                >
                  {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {gateError && (
              <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-3 text-xs font-semibold text-rose-700 dark:text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{gateError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={verifyingPasscode}
              className="w-full py-3.5 rounded-2xl font-display font-black text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400 hover:brightness-105 shadow-md transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{verifyingPasscode ? 'بنتأكد...' : 'ادخل قسم عمل ونشر الامتحان'}</span>
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Top Status & Scope Header */}
      <div className="glass-surface-strong rounded-3xl p-5 sm:p-6 border border-amber-300/60 dark:border-amber-400/30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-display text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              لوحة الأدمن — اعمل وانشر امتحان في «{camp.name}»
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              تقدر من هنا تعمل امتحان جديد وتضيف أسئلته وتنشره علطول للشباب والبنات في المعسكر بس.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-xs font-mono-num tabular-nums px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 font-bold">
            {exQuestions.length} سؤال · {computedTotalScore} درجة
          </div>
          <button
            type="button"
            onClick={handleLockPanel}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>قفل القسم</span>
          </button>
        </div>
      </div>

      {publishSuccessMsg && (
        <div className="rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
            <span>{publishSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={onOpenExamsTab}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>عرض الامتحان في خانة الامتحان</span>
          </button>
        </div>
      )}

      {formError && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}

      {/* Zone 1: Bulk 50-Question AI & Star Sorter */}
      <div className="glass-surface-strong rounded-3xl border border-amber-300/60 dark:border-amber-400/30 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-display text-base sm:text-lg font-black text-slate-900 dark:text-white">
              حط الأسئلة كلها مرة واحدة (اختياري — لحد 50 سؤال)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              الزق الأسئلة بأي شكل (اختيار من متعدد، صح أو خطأ، معادلات علمية) وحط علامة * جنب الإجابة الصح، أو دوس «فرز بالذكاء الاصطناعي» عشان تتجهز علطول.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setBulkRawText(
                  `1- ما هي عاصمة جمهورية مصر العربية؟\n١- الإسكندرية\n٢- العاصمة الإدارية\n٣- القاهرة*\n٤- المنيا\n\n2- وحدة قياس شدة التيار الكهربائي هي الأمبير. (صح* / خطأ)\n\n3- إذا كان 2س + 4 = 10، فما قيمة س؟\nأ- 2\nب- 3*\nج- 4\nد- 5`
                );
                setAiParseError('');
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-xs font-bold text-amber-700 dark:text-amber-300 cursor-pointer whitespace-nowrap"
            >
              حط مثال سريع
            </button>
            {bulkRawText.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBulkRawText('');
                  setAiParseError('');
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap"
              >
                امسح الكلام
              </button>
            )}
          </div>
        </div>

        <textarea
          rows={7}
          value={bulkRawText}
          onChange={(e) => {
            setBulkRawText(e.target.value);
            if (aiParseError) setAiParseError('');
          }}
          placeholder={`اكتب أو الزق الأسئلة هنا...\nمثال:\nالسؤال الأول: ما هي عاصمة مصر؟\n١- الإسكندرية\n٢- القاهرة*\n٣- الجيزة\n٤- أسوان`}
          className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 focus:border-amber-400 focus:outline-none px-4 py-3 text-sm text-slate-900 dark:text-white leading-relaxed"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                الدرجة لكل سؤال:
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="1000"
                value={bulkDefaultScore}
                onChange={(e) => setBulkDefaultScore(Math.max(0.25, Number(e.target.value) || 1))}
                className="w-20 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-2.5 py-2 text-xs font-mono-num tabular-nums text-center text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setAiImportMode('replace')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  aiImportMode === 'replace'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                استبدال الأسئلة
              </button>
              <button
                type="button"
                onClick={() => setAiImportMode('append')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  aiImportMode === 'append'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                إضافة على القائمة
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {bulkRawText.trim().length > 0 && bulkParseResult.questions.length > 0 && (
              <button
                type="button"
                onClick={() => handleApplyBulkMcqImport(aiImportMode)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer whitespace-nowrap"
              >
                فرز فوري بعلامة * ({bulkParseResult.questions.length})
              </button>
            )}

            <button
              type="button"
              disabled={aiParsingBulk || bulkRawText.trim().length < 10}
              onClick={() => void handleAnalyzeBulkWithAI()}
              className="px-5 py-2.5 rounded-xl font-display font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400 hover:brightness-105 transition-all cursor-pointer disabled:opacity-45 flex items-center gap-2 whitespace-nowrap shadow-md"
            >
              {aiParsingBulk ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{aiParsingBulk ? 'بنفرز بالذكاء الاصطناعي...' : 'فرز بالذكاء الاصطناعي'}</span>
            </button>
          </div>
        </div>

        {aiParseError && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{aiParseError}</span>
          </div>
        )}
      </div>

      {/* Zone 2: Exam Metadata + Questions Editor Form */}
      <form
        onSubmit={handlePublishExam}
        className="glass-surface-strong rounded-3xl border border-slate-200/80 dark:border-white/10 p-5 sm:p-6 space-y-6"
      >
        <div className="space-y-4 border-b border-slate-200/80 dark:border-white/10 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base sm:text-lg font-black text-slate-900 dark:text-white">
              بيانات الامتحان الجديد
            </h3>
            <button
              type="button"
              onClick={() => setShowAdvancedExamFields((prev) => !prev)}
              className="text-xs font-bold text-purple-600 dark:text-amber-300 hover:underline cursor-pointer whitespace-nowrap"
            >
              {showAdvancedExamFields
                ? 'إخفاء الإعدادات الإضافية'
                : 'إعدادات إضافية (الوصف، التعليمات، المحاولات، النتائج)'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                اسم الامتحان *
              </label>
              <input
                type="text"
                required
                maxLength={GROUP_CAMP_LIMITS.EXAM_TITLE_MAX}
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
                placeholder="مثال: اختبار الفصل الأول — الكهربية"
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                المادة *
              </label>
              <input
                type="text"
                required
                maxLength={GROUP_CAMP_LIMITS.EXAM_SUBJECT_MAX}
                value={exSubject}
                onChange={(e) => setExSubject(e.target.value)}
                placeholder="مثال: الفيزياء"
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                المدة (دقيقة)
              </label>
              <input
                type="number"
                min={1}
                max={GROUP_CAMP_LIMITS.MAX_DURATION_MINUTES}
                value={exDurationMinutes}
                onChange={(e) => setExDurationMinutes(Math.max(1, Number(e.target.value) || 30))}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2.5 text-sm font-mono-num tabular-nums text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                موعد بداية الامتحان
              </label>
              <input
                type="datetime-local"
                value={exStartsAt}
                onChange={(e) => setExStartsAt(e.target.value)}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3 py-2.5 text-xs font-mono-num text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                موعد انتهاء الامتحان
              </label>
              <input
                type="datetime-local"
                value={exEndsAt}
                onChange={(e) => setExEndsAt(e.target.value)}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3 py-2.5 text-xs font-mono-num text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {showAdvancedExamFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-3 border-t border-slate-200/80 dark:border-white/10">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  الباب أو الوحدة
                </label>
                <input
                  type="text"
                  maxLength={GROUP_CAMP_LIMITS.EXAM_UNIT_MAX}
                  value={exUnit}
                  onChange={(e) => setExUnit(e.target.value)}
                  placeholder="اختياري"
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  عدد المحاولات المسموح بها
                </label>
                <input
                  type="number"
                  min={1}
                  max={GROUP_CAMP_LIMITS.MAX_ATTEMPTS_PER_EXAM}
                  value={exMaxAttempts}
                  onChange={(e) =>
                    setExMaxAttempts(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  وصف الامتحان
                </label>
                <input
                  type="text"
                  maxLength={GROUP_CAMP_LIMITS.EXAM_DESC_MAX}
                  value={exDesc}
                  onChange={(e) => setExDesc(e.target.value)}
                  placeholder="وصف مختصر للامتحان (اختياري)"
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  تعليمات الامتحان
                </label>
                <input
                  type="text"
                  maxLength={GROUP_CAMP_LIMITS.EXAM_INSTRUCTIONS_MAX}
                  value={exInstructions}
                  onChange={(e) => setExInstructions(e.target.value)}
                  placeholder="مثال: يُحفظ الحل تلقائيًا عند كل اختيار..."
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exAllowReview}
                    onChange={(e) => setExAllowReview(e.target.checked)}
                    className="w-4 h-4 accent-purple-600"
                  />
                  <span>السماح بمراجعة الإجابات بعد التسليم</span>
                </label>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exImmediateResults}
                    onChange={(e) => setExImmediateResults(e.target.checked)}
                    className="w-4 h-4 accent-purple-600"
                  />
                  <span>إظهار الدرجة فور التسليم</span>
                </label>
                {!exImmediateResults && (
                  <input
                    type="datetime-local"
                    value={exResultsAt}
                    onChange={(e) => setExResultsAt(e.target.value)}
                    className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3 py-2 text-xs font-mono-num text-slate-900 dark:text-white"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Questions List */}
        <div id="camp-publisher-questions-list" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                أسئلة الامتحان ({exQuestions.length})
              </h3>
              {lastAiSortSummary && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-mono-num tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    فرزنا {lastAiSortSummary.total} سؤال بالذكاء الاصطناعي
                  </span>
                  {lastAiSortSummary.byType.image_mcq > 0 && (
                    <span className="text-amber-600 dark:text-amber-300 font-bold">
                      · {lastAiSortSummary.byType.image_mcq} سؤال محتاج ترفعله صورة
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['image_mcq'] as GroupQuestionType[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      handleAddQuestion(t);
                      setQuestionFilterType('all');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{QUESTION_TYPE_LABELS[t]}</span>
                  </button>
                )
              )}
            </div>
          </div>

          {exQuestions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 w-fit">
              {(
                [
                  { id: 'all', label: `الكل (${exQuestions.length})` },
                  {
                    id: 'mcq',
                    label: `اختيار من متعدد (${exQuestions.filter((q) => q.type === 'mcq').length})`,
                  },
                  {
                    id: 'true_false',
                    label: `صح أو خطأ (${exQuestions.filter((q) => q.type === 'true_false').length})`,
                  },
                  {
                    id: 'scientific_mcq',
                    label: `علمي (${exQuestions.filter((q) => q.type === 'scientific_mcq').length})`,
                  },
                  {
                    id: 'image_mcq',
                    label: `بصورة (${exQuestions.filter((q) => q.type === 'image_mcq').length})`,
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setQuestionFilterType(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap font-mono-num tabular-nums ${
                    questionFilterType === f.id
                      ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-amber-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3.5">
            {exQuestions
              .map((q, realIdx) => ({ q, realIdx }))
              .filter(({ q }) => questionFilterType === 'all' || q.type === questionFilterType)
              .map(({ q, realIdx }) => {
                const extras = expandedQuestionExtras[q.id] || {};
                const showImageZone =
                  q.type === 'image_mcq' || Boolean(q.imageUrl) || Boolean(extras.image);
                const showExplanationZone =
                  Boolean(q.explanation) || Boolean(extras.explanation);

                return (
                  <div
                    key={q.id}
                    className="rounded-2xl bg-white/85 dark:bg-slate-900/75 border border-slate-200/90 dark:border-white/10 p-4 sm:p-5 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-white/10 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono-num tabular-nums text-sm font-black text-purple-700 dark:text-amber-300">
                          #{realIdx + 1}
                        </span>
                        <select
                          value={q.type}
                          onChange={(e) => {
                            const nextType = e.target.value as GroupQuestionType;
                            handleUpdateQuestion(q.id, (prev) => {
                              if (nextType === 'true_false') {
                                return {
                                  ...prev,
                                  type: nextType,
                                  options: ['صح', 'خطأ'],
                                  correctOptionIndex: prev.correctOptionIndex === 1 ? 1 : 0,
                                };
                              }
                              if (nextType === 'image_mcq') {
                                return {
                                  ...prev,
                                  type: nextType,
                                  options: prev.options.length >= 2 ? prev.options : ['أ', 'ب', 'ج', 'د'],
                                  correctOptionIndex: Math.min(
                                    Math.max(0, prev.correctOptionIndex),
                                    Math.max(0, (prev.options.length >= 2 ? prev.options.length : 4) - 1)
                                  ),
                                };
                              }
                              return {
                                ...prev,
                                type: nextType,
                                options:
                                  prev.options.length >= 2 &&
                                  !(
                                    prev.type === 'true_false' &&
                                    prev.options[0] === 'صح' &&
                                    prev.options[1] === 'خطأ'
                                  )
                                    ? prev.options
                                    : ['', '', '', ''],
                                correctOptionIndex: Math.min(
                                  Math.max(0, prev.correctOptionIndex),
                                  Math.max(0, prev.options.length - 1)
                                ),
                              };
                            });
                          }}
                          className="rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/15 px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-white"
                        >
                          {Object.entries(QUESTION_TYPE_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {!showImageZone && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedQuestionExtras((prev) => ({
                                ...prev,
                                [q.id]: { ...prev[q.id], image: true },
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            + صورة
                          </button>
                        )}
                        {!showExplanationZone && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedQuestionExtras((prev) => ({
                                ...prev,
                                [q.id]: { ...prev[q.id], explanation: true },
                              }))
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            + تفسير
                          </button>
                        )}

                        <label className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">
                          الدرجة:
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          max="1000"
                          value={q.score}
                          onChange={(e) =>
                            handleUpdateQuestion(q.id, (prev) => ({
                              ...prev,
                              score: Math.max(0.25, Number(e.target.value) || 1),
                            }))
                          }
                          className="w-16 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/15 px-2 py-1 text-xs font-mono-num tabular-nums text-center text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(realIdx, -1)}
                          disabled={realIdx === 0}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                          title="نقل لأعلى"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(realIdx, 1)}
                          disabled={realIdx === exQuestions.length - 1}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                          title="نقل لأسفل"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={exQuestions.length <= 1}
                          onClick={() => void handleDeleteQuestion(q)}
                          className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300 disabled:opacity-30 cursor-pointer"
                          title="حذف السؤال"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {q.type === 'scientific_mcq' && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-cyan-600 dark:text-cyan-300 font-bold ml-1.5">
                          رموز علمية:
                        </span>
                        {SCIENTIFIC_SYMBOL_SNIPPETS.map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            onClick={() =>
                              handleUpdateQuestion(q.id, (prev) => ({
                                ...prev,
                                promptText: `${prev.promptText}${sym}`,
                              }))
                            }
                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/25 font-mono text-xs text-slate-800 dark:text-white cursor-pointer"
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      rows={2}
                      maxLength={GROUP_CAMP_LIMITS.QUESTION_PROMPT_MAX}
                      value={q.promptText}
                      onChange={(e) =>
                        handleUpdateQuestion(q.id, (prev) => ({
                          ...prev,
                          promptText: e.target.value,
                        }))
                      }
                      placeholder="اكتب نص السؤال أو المعادلة هنا..."
                      className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
                    />

                    {showImageZone && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            صورة السؤال (JPG / PNG / WEBP)
                          </span>
                          {q.imageUrl && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-bold text-purple-600 dark:text-amber-300 hover:underline cursor-pointer">
                                <span>استبدال الصورة</span>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(e) => void handleUploadQuestionImage(q, e)}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => void handleRemoveQuestionImage(q)}
                                className="text-xs font-bold text-rose-500 cursor-pointer"
                              >
                                حذف الصورة
                              </button>
                            </div>
                          )}
                        </div>

                        {q.imageUrl ? (
                          <div className="rounded-xl bg-white p-2 border border-slate-200 dark:border-white/15 flex items-center justify-center max-h-60 overflow-hidden">
                            <img
                              src={q.imageUrl}
                              alt={`صورة سؤال ${realIdx + 1}`}
                              className="max-h-52 w-auto object-contain"
                            />
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-white/25 hover:border-amber-400 bg-slate-50 dark:bg-slate-900 py-3.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                            <ImagePlus className="w-4 h-4 text-amber-500" />
                            <span>
                              {uploadingQuestionId === q.id
                                ? 'بنرفع ونظبّط الصورة...'
                                : 'ارفع صورة السؤال من الجهاز'}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => void handleUploadQuestionImage(q, e)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oIdx) => {
                        const letter =
                          q.type === 'true_false'
                            ? oIdx === 0
                              ? '✓'
                              : '✕'
                            : ARABIC_OPTION_LETTERS[oIdx] || String(oIdx + 1);
                        const isCorrect = q.correctOptionIndex === oIdx;
                        return (
                          <div
                            key={oIdx}
                            className={`rounded-xl border px-2.5 py-1.5 flex items-center gap-2 ${
                              isCorrect
                                ? 'border-emerald-500/70 bg-emerald-500/10'
                                : 'border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-900'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateQuestion(q.id, (prev) => ({
                                  ...prev,
                                  correctOptionIndex: oIdx,
                                }))
                              }
                              className={`w-7 h-7 rounded-lg text-xs font-black shrink-0 cursor-pointer transition-colors ${
                                isCorrect
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-white/20'
                              }`}
                              title="حدّدها كإجابة صح"
                            >
                              {letter}
                            </button>
                            <input
                              type="text"
                              readOnly={q.type === 'true_false'}
                              maxLength={GROUP_CAMP_LIMITS.QUESTION_OPTION_MAX}
                              value={opt}
                              onChange={(e) =>
                                handleUpdateQuestion(q.id, (prev) => {
                                  const nextOpts = [...prev.options];
                                  nextOpts[oIdx] = e.target.value;
                                  return { ...prev, options: nextOpts };
                                })
                              }
                              placeholder={`الاختيار ${letter}`}
                              className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {showExplanationZone && (
                      <input
                        type="text"
                        maxLength={GROUP_CAMP_LIMITS.QUESTION_EXPLANATION_MAX}
                        value={q.explanation}
                        onChange={(e) =>
                          handleUpdateQuestion(q.id, (prev) => ({
                            ...prev,
                            explanation: e.target.value,
                          }))
                        }
                        placeholder="شرح الإجابة بعد التسليم (اختياري)..."
                        className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-3 py-2 text-xs text-slate-900 dark:text-white"
                      />
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Publish Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-white/10">
          <div className="text-xs font-mono-num tabular-nums text-slate-600 dark:text-slate-300">
            جاهز للنشر جوه «{camp.name}»: <span className="font-bold text-purple-700 dark:text-amber-300">{exQuestions.length} سؤال</span> ·{' '}
            <span className="font-bold text-slate-900 dark:text-white">{computedTotalScore} درجة</span>
          </div>

          <button
            type="submit"
            disabled={publishingExam || Boolean(uploadingQuestionId)}
            className="px-6 py-3 rounded-2xl font-display font-black text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400 hover:brightness-105 shadow-md cursor-pointer disabled:opacity-60 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>{publishingExam ? 'بنعمل وننشر الامتحان...' : 'اعمل وانشر الامتحان'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
