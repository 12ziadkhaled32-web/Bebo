import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Lock,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import { trackUserLogin } from '../lib/analytics';
import {
  getEgyptianPhoneValidationError,
  getSecurityAnswerValidationError,
  getStudentPasswordValidationError,
  mapStudentAuthError,
  normalizeDigitsToLatin,
  normalizeEgyptianPhoneInput,
} from '../lib/phoneAuthUtils';
import {
  fetchSecurityQuestionForPhone,
  resetPasswordWithSecurityAnswer,
} from '../services/studentAuthService';
import { UserProfile } from '../types/camp';

interface ForgotPasswordModalProps {
  open: boolean;
  initialPhone?: string;
  onClose: () => void;
  onResetCompleted: (migratedProfile: UserProfile | null) => void;
}

type ResetStep = 'phone' | 'answer_and_reset';

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  open,
  initialPhone = '',
  onClose,
  onResetCompleted,
}) => {
  const [step, setStep] = useState<ResetStep>('phone');
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('phone');
    setPhoneInput(initialPhone ? normalizeEgyptianPhoneInput(initialPhone) : '');
    setSecurityQuestion('');
    setSecurityAnswer('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowPasswords(false);
    setErrorMsg('');
  }, [open, initialPhone]);

  if (!open) return null;

  const handleLookupQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const localPhone = normalizeEgyptianPhoneInput(phoneInput);
    const phoneErr = getEgyptianPhoneValidationError(localPhone);
    if (phoneErr) {
      setErrorMsg(phoneErr);
      return;
    }

    setErrorMsg('');
    setBusy(true);
    try {
      const res = await fetchSecurityQuestionForPhone(localPhone);
      if (!res.exists || !res.question) {
        setErrorMsg(
          'رقم الموبايل ده ملوش سؤال أمان متسجل أو لسه متعملش بيه حساب. اتأكد من الرقم أو تواصل مع أدمن المعسكر.'
        );
        return;
      }
      setPhoneInput(localPhone);
      setSecurityQuestion(res.question);
      setStep('answer_and_reset');
    } catch (err) {
      setErrorMsg(mapStudentAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const localPhone = normalizeEgyptianPhoneInput(phoneInput);
    const phoneErr = getEgyptianPhoneValidationError(localPhone);
    if (phoneErr) {
      setErrorMsg(phoneErr);
      setStep('phone');
      return;
    }

    const ansErr = getSecurityAnswerValidationError(securityAnswer);
    if (ansErr) {
      setErrorMsg(ansErr);
      return;
    }

    const passErr = getStudentPasswordValidationError(newPassword);
    if (passErr) {
      setErrorMsg(passErr);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('كلمتين السر مش زي بعض.. راجعهم واتأكد إنهم متطابقين.');
      return;
    }

    setErrorMsg('');
    setBusy(true);
    try {
      const { migratedProfile } = await resetPasswordWithSecurityAnswer({
        local01: localPhone,
        securityAnswer,
        newPassword,
      });
      trackUserLogin('phone_recovery');
      onResetCompleted(migratedProfile);
    } catch (err) {
      setErrorMsg(mapStudentAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="glass-surface-strong rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 border border-pink-200/80 dark:border-fuchsia-500/35 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 via-pink-500 to-purple-600 text-white flex items-center justify-center shadow-md shrink-0">
              {step === 'phone' ? (
                <HelpCircle className="w-5 h-5" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-rose-600 dark:text-pink-400">
                {step === 'phone'
                  ? 'الخطوة 1 من 2 · رقم الموبايل'
                  : 'الخطوة 2 من 2 · سؤال الأمان وكلمة السر الجديدة'}
              </div>
              <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                استرجاع كلمة السر بدون رسائل SMS
              </h3>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="إغلاق"
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2-Step Visual Bar */}
        <div className="grid grid-cols-2 gap-2" aria-hidden="true">
          <div className="h-1.5 rounded-full bg-gradient-to-l from-rose-500 to-purple-600" />
          <div
            className={`h-1.5 rounded-full transition-all ${
              step === 'answer_and_reset'
                ? 'bg-gradient-to-l from-rose-500 to-purple-600'
                : 'bg-slate-200 dark:bg-slate-800'
            }`}
          />
        </div>

        {step === 'phone' && (
          <form onSubmit={handleLookupQuestion} className="space-y-4">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              اكتب / اكتبي رقم موبايلك المصري اللي سجلت بيه، وهنعرضلك سؤال الأمان اللي اخترته عشان تغيّر كلمة السر فورًا من غير أي رسائل نصية.
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="forgot-phone-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                رقم الموبايل (11 رقم يبدأ بـ 01)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="forgot-phone-input"
                  type="tel"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={14}
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(normalizeDigitsToLatin(e.target.value));
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="01012345678"
                  className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 pr-10 pl-4 py-3 text-sm font-mono-num text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/45 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-200"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-l from-rose-600 via-pink-600 to-purple-600 text-white font-display font-bold text-sm hover:brightness-110 transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{busy ? 'بندور على سؤال الأمان...' : 'اعرض سؤال الأمان'}</span>
            </button>
          </form>
        )}

        {step === 'answer_and_reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span>
                الرقم: <strong dir="ltr" className="font-mono-num text-slate-900 dark:text-white">{phoneInput}</strong>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep('phone');
                  setErrorMsg('');
                }}
                className="text-rose-600 dark:text-pink-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>تغيير الرقم</span>
              </button>
            </div>

            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/45 border border-emerald-200 dark:border-emerald-500/35 px-3.5 py-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>سؤال الأمان بتاعك:</span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {securityQuestion}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="forgot-security-answer"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                إجابة سؤال الأمان
              </label>
              <input
                id="forgot-security-answer"
                type="text"
                autoFocus
                value={securityAnswer}
                onChange={(e) => {
                  setSecurityAnswer(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="اكتب / اكتبي الإجابة السرية اللي سجلتها"
                className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="forgot-new-password"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                كلمة السر الجديدة
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="forgot-new-password"
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="على الأقل 6 حروف أو أرقام"
                  className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 pr-10 pl-10 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords((prev) => !prev)}
                  aria-label={showPasswords ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="forgot-confirm-password"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                تأكيد كلمة السر الجديدة
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="forgot-confirm-password"
                  type={showPasswords ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(e) => {
                    setConfirmNewPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="اكتب / اكتبي نفس كلمة السر تاني"
                  className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 pr-10 pl-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/45 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-200"
              >
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-l from-rose-600 via-pink-600 to-purple-600 text-white font-display font-bold text-sm hover:brightness-110 transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{busy ? 'بنحفظ كلمة السر ونسترجع حسابك...' : 'حفظ كلمة السر الجديدة ودخول المعسكر'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
