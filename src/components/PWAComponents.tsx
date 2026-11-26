import React, { useState } from 'react';
import { CheckCircle2, Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../lib/usePWAInstall';

export const PWAInstallSection: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installing, setInstalling] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const handleInstallClick = async () => {
    if (isInstallable) {
      setInstalling(true);
      setFeedbackMsg('');
      try {
        const accepted = await install();
        if (accepted) {
          setFeedbackMsg('التطبيق اتثبّت على جهازك تمام!');
        } else {
          setFeedbackMsg('لغيت التثبيت — تقدر أو تقدري تثبّتوه في أي وقت.');
        }
      } finally {
        setInstalling(false);
      }
      return;
    }

    setShowManualSteps((prev) => !prev);
  };

  return (
    <div className="pt-3 border-t border-pink-100 dark:border-fuchsia-500/20 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300">
          <Smartphone className="w-4 h-4" />
          <span>ثبّت التطبيق على جهازك</span>
        </div>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {isInstalled
            ? 'متثبّت خلاص'
            : isInstallable
              ? 'جاهز يتثبّت علطول'
              : isIOS
                ? 'لأجهزة iPhone / iPad'
                : 'متاح من المتصفح'}
        </span>
      </div>

      {isInstalled ? (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/35 px-3.5 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>التطبيق متثبّت وشغّال كتطبيق لوحده على جهازك تمام!</span>
        </div>
      ) : (
        <div className="rounded-2xl bg-gradient-to-r from-pink-50/90 via-purple-50/90 to-cyan-50/90 dark:from-purple-950/35 dark:via-fuchsia-950/30 dark:to-cyan-950/35 border border-purple-200/80 dark:border-fuchsia-500/30 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                نزّل «معسكر مغلق» كتطبيق على موبايلك أو جهازك
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                علشان تدخل أو تدخلي بسرعة من الشاشة الرئيسية وتعيشوا تجربة أسرع من غير شريط المتصفح.
              </p>
            </div>

            <button
              type="button"
              disabled={installing}
              onClick={() => void handleInstallClick()}
              className="px-4 py-2 rounded-xl text-xs font-display font-bold text-white bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 hover:brightness-105 transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {installing
                  ? 'بنثبّت التطبيق...'
                  : isInstallable
                    ? 'ثبّت التطبيق دلوقتي'
                    : isIOS
                      ? 'إزاي تثبّته على iOS'
                      : 'ثبّت التطبيق'}
              </span>
            </button>
          </div>

          {feedbackMsg && (
            <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
              {feedbackMsg}
            </p>
          )}

          {showManualSteps && !isInstallable && (
            <div className="rounded-xl bg-white/85 dark:bg-slate-900/75 border border-purple-200/70 dark:border-white/10 p-3 text-[11px] text-slate-700 dark:text-slate-200 space-y-1 leading-relaxed">
              {isIOS ? (
                <>
                  <p className="font-bold text-purple-700 dark:text-purple-300">
                    علشان تثبّت / تثبّتي التطبيق على iPhone أو iPad (Safari):
                  </p>
                  <p>1. دوس / دوسي على زرار المشاركة (Share) تحت أو فوق في شاشة المتصفح.</p>
                  <p>2. اختار / اختاري «إضافة إلى الشاشة الرئيسية» (Add to Home Screen) وبعدين «إضافة».</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-purple-700 dark:text-purple-300">
                    علشان تثبّت / تثبّتي التطبيق من متصفح Chrome أو Edge:
                  </p>
                  <p>1. افتح / افتحي الصفحة في نافذة متصفح لوحدها (برة نافذة المعاينة لو موجودة).</p>
                  <p>2. دوس / دوسي على علامة التثبيت في شريط العنوان أو قائمة المتصفح (⋮) واختار / اختاري «تثبيت التطبيق».</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-display font-bold text-slate-950 shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>أنت / أنتي مش متصلين بالنت دلوقتي — بنعرضلك البيانات المحفوظة</span>
    </div>
  );
};
