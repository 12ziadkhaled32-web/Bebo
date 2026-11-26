import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AlertTriangle, Bell, BellOff, Check, Eye, EyeOff, HelpCircle, KeyRound, Lock, LogOut, ShieldCheck, Trash2, X } from 'lucide-react';
import { FIELD_LIMITS } from '../constants/campConfig';
import {
  AdminGateMode,
  claimAdminGatePasscode,
  fetchAdminGateStatus,
  verifyAdminGatePasscode,
} from '../lib/adminGateApi';
import {
  getAnalyticsConsent,
  isAnalyticsConfigured,
  setAnalyticsConsent,
} from '../lib/analytics';
import { auth, db } from '../lib/firebase';
import {
  getSecurityAnswerValidationError,
  isValidEgyptianMobile,
  resolveStudentPhoneE164FromAuth,
  SECURITY_QUESTIONS,
  toLocalEgyptianPhone,
} from '../lib/phoneAuthUtils';
import {
  enableWebPushForStudent,
  optOutWebPushForStudent,
  resolveStudentPushState,
  StudentPushUiState,
} from '../lib/webPush';
import { upsertUserProfile } from '../services/campService';
import { saveStudentSecurityQuestion } from '../services/studentAuthService';
import { UserProfile } from '../types/camp';
import { AvatarPicker } from './AvatarPicker';
import { PWAInstallSection } from './PWAComponents';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
  onEnterAdminPortal?: (gateToken: string) => void;
  onConsentChanged?: (consent: 'granted' | 'denied') => void;
  onRequestDeleteAccount?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  profile,
  onProfileUpdated,
  onEnterAdminPortal,
  onConsentChanged,
  onRequestDeleteAccount,
}) => {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Admin Portal entry state
  const [adminGateMode, setAdminGateMode] = useState<AdminGateMode>('env');
  const [adminGateStatusLoaded, setAdminGateStatusLoaded] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminPasscodeConfirm, setAdminPasscodeConfirm] = useState('');
  const [showAdminPasscode, setShowAdminPasscode] = useState(false);
  const [adminGateBusy, setAdminGateBusy] = useState(false);
  const [adminGateError, setAdminGateError] = useState('');

  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(
    () => getAnalyticsConsent() === 'granted'
  );

  // Student Web Push Opt-In / Opt-Out state
  const [pushUiState, setPushUiState] = useState<StudentPushUiState>('needs_permission');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatusNote, setPushStatusNote] = useState('');
  const [showInlineAllowDenyPrompt, setShowInlineAllowDenyPrompt] = useState(false);

  // Student Security Question state (zero-SMS password recovery)
  const [secQuestion, setSecQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [secAnswer, setSecAnswer] = useState('');
  const [secBusy, setSecBusy] = useState(false);
  const [secMsg, setSecMsg] = useState('');
  const [secErr, setSecErr] = useState('');

  const isInEmbeddedFrame =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  useEffect(() => {
    if (open) {
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl);
      setSavedMsg('');
      setErrorMsg('');
      setAdminPasscode('');
      setAdminPasscodeConfirm('');
      setShowAdminPasscode(false);
      setAdminGateError('');
      setAdminGateStatusLoaded(false);
      setPushStatusNote('');
      setShowInlineAllowDenyPrompt(false);
      setSecAnswer('');
      setSecMsg('');
      setSecErr('');
      setAnalyticsEnabled(getAnalyticsConsent() === 'granted');
      void fetchAdminGateStatus()
        .then((res) => {
          setAdminGateMode(res.mode);
          setAdminGateStatusLoaded(true);
        })
        .catch(() => {
          setAdminGateStatusLoaded(true);
        });
      void resolveStudentPushState(profile.uid)
        .then((res) => {
          setPushUiState(res.state);
        })
        .catch(() => undefined);
    }
  }, [open, profile]);

  if (!open) return null;

  const handleAdminUnlock = async () => {
    if (!adminGateStatusLoaded) return;
    const trimmed = adminPasscode.trim();
    if (!trimmed) {
      setAdminGateError('اكتب كلمة سر لوحة الأدمن الأول.');
      return;
    }
    if (adminGateMode === 'claim_required') {
      if (trimmed.length < 4) {
        setAdminGateError('كلمة السر لازم تكون 4 حروف أو أرقام على الأقل.');
        return;
      }
      if (adminPasscodeConfirm.trim() !== trimmed) {
        setAdminGateError('تأكيد كلمة السر مش متطابق. اكتب نفس كلمة السر في الخانتين.');
        return;
      }
    }
    setAdminGateBusy(true);
    setAdminGateError('');
    try {
      const result =
        adminGateMode === 'claim_required'
          ? await claimAdminGatePasscode(trimmed)
          : await verifyAdminGatePasscode(trimmed);

      if (!result.ok || !result.token) {
        if (result.mode === 'claim_required') {
          setAdminGateMode('claim_required');
        }
        setAdminGateError(result.error || 'معرفناش نتأكد من كلمة السر.');
        return;
      }

      setAdminPasscode('');
      setAdminPasscodeConfirm('');
      onClose();
      onEnterAdminPortal?.(result.token);
    } catch {
      setAdminGateError('معرفناش نتصل بالسيرفر. جرب تاني.');
    } finally {
      setAdminGateBusy(false);
    }
  };

  const handleToggleStudentPush = async () => {
    if (pushLoading) return;

    // 1. Call native Notification.requestPermission() as the VERY FIRST synchronous step on click
    //    so Android / Chrome / Safari show the native "سماح / رفض" prompt directly without losing user activation.
    let directPermission: NotificationPermission | undefined;
    const canAskNative =
      pushUiState !== 'ready' &&
      typeof window !== 'undefined' &&
      'Notification' in window;

    if (canAskNative && Notification.permission === 'default') {
      const startedAt = Date.now();
      try {
        directPermission = await Notification.requestPermission();
      } catch {
        directPermission = Notification.permission;
      }
      // If embedded inside an iframe or browser auto-blocked instantaneously without showing the prompt:
      if (directPermission === 'denied' && (isInEmbeddedFrame || Date.now() - startedAt < 120)) {
        setShowInlineAllowDenyPrompt(true);
        setPushUiState('denied');
        setPushStatusNote(
          isInEmbeddedFrame
            ? 'المتصفح قافل نافذة الإذن جوه المعاينة المدمجة — اختار / اختاري «سماح» عشان نفتح صفحة التفعيل المباشرة أو «رفض».'
            : 'المتصفح رفض نافذة الإذن لوحده. اختار / اختاري «سماح» أو «رفض» تحت.'
        );
        return;
      }
    } else if (canAskNative && Notification.permission === 'denied') {
      setShowInlineAllowDenyPrompt(true);
      setPushUiState('denied');
      setPushStatusNote(
        isInEmbeddedFrame
          ? 'المتصفح قافل الإشعارات جوه المعاينة المدمجة — اختار / اختاري «سماح» للفتح في صفحة مستقلة وتأكيد الإذن أو «رفض».'
          : 'الإشعارات مقفولة من المتصفح قبل كده — تقدر / تقدري تختار «سماح» بعد ما تفعّلها من إعدادات الموقع أو «رفض».'
      );
      return;
    }

    setPushLoading(true);
    setPushStatusNote('');
    setShowInlineAllowDenyPrompt(false);
    try {
      if (pushUiState === 'ready') {
        await optOutWebPushForStudent(profile.uid);
        setPushUiState('opted_out');
        setPushStatusNote('لغينا اشتراك الإشعارات للحساب والجهاز ده خلاص.');
      } else {
        const res = await enableWebPushForStudent({
          uid: profile.uid,
          askPermissionIfDefault: true,
          preRequestedPermission: directPermission,
        });
        setPushUiState(res.state === 'error' ? 'needs_permission' : res.state);
        if (res.ok) {
          setPushStatusNote('الإشعارات الفورية اتفعّلت تمام!');
        } else if (res.errorMessage) {
          setPushStatusNote(res.errorMessage);
        }
      }
    } catch {
      setPushStatusNote('معرفناش نحدّث حالة الإشعارات دلوقتي.');
    } finally {
      setPushLoading(false);
    }
  };

  const handleConfirmInlineAllow = async () => {
    if (pushLoading) return;
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'denied') {
      await handleToggleStudentPush();
      return;
    }
    setPushStatusNote(
      isInEmbeddedFrame
        ? 'هنفتح المنصة في صفحة متصفح مستقلة عشان يظهرلك طلب «سماح / رفض» علطول.'
        : 'دوس / دوسي على علامة القفل أو الإعدادات جنب رابط الموقع في المتصفح واختار / اختاري «سماح» للإشعارات، وبعدها دوس تفعيل الإشعارات.'
    );
  };

  const handleConfirmInlineDeny = async () => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      await optOutWebPushForStudent(profile.uid);
      setPushUiState('opted_out');
      setShowInlineAllowDenyPrompt(false);
      setPushStatusNote('تم رفض الإشعارات باختيارك، ومش هيوصلك أي تنبيهات.');
    } finally {
      setPushLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    setSavedMsg('');
    setErrorMsg('');
    try {
      const trimmedName = displayName.trim().slice(0, FIELD_LIMITS.DISPLAY_NAME_MAX);
      await upsertUserProfile({
        uid: profile.uid,
        displayName: trimmedName,
        avatarUrl,
        existingProfile: profile,
        activeCamp: null,
      });

      if (profile.groupCampId) {
        try {
          await updateDoc(
            doc(db, 'groupCamps', profile.groupCampId, 'members', profile.uid),
            {
              displayName: trimmedName,
              avatarUrl: avatarUrl.trim().slice(0, FIELD_LIMITS.AVATAR_URL_MAX),
              updatedAt: serverTimestamp(),
            }
          );
        } catch {
          // Non-fatal if member doc is not active
        }
      }

      const nextConsent = analyticsEnabled ? 'granted' : 'denied';
      await setAnalyticsConsent(nextConsent);
      onConsentChanged?.(nextConsent);

      onProfileUpdated({
        ...profile,
        displayName: trimmedName,
        avatarUrl,
      });
      setSavedMsg('حفظنا الإعدادات وحدّثناها في المعسكر!');
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'معرفناش نحفظ التعديلات.');
    } finally {
      setBusy(false);
    }
  };

  const studentLocalPhone = toLocalEgyptianPhone(
    resolveStudentPhoneE164FromAuth({
      phoneNumber: auth.currentUser?.phoneNumber,
      email: auth.currentUser?.email,
      profilePhone: profile.phone,
    })
  );

  const handleSaveSecurityQuestion = async () => {
    if (!auth.currentUser || !isValidEgyptianMobile(studentLocalPhone)) return;
    const ansErr = getSecurityAnswerValidationError(secAnswer);
    if (ansErr) {
      setSecErr(ansErr);
      setSecMsg('');
      return;
    }
    setSecBusy(true);
    setSecErr('');
    setSecMsg('');
    try {
      await saveStudentSecurityQuestion({
        user: auth.currentUser,
        local01: studentLocalPhone,
        securityQuestion: secQuestion,
        securityAnswer: secAnswer,
      });
      setSecAnswer('');
      setSecMsg('حفظنا سؤال الأمان وإجابتك بنجاح!');
    } catch (err) {
      setSecErr(err instanceof Error ? err.message : 'معرفناش نحفظ سؤال الأمان دلوقتي.');
    } finally {
      setSecBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-surface-strong rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
            إعدادات الحساب الشخصي
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">اسمك الظاهر</label>
            <input
              type="text"
              maxLength={FIELD_LIMITS.DISPLAY_NAME_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-fuchsia-500/35 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">الصورة الشخصية</label>
            <AvatarPicker
              value={avatarUrl}
              displayName={displayName}
              onChange={setAvatarUrl}
            />
          </div>



          {/* Security Question Recovery Section (Zero SMS) */}
          {isValidEgyptianMobile(studentLocalPhone) && (
            <div className="pt-3 border-t border-pink-100 dark:border-fuchsia-500/20 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-pink-300">
                <HelpCircle className="w-4 h-4" />
                <span>سؤال الأمان لاسترجاع كلمة السر (بدون SMS)</span>
              </div>
              <div className="rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-pink-200/80 dark:border-fuchsia-500/25 p-3.5 space-y-2.5">
                <select
                  value={secQuestion}
                  onChange={(e) => setSecQuestion(e.target.value)}
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-fuchsia-500/35 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                >
                  {SECURITY_QUESTIONS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    maxLength={120}
                    value={secAnswer}
                    onChange={(e) => {
                      setSecAnswer(e.target.value);
                      if (secErr) setSecErr('');
                    }}
                    placeholder="اكتب / اكتبي إجابة سرية جديدة للتحديث..."
                    className="flex-1 rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-fuchsia-500/35 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={secBusy}
                    onClick={() => void handleSaveSecurityQuestion()}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-l from-rose-600 to-purple-600 hover:brightness-110 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {secBusy ? 'بنحفظ...' : 'حفظ سؤال الأمان'}
                  </button>
                </div>
                {secMsg && (
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    {secMsg}
                  </p>
                )}
                {secErr && (
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-300">
                    {secErr}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* App Installability (PWA) Section */}
          <PWAInstallSection />

          {/* Web Push Notification Opt-In / Opt-Out Section */}
          <div className="pt-3 border-t border-pink-100 dark:border-fuchsia-500/20 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-purple-700 dark:text-purple-300">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <span>إشعارات المنصة الفورية</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {pushUiState === 'ready'
                  ? 'شغّالة'
                  : pushUiState === 'opted_out'
                    ? 'وقفتها باختيارك'
                    : pushUiState === 'denied'
                      ? 'مقفولة من المتصفح'
                      : pushUiState === 'ios_install_required'
                        ? 'محتاجة تثبيت التطبيق'
                        : pushUiState === 'unsupported'
                          ? 'مش مدعومة'
                          : 'مش شغّالة'}
              </span>
            </div>

            <div className="rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-purple-200/80 dark:border-purple-500/25 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {pushUiState === 'ready'
                    ? 'دلوقتي بتستقبل / بتستقبلي تنبيهات ورسائل المنصة حتى في الخلفية'
                    : pushUiState === 'ios_install_required'
                      ? 'ثبّت / ثبّتي التطبيق على شاشة الـ iPhone الأول عشان الإشعارات تشتغل'
                      : pushUiState === 'denied'
                        ? 'الإشعارات مقفولة من إعدادات المتصفح للموقع ده'
                        : 'استقبل / استقبلي إشعارات الإدارة المهمة على الجهاز ده'}
                </div>
                {pushStatusNote && (
                  <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                    {pushStatusNote}
                  </p>
                )}
              </div>

              {pushUiState !== 'unsupported' && pushUiState !== 'ios_install_required' && (
                <button
                  type="button"
                  disabled={pushLoading}
                  onClick={() => void handleToggleStudentPush()}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    pushUiState === 'ready'
                      ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/35 hover:bg-rose-100'
                      : 'text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:brightness-105'
                  }`}
                >
                  {pushUiState === 'ready' ? (
                    <>
                      <BellOff className="w-3.5 h-3.5" />
                      <span>{pushLoading ? 'بنوقفها...' : 'إلغاء الإشعارات'}</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5" />
                      <span>{pushLoading ? 'بنفعّلها...' : 'تفعيل الإشعارات'}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {showInlineAllowDenyPrompt && pushUiState !== 'ready' && (
              <div className="rounded-2xl bg-purple-50/90 dark:bg-purple-950/40 border border-purple-300/70 dark:border-purple-400/35 p-3 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-purple-100">
                  تحب / تحبي يوصلك إشعارات المنصة؟
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {isInEmbeddedFrame ? (
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '/'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void handleConfirmInlineAllow()}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                    >
                      سماح
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={pushLoading}
                      onClick={() => void handleConfirmInlineAllow()}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      سماح
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pushLoading}
                    onClick={() => void handleConfirmInlineDeny()}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-100 dark:bg-rose-950/70 hover:bg-rose-200 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-200 border border-rose-300/70 dark:border-rose-500/40 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    رفض
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Privacy & GA4 Analytics Toggle */}
          <div className="pt-3 border-t border-pink-100 dark:border-fuchsia-500/20 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-700 dark:text-cyan-300">
              <ShieldCheck className="w-4 h-4" />
              <span>الخصوصية وتحليلات الاستخدام (GA4)</span>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-cyan-100 dark:border-cyan-500/25 px-3.5 py-2.5 cursor-pointer">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  المشاركة في إحصائيات الاستخدام المجهولة
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAnalyticsConfigured()
                    ? 'مفيش أي رسائل أو بيانات شخصية بتتسجل خالص'
                    : 'جاهزة تشتغل أول ما نضيف كود GA4'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                className="w-4 h-4 accent-cyan-500 shrink-0"
              />
            </label>
          </div>

          {/* Admin Portal Access Section */}
          {onEnterAdminPortal && (
            <div className="pt-3 border-t border-pink-100 dark:border-fuchsia-500/20 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                  <Lock className="w-4 h-4" />
                  <span>لوحة تحكم الأدمن</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {adminGateMode === 'claim_required' ? 'إعداد أول مرة' : 'مقفولة بكلمة سر'}
                </span>
              </div>

              <div className="rounded-2xl bg-amber-50/75 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-500/30 p-3.5 space-y-2.5">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {adminGateMode === 'claim_required'
                    ? 'إعداد أول مرة: اكتب كلمة السر اللي عاوزها مرتين للتأكيد وبعدها دوس «تعيين ودخول».'
                    : 'اكتب كلمة سر لوحة الأدمن عشان تدخل لوحة الإدارة.'}
                </p>

                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showAdminPasscode ? 'text' : 'password'}
                        name="admin_gate_passcode_field"
                        autoComplete="new-password"
                        data-lpignore="true"
                        value={adminPasscode}
                        onChange={(e) => {
                          setAdminPasscode(e.target.value);
                          if (adminGateError) setAdminGateError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleAdminUnlock();
                          }
                        }}
                        placeholder={
                          adminGateMode === 'claim_required'
                            ? 'اكتب كلمة السر الجديدة...'
                            : 'كلمة سر لوحة الأدمن...'
                        }
                        className="w-full rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/40 pr-3.5 pl-9 py-2 text-xs sm:text-sm text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPasscode((prev) => !prev)}
                        aria-label={showAdminPasscode ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showAdminPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={adminGateBusy || !adminGateStatusLoaded}
                      onClick={() => void handleAdminUnlock()}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-105 transition-all cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>
                        {!adminGateStatusLoaded
                          ? 'بنفحص...'
                          : adminGateBusy
                            ? 'بنتأكد...'
                            : adminGateMode === 'claim_required'
                              ? 'تعيين ودخول'
                              : 'دخول الأدمن'}
                      </span>
                    </button>
                  </div>

                  {adminGateMode === 'claim_required' && adminGateStatusLoaded && (
                    <input
                      type={showAdminPasscode ? 'text' : 'password'}
                      name="admin_gate_passcode_confirm"
                      autoComplete="new-password"
                      data-lpignore="true"
                      value={adminPasscodeConfirm}
                      onChange={(e) => {
                        setAdminPasscodeConfirm(e.target.value);
                        if (adminGateError) setAdminGateError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAdminUnlock();
                        }
                      }}
                      placeholder="اكتب كلمة السر تاني للتأكيد..."
                      className="w-full rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/40 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white"
                    />
                  )}
                </div>

                {adminGateError && (
                  <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {adminGateError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Danger Zone: Permanent Account Deletion */}
          {onRequestDeleteAccount && (
            <div className="pt-3 border-t border-rose-200/80 dark:border-rose-500/25">
              <div className="rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/35 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>مسح الحساب نهائيًا</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    بيمسح ملفك وبياناتك كلها عشان تقدر / تقدري تعمل حساب جديد بنفس الإيميل من الأول.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRequestDeleteAccount}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح الحساب</span>
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {savedMsg && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>{savedMsg}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              قفل
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 cursor-pointer disabled:opacity-60"
            >
              {busy ? 'بنحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface SignOutConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmSignOut: () => Promise<void> | void;
}

const SIGN_OUT_STEPS: {
  title: string;
  subtitle: string;
  confirmLabel: string;
  cancelLabel: string;
}[] = [
  {
    title: 'متأكد / متأكدة إنك عاوز تخرج؟',
    subtitle: 'التأكيد الأول (1 من 3) — لسه في امتحانات وتحديات مستنياك في المعسكر!',
    confirmLabel: 'أيوة، عاوز / عاوزة أخرج',
    cancelLabel: 'لا، هكمّل في المعسكر',
  },
  {
    title: 'متأكد / متأكدة بجد إنك عاوز تخرج؟',
    subtitle: 'التأكيد التاني (2 من 3) — صحابك وزمايلك (شباب وبنات) في المعسكر مستنيينك تكمل التحدي!',
    confirmLabel: 'أيوة، متأكد / متأكدة',
    cancelLabel: 'رجوع وهفضّل هنا',
  },
  {
    title: 'آخر كلام.. متأكد / متأكدة إنك عاوز تخرج؟',
    subtitle: 'التأكيد التالت والأخير (3 من 3) — لو دوست تأكيد هيتم تسجيل خروجك دلوقتي.',
    confirmLabel: 'أيوة، خروج نهائي',
    cancelLabel: 'إلغاء ورجوع',
  },
];

export const SignOutConfirmModal: React.FC<SignOutConfirmModalProps> = ({
  open,
  onClose,
  onConfirmSignOut,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const current = SIGN_OUT_STEPS[step - 1];

  const handleConfirm = async () => {
    if (step < 3) {
      setStep((prev) => (prev === 1 ? 2 : 3));
      return;
    }
    setBusy(true);
    try {
      await onConfirmSignOut();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="glass-surface-strong rounded-3xl max-w-md w-full p-6 space-y-5 border border-rose-200/80 dark:border-rose-500/35 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-md shrink-0">
              {step === 3 ? <LogOut className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                تأكيد الخروج {step} / 3
              </div>
              <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                {current.title}
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

        {/* 3-step visual progress bar */}
        <div className="grid grid-cols-3 gap-2" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-2 rounded-full transition-all duration-300 ${
                n <= step
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500 shadow-[0_0_8px_rgba(244,63,94,0.45)]'
                  : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {current.subtitle}
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {current.cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:brightness-105 transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <LogOut className="w-4 h-4" />
            <span>{busy ? 'جاري الخروج...' : current.confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface DeleteAccountConfirmModalProps {
  open: boolean;
  accountLabel?: string | null;
  requirePasswordConfirm?: boolean;
  busy?: boolean;
  errorMsg?: string;
  onClose: () => void;
  onConfirmDelete: (password?: string) => Promise<void> | void;
}

export const DeleteAccountConfirmModal: React.FC<DeleteAccountConfirmModalProps> = ({
  open,
  accountLabel,
  requirePasswordConfirm = false,
  busy = false,
  errorMsg = '',
  onClose,
  onConfirmDelete,
}) => {
  const [understood, setUnderstood] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (open) {
      setUnderstood(false);
      setConfirmPassword('');
      setShowConfirmPassword(false);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit =
    understood && (!requirePasswordConfirm || confirmPassword.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="glass-surface-strong rounded-3xl max-w-md w-full p-6 space-y-5 border border-rose-300/80 dark:border-rose-500/45 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-600 to-red-700 text-white flex items-center justify-center shadow-md shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                خطوة نهائية مفيهاش رجعة
              </div>
              <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                مسح الحساب نهائيًا
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

        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/35 p-4 space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          <p className="font-bold text-rose-800 dark:text-rose-200">
            إيه اللي هيحصل لما تمسح حسابك
            {accountLabel ? (
              <>
                {' '}
                (<span dir="ltr" className="font-mono-num">{accountLabel}</span>)
              </>
            ) : (
              ''
            )}
            ؟
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <li>ملفك الشخصي واشتراكك في المعسكرات وسجل امتحاناتك اللي فاتت هيتمسحوا نهائيًا.</li>
            <li>حساب الدخول هيتمسح من النظام كله عشان تقدر / تقدري تسجل من جديد بنفس رقم الموبايل بحساب جديد تمامًا.</li>
            {requirePasswordConfirm && (
              <li>اكتب / اكتبي كلمة السر الحالية تحت لتأكيد إن الحساب بتاعك قبل المسح النهائي.</li>
            )}
          </ul>
        </div>

        {requirePasswordConfirm && (
          <div className="space-y-1.5">
            <label
              htmlFor="delete-account-password"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              كلمة السر الحالية للتأكيد
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="delete-account-password"
                type={showConfirmPassword ? 'text' : 'password'}
                disabled={busy}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="اكتب / اكتبي كلمة السر الحالية"
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/35 pr-10 pl-10 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        <label className="flex items-start gap-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-white/15 p-3.5 cursor-pointer">
          <input
            type="checkbox"
            checked={understood}
            disabled={busy}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-rose-600 shrink-0 cursor-pointer"
          />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">
            فاهم / فاهمة إن مسح الحساب نهائي ومش هيرجع تاني، وعاوز / عاوزة أمسح حسابي وأبدأ بحساب جديد.
          </span>
        </label>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/45 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-200"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            رجوع وإلغاء
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => void onConfirmDelete(confirmPassword)}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-rose-600 to-red-700 hover:brightness-110 transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{busy ? 'بنمسح الحساب...' : 'أيوة، امسح الحساب نهائيًا'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
