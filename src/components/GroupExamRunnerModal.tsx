import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Lock,
  Send,
  ShieldCheck,
  X,
  ZoomIn,
} from 'lucide-react';
import { ARABIC_OPTION_LETTERS } from '../constants/campConfig';
import {
  areAllQuestionsAnswered,
  areResultsReleased,
  computeRemainingSeconds,
  countAnsweredQuestions,
  findFirstUnansweredQuestionIndex,
  formatArabicDateTime,
  formatCountdownClock,
  isQuestionAnswered,
} from '../lib/groupCampUtils';
import {
  autoSaveAttemptAnswers,
  submitAndGradeExamAttempt,
} from '../services/groupCampService';
import {
  GroupCamp,
  GroupExam,
  GroupExamAttempt,
  GroupExamQuestion,
} from '../types/camp';

interface GroupExamRunnerModalProps {
  open: boolean;
  camp: GroupCamp;
  exam: GroupExam;
  questions: GroupExamQuestion[];
  attempt: GroupExamAttempt;
  serverNowMs: number;
  publishedExamsCount: number;
  readOnlyReviewOnly?: boolean;
  onClose: () => void;
  onAttemptCompleted: (completedAttempt: GroupExamAttempt) => void;
}

export const GroupExamRunnerModal: React.FC<GroupExamRunnerModalProps> = ({
  open,
  camp,
  exam,
  questions,
  attempt,
  serverNowMs,
  publishedExamsCount,
  readOnlyReviewOnly = false,
  onClose,
  onAttemptCompleted,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(attempt.answers || {});
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [zoomedImgUrl, setZoomedImgUrl] = useState('');
  const [finishedAttempt, setFinishedAttempt] = useState<GroupExamAttempt | null>(
    readOnlyReviewOnly || attempt.status !== 'in_progress' ? attempt : null
  );
  const [submitError, setSubmitError] = useState('');

  // Server-anchored offset: prevents local device clock changes or reload from adding time
  const clockOffsetRef = useRef<number>(serverNowMs - Date.now());
  const autoSubmittedRef = useRef<boolean>(false);
  const answersRef = useRef<Record<string, number>>(answers);
  const submittingRef = useRef<boolean>(false);
  const finishedAttemptRef = useRef<GroupExamAttempt | null>(finishedAttempt);
  const initializedKeyRef = useRef<string>('');
  const pendingSavePromiseRef = useRef<Promise<void> | null>(null);
  const saveSeqRef = useRef<number>(0);

  useEffect(() => {
    clockOffsetRef.current = serverNowMs - Date.now();
  }, [serverNowMs]);

  useEffect(() => {
    const attemptKey = `${attempt.id}:${readOnlyReviewOnly ? 'ro' : 'rw'}`;
    if (initializedKeyRef.current !== attemptKey) {
      initializedKeyRef.current = attemptKey;
      const initialAnswers = attempt.answers || {};
      answersRef.current = initialAnswers;
      setAnswers(initialAnswers);
      const isFinished = readOnlyReviewOnly || attempt.status !== 'in_progress';
      const nextFinished = isFinished ? attempt : null;
      finishedAttemptRef.current = nextFinished;
      setFinishedAttempt(nextFinished);
      setConfirmSubmitOpen(false);
      setSubmitError('');
      autoSubmittedRef.current = false;
      submittingRef.current = false;
      const firstUnanswered = findFirstUnansweredQuestionIndex(questions, initialAnswers);
      setCurrentIdx(!isFinished && firstUnanswered >= 0 ? firstUnanswered : 0);
      return;
    }

    if (readOnlyReviewOnly || attempt.status !== 'in_progress') {
      finishedAttemptRef.current = attempt;
      setFinishedAttempt(attempt);
    }
  }, [attempt, questions, readOnlyReviewOnly]);

  const getServerAlignedNowMs = useCallback(() => Date.now() + clockOffsetRef.current, []);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    computeRemainingSeconds(attempt.deadlineAtMs, serverNowMs)
  );

  const performSubmit = useCallback(
    async (status: 'submitted' | 'timed_out') => {
      if (submittingRef.current || finishedAttemptRef.current) return;

      if (status === 'submitted' && !areAllQuestionsAnswered(questions, answersRef.current)) {
        const firstUnanswered = findFirstUnansweredQuestionIndex(questions, answersRef.current);
        const answered = countAnsweredQuestions(questions, answersRef.current);
        const missing = Math.max(0, questions.length - answered);
        setConfirmSubmitOpen(false);
        setSubmitError(
          `لازم تحل / تحلي كل الأسئلة الأول قبل ما تسلم الامتحان (فاضل ${missing} سؤال لسه متحَلّش).`
        );
        if (firstUnanswered >= 0) {
          setCurrentIdx(firstUnanswered);
        }
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError('');
      try {
        if (pendingSavePromiseRef.current) {
          await pendingSavePromiseRef.current.catch(() => undefined);
        }
        const result = await submitAndGradeExamAttempt({
          camp,
          exam,
          questions,
          attempt,
          answers: answersRef.current,
          status,
          publishedExamsCount,
        });
        finishedAttemptRef.current = result;
        setFinishedAttempt(result);
        setConfirmSubmitOpen(false);
        onAttemptCompleted(result);
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : 'معرفناش نسلم الامتحان. اتأكد من النت وجرب تاني.'
        );
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [attempt, camp, exam, onAttemptCompleted, publishedExamsCount, questions]
  );

  const performSubmitRef = useRef(performSubmit);
  useEffect(() => {
    performSubmitRef.current = performSubmit;
  }, [performSubmit]);

  useEffect(() => {
    if (!open || finishedAttempt || readOnlyReviewOnly) return;

    const tick = () => {
      const secs = computeRemainingSeconds(attempt.deadlineAtMs, getServerAlignedNowMs());
      setRemainingSeconds(secs);
      if (secs <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        void performSubmitRef.current('timed_out');
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [attempt.deadlineAtMs, finishedAttempt, getServerAlignedNowMs, open, readOnlyReviewOnly]);

  const handleSelectOption = async (questionId: string, optionIndex: number) => {
    if (finishedAttemptRef.current || submittingRef.current || readOnlyReviewOnly) return;
    const next = { ...answersRef.current, [questionId]: optionIndex };
    answersRef.current = next;
    setAnswers(next);
    if (submitError) setSubmitError('');
    setSavingState('saving');
    const seq = ++saveSeqRef.current;
    const savePromise = autoSaveAttemptAnswers({
      campId: camp.id,
      examId: exam.id,
      attemptId: attempt.id,
      answers: next,
    });
    pendingSavePromiseRef.current = savePromise;
    try {
      await savePromise;
      if (saveSeqRef.current === seq) {
        setSavingState('saved');
      }
    } catch {
      if (saveSeqRef.current === seq) {
        setSavingState('error');
      }
    } finally {
      if (pendingSavePromiseRef.current === savePromise) {
        pendingSavePromiseRef.current = null;
      }
    }
  };

  const answeredCount = useMemo(
    () => countAnsweredQuestions(questions, answers),
    [answers, questions]
  );
  const firstUnansweredIdx = useMemo(
    () => findFirstUnansweredQuestionIndex(questions, answers),
    [answers, questions]
  );
  const allAnswered = questions.length > 0 && firstUnansweredIdx === -1;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  if (!open) return null;

  const currentQuestion = questions[currentIdx];
  const isUrgent = remainingSeconds <= 300;
  const isCritical = remainingSeconds <= 60;
  const resultsUnlocked = areResultsReleased(exam, getServerAlignedNowMs());

  // Submitted / Results / Review Screen
  if (finishedAttempt) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div className="glass-surface-strong rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 my-auto max-h-[92vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 dark:border-white/10 pb-4">
            <div>
              <div className="text-xs font-bold text-purple-600 dark:text-purple-300">
                {exam.subject} {exam.unit ? `· ${exam.unit}` : ''}
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                {exam.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                المحاولة رقم {finishedAttempt.attemptNumber} ·{' '}
                {finishedAttempt.status === 'timed_out'
                  ? 'الوقت خلص والامتحان اتسلم لوحده'
                  : 'اتسلّم تمام'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!resultsUnlocked ? (
            <div className="rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/35 p-6 text-center space-y-3">
              <Lock className="w-10 h-10 text-amber-500 mx-auto" />
              <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
                إجاباتك اتحفظت واتسلمت بأمان
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                درجتك وتفاصيل الإجابات هتظهرلك في ميعاد إعلان النتيجة:
              </p>
              <div className="font-mono-num tabular-nums text-sm font-bold text-amber-700 dark:text-amber-300">
                {formatArabicDateTime(exam.resultsReleaseAtMs)}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-500/30 p-4 text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-300">الدرجة المحققة</div>
                  <div className="font-mono-num tabular-nums text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                    {finishedAttempt.score} / {finishedAttempt.maxScore}
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/40 border border-purple-200 dark:border-purple-500/30 p-4 text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-300">النسبة المئوية</div>
                  <div className="font-mono-num tabular-nums text-3xl font-black text-purple-700 dark:text-purple-300 mt-1">
                    {finishedAttempt.percentage}%
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/50 dark:to-sky-950/40 border border-cyan-200 dark:border-cyan-500/30 p-4 text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-300">الإجابات الصحيحة</div>
                  <div className="font-mono-num tabular-nums text-3xl font-black text-cyan-700 dark:text-cyan-300 mt-1">
                    {finishedAttempt.correctCount} / {finishedAttempt.totalQuestions}
                  </div>
                </div>
              </div>

              {!exam.allowReviewAfterSubmit ? (
                <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/70 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Eye className="w-4 h-4 shrink-0" />
                  <span>مراجعة الأسئلة والإجابات الصح مش مفتوحة للامتحان ده من الإدارة.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    مراجعة الإجابات بالتفصيل
                  </h3>
                  {questions.map((q, idx) => {
                    const studentAns = (finishedAttempt.answers || {})[q.id];
                    const isCorrect = studentAns === q.correctOptionIndex;
                    return (
                      <div
                        key={q.id}
                        className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
                          isCorrect
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-500/30'
                            : 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-200 dark:border-rose-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs font-bold">
                          <span className="text-slate-700 dark:text-slate-200">
                            سؤال {idx + 1} · ({q.score} درجة)
                          </span>
                          <span
                            className={
                              isCorrect
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-rose-700 dark:text-rose-300'
                            }
                          >
                            {isCorrect ? 'إجابة صح' : 'إجابة غلط'}
                          </span>
                        </div>

                        {q.promptText && (
                          <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap leading-relaxed">
                            {q.promptText}
                          </p>
                        )}

                        {q.imageUrl && (
                          <img
                            src={q.imageUrl}
                            alt={`صورة السؤال ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="max-h-72 w-auto mx-auto rounded-xl border border-slate-200 dark:border-white/15 object-contain bg-white"
                          />
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {q.options.map((opt, optIdx) => {
                            const letter = ARABIC_OPTION_LETTERS[optIdx] || String(optIdx + 1);
                            const chosen = studentAns === optIdx;
                            const correct = q.correctOptionIndex === optIdx;
                            return (
                              <div
                                key={optIdx}
                                className={`px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                                  correct
                                    ? 'bg-emerald-100/80 dark:bg-emerald-900/40 border-emerald-400 text-emerald-900 dark:text-emerald-100 font-bold'
                                    : chosen
                                      ? 'bg-rose-100/80 dark:bg-rose-900/40 border-rose-400 text-rose-900 dark:text-rose-100 font-bold'
                                      : 'bg-white/70 dark:bg-slate-900/50 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span>
                                  {q.type === 'image_mcq' ? `${letter}) ` : `${letter} - `}
                                  {opt}
                                </span>
                                {correct && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 rounded-xl p-3 border border-slate-200/70 dark:border-white/10">
                            <span className="font-bold ml-1">التوضيح:</span>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 cursor-pointer"
            >
              العودة إلى خانة الامتحانات
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col">
      {/* Top Exam Runner Header */}
      <header className="bg-white/95 dark:bg-[#130e27]/95 border-b border-slate-200 dark:border-fuchsia-500/25 px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{exam.subject}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                السؤال {currentIdx + 1} من {questions.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                حليت: {answeredCount}/{questions.length}
              </span>
            </div>
            <h2 className="font-display text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
              {exam.title}
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>
                {savingState === 'saving'
                  ? 'بنحفظ...'
                  : savingState === 'error'
                    ? 'بنجرب نحفظ تاني...'
                    : 'متحفظ لوحده'}
              </span>
            </div>

            <div
              className={`px-4 py-2 rounded-xl border font-mono-num tabular-nums font-black text-sm sm:text-base flex items-center gap-2 ${
                isCritical
                  ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                  : isUrgent
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-white/10'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatCountdownClock(remainingSeconds)}</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              title="خروج مؤقت (الوقت شغال وإجاباتك محفوظة)"
            >
              قفل مؤقت
            </button>
          </div>
        </div>
      </header>

      {/* Main Question Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-8">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Question Navigator Grid */}
          <div className="glass-surface-strong rounded-2xl p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              {questions.map((q, idx) => {
                const isAnswered = isQuestionAnswered(q, answers);
                const isCurrent = idx === currentIdx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl font-mono-num tabular-nums text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 text-white shadow-md scale-105'
                        : isAnswered
                          ? 'bg-emerald-500/20 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border border-emerald-400/50'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-purple-300'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current Question Card */}
          {currentQuestion && (
            <div className="glass-surface-strong rounded-3xl p-5 sm:p-8 space-y-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold text-purple-700 dark:text-purple-300">
                  السؤال رقم {currentIdx + 1} من {questions.length}
                </span>
                <span className="font-mono-num tabular-nums font-bold">
                  الدرجة: {currentQuestion.score}
                </span>
              </div>

              {currentQuestion.promptText && (
                <div
                  className={`text-base sm:text-lg font-medium text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap ${
                    currentQuestion.type === 'scientific_mcq' ? 'font-mono tracking-wide' : ''
                  }`}
                >
                  {currentQuestion.promptText}
                </div>
              )}

              {/* Image Question Stage (Supports JPG, PNG, WEBP clearly on mobile/tablet) */}
              {currentQuestion.imageUrl && (
                <div className="relative rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 p-3 sm:p-4 text-center">
                  <img
                    src={currentQuestion.imageUrl}
                    alt={`صورة السؤال ${currentIdx + 1}`}
                    referrerPolicy="no-referrer"
                    className="max-h-[420px] w-full object-contain mx-auto rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setZoomedImgUrl(currentQuestion.imageUrl)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>تكبير الصورة</span>
                  </button>
                </div>
              )}

              {/* Answer Buttons: Special 4-button row/grid right under Image Questions, or clean option cards */}
              {currentQuestion.type === 'image_mcq' ? (
                <div className="space-y-3 pt-1">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    اختار / اختاري الإجابة الصح من الزراير الأربعة تحت الصورة:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {currentQuestion.options.slice(0, 4).map((opt, optIdx) => {
                      const letter = ARABIC_OPTION_LETTERS[optIdx] || String(optIdx + 1);
                      const isSelected = answers[currentQuestion.id] === optIdx;
                      const customText = opt.trim();
                      const showSubLabel =
                        customText &&
                        customText !== letter &&
                        customText !== `الاختيار ${letter}`;
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          onClick={() => handleSelectOption(currentQuestion.id, optIdx)}
                          className={`min-h-[68px] p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-display transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-br from-pink-500 via-purple-600 to-cyan-500 text-white border-transparent shadow-lg scale-[1.02]'
                              : 'bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white border-slate-200 dark:border-white/15 hover:border-purple-400 dark:hover:border-fuchsia-400'
                          }`}
                        >
                          <span className="text-xl font-black">{letter}</span>
                          {showSubLabel && (
                            <span
                              className={`text-xs font-semibold line-clamp-2 ${
                                isSelected ? 'text-white/95' : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {customText}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {currentQuestion.options.map((opt, optIdx) => {
                    const letter =
                      currentQuestion.type === 'true_false'
                        ? optIdx === 0
                          ? '✓'
                          : '✗'
                        : ARABIC_OPTION_LETTERS[optIdx] || String(optIdx + 1);
                    const isSelected = answers[currentQuestion.id] === optIdx;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => handleSelectOption(currentQuestion.id, optIdx)}
                        className={`w-full text-right px-4 py-3.5 rounded-2xl border-2 flex items-center gap-3.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-r from-pink-500/15 via-purple-500/15 to-cyan-500/15 border-purple-500 dark:border-fuchsia-400 text-slate-900 dark:text-white shadow-sm'
                            : 'bg-white/90 dark:bg-slate-900/75 border-slate-200 dark:border-white/15 text-slate-800 dark:text-slate-200 hover:border-purple-300 dark:hover:border-purple-400/50'
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-xl font-display font-black text-sm flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {letter}
                        </span>
                        <span className="text-sm sm:text-base font-medium leading-snug flex-1">
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div className="rounded-2xl bg-rose-950/90 border border-rose-500/50 px-4 py-3 text-xs sm:text-sm text-rose-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls Footer */}
      <footer className="bg-white/95 dark:bg-[#130e27]/95 border-t border-slate-200 dark:border-fuchsia-500/25 px-4 sm:px-6 py-3.5">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>السؤال اللي قبله</span>
            </button>

            <button
              type="button"
              disabled={currentIdx >= questions.length - 1}
              onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <span>السؤال اللي بعده</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mr-auto">
            {!allAnswered && firstUnansweredIdx >= 0 && (
              <button
                type="button"
                onClick={() => setCurrentIdx(firstUnansweredIdx)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-500/40 hover:bg-amber-200/80 dark:hover:bg-amber-900/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                فاضل {unansweredCount} سؤال · روح لسؤال #{firstUnansweredIdx + 1}
              </button>
            )}

            <button
              type="button"
              disabled={submitting || !allAnswered}
              onClick={() => {
                if (!allAnswered) {
                  if (firstUnansweredIdx >= 0) setCurrentIdx(firstUnansweredIdx);
                  return;
                }
                setConfirmSubmitOpen(true);
              }}
              title={
                allAnswered
                  ? 'سلّم الامتحان دلوقتي'
                  : `لازم تحل / تحلي كل الأسئلة الأول (فاضل ${unansweredCount} سؤال)`
              }
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
                allAnswered
                  ? 'text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shadow-md hover:brightness-105 cursor-pointer disabled:opacity-60'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-white/10 cursor-not-allowed opacity-80'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>
                {allAnswered
                  ? `سلّم الامتحان (${answeredCount}/${questions.length})`
                  : `حل / حلي كل الأسئلة للتسليم (${answeredCount}/${questions.length})`}
              </span>
            </button>
          </div>
        </div>
      </footer>

      {/* Confirmation Dialog (Zero window.confirm) */}
      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-surface-strong rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
              متأكد / متأكدة من تسليم الامتحان؟
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              حليت كل الأسئلة (
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {answeredCount} / {questions.length}
              </span>
              ) تمام!
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              بعد التسليم مش هتقدر / هتقدري تعدّل الإجابات في المحاولة دي.
            </p>
            {submitError && (
              <div className="rounded-xl bg-rose-950/85 border border-rose-500/40 px-3 py-2 text-xs text-rose-100">
                {submitError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmSubmitOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                راجع الأسئلة
              </button>
              <button
                type="button"
                disabled={submitting || !allAnswered}
                onClick={() => void performSubmit('submitted')}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'بنسلّم...' : 'أيوة، سلّم دلوقتي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Zoom */}
      {zoomedImgUrl && (
        <div
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImgUrl('')}
        >
          <button
            type="button"
            onClick={() => setZoomedImgUrl('')}
            className="fixed top-4 left-4 p-2 rounded-xl bg-white/15 text-white hover:bg-white/25 cursor-pointer"
            aria-label="إغلاق التكبير"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={zoomedImgUrl}
            alt="تكبير صورة السؤال"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl"
          />
        </div>
      )}
    </div>
  );
};
