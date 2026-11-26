import React, { useEffect, useRef, useState } from 'react';
import { User, signOut } from 'firebase/auth';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Moon,
  Phone,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import landingCampHeroImg from '../assets/images/landing_camp_hero_1795175289734.jpg';
import { FIELD_LIMITS } from '../constants/campConfig';
import {
  trackPageView,
  trackUserLogin,
  trackUserSignup,
} from '../lib/analytics';
import {
  getTripleNameValidationError,
  getValidNameParts,
  isPersonalAvatarUrl,
  normalizeTripleName,
} from '../lib/avatarUtils';
import { auth } from '../lib/firebase';
import {
  getEgyptianPhoneValidationError,
  getSecurityAnswerValidationError,
  getStudentPasswordValidationError,
  isValidEgyptianMobile,
  normalizeDigitsToLatin,
  normalizeEgyptianPhoneInput,
  resolveStudentPhoneE164FromAuth,
  SECURITY_QUESTIONS,
  toLocalEgyptianPhone,
} from '../lib/phoneAuthUtils';
import { upsertUserProfile } from '../services/campService';
import {
  signInStudentWithPhonePassword,
  signUpStudentWithPhonePassword,
} from '../services/studentAuthService';
import { UserProfile } from '../types/camp';
import { AvatarPicker } from './AvatarPicker';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface AuthOnboardingProps {
  firebaseUser: User | null;
  profile: UserProfile | null;
  onProfileSaved: (updated: UserProfile | null) => void;
  onRequestDeleteAccount?: () => void;
  accountDeletedNotice?: string;
  onDismissAccountDeletedNotice?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const AuthOnboarding: React.FC<AuthOnboardingProps> = ({
  firebaseUser,
  profile,
  onProfileSaved,
  onRequestDeleteAccount,
  accountDeletedNotice = '',
  onDismissAccountDeletedNotice,
  theme,
  onToggleTheme,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [phoneInput, setPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  // Profile step state
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatarUrl || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [heroBroken, setHeroBroken] = useState(false);

  const phoneFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (firebaseUser && !profile) {
      setDisplayName('');
      setSelectedAvatar('');
      setProfileError('');
    } else if (profile) {
      setDisplayName(profile.displayName);
      setSelectedAvatar(profile.avatarUrl);
    }
  }, [firebaseUser, profile]);

  useEffect(() => {
    if (!firebaseUser) {
      trackPageView('auth_login', false);
    } else if (!profile) {
      trackPageView('auth_profile', false);
    }
  }, [firebaseUser, profile]);

  const handleFocusAuthForm = () => {
    phoneFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => phoneFieldRef.current?.focus(), 250);
  };

  const handlePhoneAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const localPhone = normalizeEgyptianPhoneInput(phoneInput);
    const phoneErr = getEgyptianPhoneValidationError(localPhone);
    if (phoneErr) {
      setAuthError(phoneErr);
      return;
    }

    const passErr = getStudentPasswordValidationError(passwordInput);
    if (passErr) {
      setAuthError(passErr);
      return;
    }

    if (authMode === 'signup') {
      if (passwordInput !== confirmPasswordInput) {
        setAuthError('كلمتين السر مش زي بعض.. راجعهم واتأكد إنهم متطابقين.');
        return;
      }
      const ansErr = getSecurityAnswerValidationError(securityAnswer);
      if (ansErr) {
        setAuthError(ansErr);
        return;
      }
    }

    setPhoneInput(localPhone);
    setAuthError('');
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        await signUpStudentWithPhonePassword({
          local01: localPhone,
          password: passwordInput,
          securityQuestion,
          securityAnswer,
        });
        trackUserSignup('phone_password');
      } else {
        await signInStudentWithPhonePassword(localPhone, passwordInput);
        trackUserLogin('phone_password');
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'حصلت مشكلة في تسجيل الدخول دلوقتي.. حاول / حاولي تاني.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const normalizedName = normalizeTripleName(displayName);
    const nameValidationError = getTripleNameValidationError(normalizedName);
    if (nameValidationError) {
      setProfileError(nameValidationError);
      return;
    }
    if (!isPersonalAvatarUrl(selectedAvatar)) {
      setProfileError('لو سمحت ارفع أو ارفعي صورتك الشخصية الحقيقية الأول علشان نعرفك في الامتحانات.');
      return;
    }

    const resolvedPhone = resolveStudentPhoneE164FromAuth({
      phoneNumber: firebaseUser.phoneNumber,
      email: firebaseUser.email,
      profilePhone: profile?.phone,
    });

    setProfileError('');
    setProfileBusy(true);
    try {
      const isFirstSignup = !profile;
      await upsertUserProfile({
        uid: firebaseUser.uid,
        displayName: normalizedName,
        avatarUrl: selectedAvatar,
        email: firebaseUser.email || '',
        phone: resolvedPhone,
        groupCampId: profile?.groupCampId || '',
        existingProfile: profile,
      });
      if (isFirstSignup) {
        trackUserSignup('phone_password');
      }
      onProfileSaved({
        uid: firebaseUser.uid,
        displayName: normalizedName.slice(0, FIELD_LIMITS.DISPLAY_NAME_MAX),
        avatarUrl: selectedAvatar,
        campId: profile?.campId || '',
        email: firebaseUser.email || '',
        phone: resolvedPhone,
        groupCampId: profile?.groupCampId || '',
        createdAt: profile?.createdAt as UserProfile['createdAt'],
        updatedAt: profile?.updatedAt as UserProfile['updatedAt'],
      });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'مقدرناش نحفظ بيانات ملفك دلوقتي.');
    } finally {
      setProfileBusy(false);
    }
  };

  const ThemeFloatButton = (
    <button
      type="button"
      onClick={onToggleTheme}
      aria-label={theme === 'dark' ? 'حوّل للوضع النهاري' : 'حوّل للوضع الليلي'}
      className="fixed top-4 left-4 z-40 px-3.5 py-2 rounded-2xl glass-surface text-xs font-bold text-slate-700 dark:text-amber-300 flex items-center gap-2 hover:scale-105 transition-transform cursor-pointer"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
    </button>
  );

  // Screen 1: Landing & Phone+Password Sign-In (plus Zero-SMS Forgot-Password Modal)
  if (!firebaseUser) {
    const normalizedPreview = normalizeEgyptianPhoneInput(phoneInput);
    const isPhoneReady = isValidEgyptianMobile(normalizedPreview);

    return (
      <div className="min-h-screen bg-[#FCFBF9] dark:bg-[#0D0A1A] text-slate-900 dark:text-slate-100 relative overflow-x-clip">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_75%_55%_at_50%_-10%,rgba(236,72,153,0.12),rgba(168,85,247,0.06)_50%,transparent_80%)] dark:bg-[radial-gradient(ellipse_75%_55%_at_50%_-10%,rgba(236,72,153,0.18),rgba(139,92,246,0.11)_52%,transparent_82%)]"
        />

        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/10 bg-[#FCFBF9]/85 dark:bg-[#0D0A1A]/85 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <a
              href="#top"
              className="flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 rounded-lg"
            >
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 via-pink-500 to-purple-600 text-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="font-display font-black text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white">
                معسكر مغلق
              </span>
            </a>

            <nav aria-label="أقسام الصفحة" className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <a
                href="#how-it-works"
                className="whitespace-nowrap shrink-0 hover:text-rose-600 dark:hover:text-pink-300 transition-colors"
              >
                إزاي بنبدأ
              </a>
            </nav>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={theme === 'dark' ? 'حوّل للوضع النهاري' : 'حوّل للوضع الليلي'}
                className="px-3 py-2 rounded-xl border border-slate-200/90 dark:border-white/15 bg-white/70 dark:bg-white/5 text-xs font-bold text-slate-700 dark:text-amber-300 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span className="hidden sm:inline">{theme === 'dark' ? 'نهاري' : 'ليلي'}</span>
              </button>

              <button
                type="button"
                onClick={handleFocusAuthForm}
                className="px-4 py-2 rounded-xl bg-gradient-to-l from-rose-600 via-pink-600 to-purple-600 text-white font-display font-bold text-xs sm:text-sm hover:brightness-110 transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                دخول / حساب جديد
              </button>
            </div>
          </div>
        </header>

        <main id="top" className="relative z-10">
          {/* Hero Section */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-20">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <p className="text-xs sm:text-sm font-semibold text-rose-700 dark:text-pink-300">
                لشباب وبنات تالتة ثانوي · معسكرات جماعية لحد 50 طالب وطالبة · امتحانات وتنافس بجد
              </p>

              <h1 className="font-display font-black text-slate-900 dark:text-white leading-[1.2] tracking-tight text-[clamp(2.15rem,4.4vw,3.65rem)]">
                متراكم عليكم؟ مش لوحدكم..{' '}
                <span className="bg-gradient-to-l from-rose-600 via-fuchsia-600 to-amber-500 dark:from-pink-400 dark:via-fuchsia-400 dark:to-amber-300 bg-clip-text text-transparent">
                  هننافس ونقفل المواد سوا!
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mx-auto">
                انضم أو انضمي لمعسكر جماعي مع صحابك وزمايلك بكود دعوة خاص أو اعملوا معسكركم دلوقتي. ادخلوا الامتحانات التنافسية، تابعوا ترتيبكم في التصنيف العام لحظة بلحظة، وشاركوا الأسئلة والردود في ركن «سؤال صغنن 🌸».
              </p>

              {accountDeletedNotice && (
                <div
                  role="status"
                  className="max-w-xl mx-auto rounded-2xl border border-emerald-300 dark:border-emerald-500/45 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3 text-right"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>{accountDeletedNotice}</span>
                  </div>
                  {onDismissAccountDeletedNotice && (
                    <button
                      type="button"
                      onClick={onDismissAccountDeletedNotice}
                      aria-label="اقفل التنبيه"
                      className="p-1 rounded-lg hover:bg-emerald-200/60 dark:hover:bg-emerald-800/60 cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {/* Student Egyptian Phone + Password Auth Card (Zero SMS) */}
              <div className="max-w-md mx-auto pt-2 text-right">
                <div className="glass-surface-strong rounded-3xl border border-slate-200/90 dark:border-white/15 p-5 sm:p-6 shadow-[0_22px_55px_-22px_rgba(15,23,42,0.22)] dark:shadow-[0_24px_65px_-20px_rgba(0,0,0,0.7)] space-y-4">
                  {/* Segmented Switch: Sign In / Create Account */}
                  <div
                    role="tablist"
                    aria-label="نوع الدخول"
                    className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-white/10"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'login'}
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError('');
                      }}
                      className={`py-2.5 px-3 rounded-xl font-display font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                        authMode === 'login'
                          ? 'bg-white dark:bg-[#231942] text-rose-700 dark:text-pink-300 shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      تسجيل الدخول
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'signup'}
                      onClick={() => {
                        setAuthMode('signup');
                        setAuthError('');
                      }}
                      className={`py-2.5 px-3 rounded-xl font-display font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                        authMode === 'signup'
                          ? 'bg-white dark:bg-[#231942] text-rose-700 dark:text-pink-300 shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      حساب جديد
                    </button>
                  </div>

                  <form onSubmit={handlePhoneAuthSubmit} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="student-phone-input"
                          className="text-xs font-bold text-slate-700 dark:text-slate-200"
                        >
                          رقم الموبايل المصري (11 رقم يبدأ بـ 01)
                        </label>
                        {phoneInput.trim().length > 0 && (
                          <span
                            className={`text-[11px] font-bold ${
                              isPhoneReady
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-300'
                            }`}
                          >
                            {isPhoneReady ? 'رقم مظبوط ✓' : `${normalizedPreview.length}/11`}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          ref={phoneFieldRef}
                          id="student-phone-input"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          dir="ltr"
                          maxLength={14}
                          value={phoneInput}
                          onChange={(e) => {
                            setPhoneInput(normalizeDigitsToLatin(e.target.value));
                            if (authError) setAuthError('');
                          }}
                          placeholder="01012345678"
                          className="w-full rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-white/15 pr-10 pl-4 py-3 text-sm font-mono-num text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="student-password-input"
                          className="text-xs font-bold text-slate-700 dark:text-slate-200"
                        >
                          كلمة السر
                        </label>
                        {authMode === 'login' && (
                          <button
                            type="button"
                            onClick={() => setForgotModalOpen(true)}
                            className="text-xs font-bold text-rose-600 dark:text-pink-400 hover:underline cursor-pointer"
                          >
                            نسيت كلمة السر؟
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="student-password-input"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                          value={passwordInput}
                          onChange={(e) => {
                            setPasswordInput(e.target.value);
                            if (authError) setAuthError('');
                          }}
                          placeholder={authMode === 'signup' ? 'على الأقل 6 حروف أو أرقام' : 'اكتب / اكتبي كلمة السر'}
                          className="w-full rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-white/15 pr-10 pl-10 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {authMode === 'signup' && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label
                            htmlFor="student-confirm-password-input"
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                          >
                            تأكيد كلمة السر
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              id="student-confirm-password-input"
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              value={confirmPasswordInput}
                              onChange={(e) => {
                                setConfirmPasswordInput(e.target.value);
                                if (authError) setAuthError('');
                              }}
                              placeholder="اكتب / اكتبي نفس كلمة السر تاني"
                              className="w-full rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-white/15 pr-10 pl-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor="student-security-question"
                            className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                          >
                            سؤال أمان (لو نسيت كلمة السر بدون SMS)
                          </label>
                          <select
                            id="student-security-question"
                            value={securityQuestion}
                            onChange={(e) => setSecurityQuestion(e.target.value)}
                            className="w-full rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-white/15 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                          >
                            {SECURITY_QUESTIONS.map((q) => (
                              <option key={q} value={q}>
                                {q}
                              </option>
                            ))}
                          </select>
                          <input
                            id="student-security-answer"
                            type="text"
                            maxLength={120}
                            value={securityAnswer}
                            onChange={(e) => {
                              setSecurityAnswer(e.target.value);
                              if (authError) setAuthError('');
                            }}
                            placeholder="اكتب / اكتبي إجابتك السرية هنا (مثلاً: الفيزياء)"
                            className="w-full rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-white/15 px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                          />
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          التسجيل والاسترجاع شغالين بالكامل من غير أي رسائل SMS.
                        </p>
                      </div>
                    )}

                    {authError && (
                      <div
                        role="alert"
                        className="rounded-2xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/60 px-3.5 py-2.5 text-xs font-semibold text-rose-800 dark:text-rose-200"
                      >
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authBusy}
                      className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-l from-rose-600 via-pink-600 to-purple-600 text-white font-display font-extrabold text-sm sm:text-base shadow-[0_14px_32px_-10px_rgba(225,29,72,0.5)] hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      <span>
                        {authBusy
                          ? authMode === 'signup'
                            ? 'بنفتحلك حساب جديد...'
                            : 'بنسجّل دخولك...'
                          : authMode === 'signup'
                            ? 'اعمل / اعملي حساب جديد'
                            : 'ادخل / ادخلي المعسكر'}
                      </span>
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>

              <div className="pt-1 flex justify-center">
                <a
                  href="#how-it-works"
                  className="text-sm font-display font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-pink-300 transition-colors"
                >
                  شوفوا بتبدأوا إزاي ↓
                </a>
              </div>
            </div>

            {/* Clean Full-Bleed 16:9 Editorial Artwork Carrier */}
            <div className="mt-10 sm:mt-12 rounded-3xl overflow-hidden border border-slate-200/90 dark:border-white/10 bg-slate-900 shadow-[0_24px_65px_-22px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_75px_-20px_rgba(0,0,0,0.75)] aspect-video">
              {!heroBroken ? (
                <img
                  src={landingCampHeroImg}
                  alt="طلبة وطالبات بيذاكروا مع بعض بالليل على مكتب دافي في جو هادي"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroBroken(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-8 text-center bg-gradient-to-br from-[#1d1135] via-[#2b143b] to-[#14172b] text-white">
                  <Sparkles className="w-10 h-10 text-amber-300" />
                  <p className="font-display font-bold text-xl">معسكر مغلق — معسكرات جماعية تنافسية</p>
                  <p className="text-sm text-slate-300 max-w-md">
                    امتحانات جماعية، تصنيف لحظي، وركن سؤال صغنن لكل شباب وبنات المعسكر.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Section 1: 3-Step Flow */}
          <section
            id="how-it-works"
            className="border-t border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/[0.02]"
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
              <div className="max-w-2xl space-y-2 mb-12">
                <p className="text-xs font-bold text-rose-600 dark:text-pink-400">
                  خطوات البداية
                </p>
                <h2 className="font-display text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
                  بتبدأوا إزاي في أقل من دقيقة؟
                </h2>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
                  مفيش أي لفة أو تعقيد — 3 خطوات بس وتدخلوا معسكركم الجماعي فورًا.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-200/90 dark:divide-white/10">
                <div className="py-6 md:py-0 md:pl-8 space-y-3">
                  <span className="font-mono-num text-2xl font-extrabold text-rose-600 dark:text-pink-400">
                    01
                  </span>
                  <h3 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
                    سجّل / سجّلي برقم الموبايل واكتب / اكتبي اسمك ثلاثي
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    أول ما تعمل أو تعملي حساب برقم الموبايل وكلمة السر (من غير رسائل SMS)، اكتب اسمك ثلاثي وارفع صورتك الشخصية علشان تبان بوضوح في الامتحانات والتصنيف.
                  </p>
                </div>

                <div className="py-6 md:py-0 md:px-8 space-y-3">
                  <span className="font-mono-num text-2xl font-extrabold text-purple-600 dark:text-purple-400">
                    02
                  </span>
                  <h3 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
                    انضموا بكود أو اعملوا معسكر جماعي
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    ادخل أو ادخلي أي معسكر جماعي بكود الدعوة (لحد 50 طالب وطالبة) أو افتحوا معسكر جديد وشاركوا الكود مع صحابكم وزمايلكم.
                  </p>
                </div>

                <div className="py-6 md:py-0 md:pr-8 space-y-3">
                  <span className="font-mono-num text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                    03
                  </span>
                  <h3 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
                    امتحنوا وتفاعلوا في سؤال صغنن
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    حلّوا الامتحانات الإلكترونية، نافسوا على المراكز الأولى، وانشروا أسئلتكم في «سؤال صغنن 🌸» علشان يشوفها ويتفاعل معاها كل شباب وبنات معسكركم.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <ForgotPasswordModal
          open={forgotModalOpen}
          initialPhone={normalizedPreview}
          onClose={() => setForgotModalOpen(false)}
          onResetCompleted={(migratedProfile) => {
            setForgotModalOpen(false);
            if (migratedProfile) {
              onProfileSaved(migratedProfile);
            }
          }}
        />
      </div>
    );
  }

  // Screen 2: Profile Setup (Mandatory Triple Name & Personal Photo)
  if (!profile) {
    const validNamePartsCount = Math.min(3, getValidNameParts(displayName).length);
    const isTripleNameReady = getTripleNameValidationError(displayName) === null;
    const isPhotoReady = isPersonalAvatarUrl(selectedAvatar);
    const localStudentPhone = toLocalEgyptianPhone(
      resolveStudentPhoneE164FromAuth({
        phoneNumber: firebaseUser.phoneNumber,
        email: firebaseUser.email,
      })
    );

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-14 relative">
        {ThemeFloatButton}
        <div className="glass-surface-strong rounded-3xl max-w-xl w-full p-7 sm:p-9 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-pink-600 dark:text-pink-400">
                بياناتك (طالب / طالبة){localStudentPhone ? ` · ${localStudentPhone}` : ''}
              </p>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                جهّز / جهّزي ملفك الشخصي في المعسكر
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {onRequestDeleteAccount && (
                <button
                  type="button"
                  onClick={onRequestDeleteAccount}
                  className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  حذف الحساب
                </button>
              )}
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="text-xs font-medium text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                خروج
              </button>
            </div>
          </div>

          {/* Glowing Notice Banner */}
          <div className="rounded-2xl px-4 py-3.5 border border-pink-300/80 dark:border-fuchsia-400/45 bg-gradient-to-l from-rose-50/95 via-fuchsia-50/90 to-amber-50/90 dark:from-[#230938]/95 dark:via-[#2e0c45]/90 dark:to-[#1a1038]/95 shadow-sm text-center">
            <p className="font-display font-black text-base sm:text-lg leading-relaxed onboarding-glow-text">
              اكتب / اكتبي اسمك ثلاثي وحط / حطي صورتك الشخصية علشان نعرفك في الامتحانات
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                  الاسم ثلاثي <span className="text-rose-600 dark:text-rose-400 text-xs font-bold">(إجباري)</span>
                </label>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                    isTripleNameReady
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {isTripleNameReady ? 'الاسم ثلاثي تمام ✓' : `${validNamePartsCount}/3 أسماء`}
                </span>
              </div>
              <input
                type="text"
                value={displayName}
                maxLength={FIELD_LIMITS.DISPLAY_NAME_MAX}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (profileError) setProfileError('');
                }}
                placeholder="مثال: محمد أحمد علي / مريم أحمد علي"
                className="w-full rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-pink-200 dark:border-fuchsia-500/35 px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                لازم تكتب أو تكتبي 3 أسماء واضحة على الأقل علشان اسمك الحقيقي يظهر في الامتحانات ولوحة المتصدرين.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                  ارفع / ارفعي صورتك الشخصية <span className="text-rose-600 dark:text-rose-400 text-xs font-bold">(إجباري)</span>
                </label>
                {isPhotoReady && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                    الصورة اترفعت ✓
                  </span>
                )}
              </div>
              <AvatarPicker
                value={selectedAvatar}
                displayName={displayName}
                onChange={(nextUrl) => {
                  setSelectedAvatar(nextUrl);
                  if (profileError) setProfileError('');
                }}
              />
            </div>

            {profileError && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-2.5 text-sm text-rose-700 dark:text-rose-300"
              >
                {profileError}
              </div>
            )}

            <button
              type="submit"
              disabled={profileBusy}
              className="w-full py-3.5 px-6 rounded-2xl font-display font-bold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:brightness-105 transition-all neon-glow-pink flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <UserCheck className="w-5 h-5" />
              <span>{profileBusy ? 'بنحفظ بياناتك...' : 'احفظ وكمل للمعسكرات الجماعية'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null;
};
