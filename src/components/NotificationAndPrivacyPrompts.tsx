import React from 'react';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  Clock,
  Flower2,
  Gift,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { NotificationTypeKey } from '../types/camp';

interface NotificationPrePermissionBannerProps {
  visible: boolean;
  busy: boolean;
  iosInstallRequired?: boolean;
  errorMsg?: string;
  onEnable: () => void;
  onDismiss: () => void;
}

export const NotificationPrePermissionBanner: React.FC<NotificationPrePermissionBannerProps> = ({
  visible,
  busy,
  iosInstallRequired = false,
  errorMsg,
  onEnable,
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <div className="mb-5 glass-surface rounded-3xl p-4 sm:p-5 border border-pink-200/90 dark:border-fuchsia-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md">
          <Bell className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
            فعّل / فعّلي إشعارات المنصة الفورية 🔔
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            {iosInstallRequired
              ? 'علشان توصلك التنبيهات والرسايل المهمة على جهاز iPhone / iPad، ثبّت المنصة الأول على الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) وبعدين فعّل الإشعارات.'
              : 'وافق أو وافقي على وصول الإشعارات والتنبيهات المهمة من إدارة المنصة حتى لو المتصفح مقفول. تقدروا تفعلوها أو تلغوها في أي وقت من الإعدادات.'}
          </p>
          {errorMsg && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 pt-1">
              {errorMsg}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer whitespace-nowrap"
        >
          بعدين
        </button>
        {!iosInstallRequired && (
          <button
            type="button"
            disabled={busy}
            onClick={onEnable}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:brightness-105 transition-all shadow cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {busy ? 'بنفعّل الإشعارات...' : 'موافق / موافقة · فعّل الإشعارات'}
          </button>
        )}
      </div>
    </div>
  );
};

interface AnalyticsConsentBannerProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export const AnalyticsConsentBanner: React.FC<AnalyticsConsentBannerProps> = ({
  visible,
  onAccept,
  onDecline,
}) => {
  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="إعدادات الخصوصية والتحليلات"
      className="fixed bottom-20 lg:bottom-5 right-4 z-40 max-w-sm w-[calc(100%-2rem)] glass-surface-strong rounded-2xl p-4 border border-purple-200/90 dark:border-purple-500/35 shadow-xl space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 text-white flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="font-display font-bold text-sm text-slate-900 dark:text-white">
            الخصوصية وتحليلات الاستخدام
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            بنستخدم إحصائيات استخدام من غير ما نعرف هوية أي حد علشان نحسّن تجربة المعسكر، من غير ما نسجل أي رسايل أو بيانات شخصية خاصة.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDecline}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          رفض
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-500 to-cyan-500 hover:brightness-105 transition-all cursor-pointer"
        >
          موافق / موافقة
        </button>
      </div>
    </div>
  );
};

export interface ToastNotificationPayload {
  id: string;
  type: NotificationTypeKey;
  title: string;
  body: string;
  targetTab?: string;
}

const TOAST_THEME: Record<
  NotificationTypeKey,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    cardBorder: string;
    cardTint: string;
  }
> = {
  lecture_done: {
    icon: BookOpen,
    iconBg: 'from-pink-500 via-fuchsia-500 to-purple-500',
    cardBorder: 'border-pink-300 dark:border-pink-500/45',
    cardTint: 'from-pink-50/95 via-white/95 to-purple-50/95 dark:from-pink-950/85 dark:via-slate-900/95 dark:to-purple-950/85',
  },
  task_completed: {
    icon: CheckCircle2,
    iconBg: 'from-emerald-500 to-teal-500',
    cardBorder: 'border-emerald-300 dark:border-emerald-500/45',
    cardTint: 'from-emerald-50/95 via-white/95 to-teal-50/95 dark:from-emerald-950/85 dark:via-slate-900/95 dark:to-teal-950/85',
  },
  new_message: {
    icon: MessageCircleHeart,
    iconBg: 'from-rose-500 to-pink-500',
    cardBorder: 'border-rose-300 dark:border-rose-500/45',
    cardTint: 'from-rose-50/95 via-white/95 to-pink-50/95 dark:from-rose-950/85 dark:via-slate-900/95 dark:to-pink-950/85',
  },
  new_question: {
    icon: Flower2,
    iconBg: 'from-rose-500 via-pink-500 to-amber-500',
    cardBorder: 'border-rose-300 dark:border-rose-400/45',
    cardTint: 'from-rose-50/95 via-amber-50/90 to-emerald-50/95 dark:from-rose-950/85 dark:via-slate-900/95 dark:to-emerald-950/85',
  },
  new_surprise: {
    icon: Gift,
    iconBg: 'from-amber-400 to-orange-500',
    cardBorder: 'border-amber-300 dark:border-amber-500/45',
    cardTint: 'from-amber-50/95 via-white/95 to-orange-50/95 dark:from-amber-950/85 dark:via-slate-900/95 dark:to-orange-950/85',
  },
  new_day: {
    icon: Sun,
    iconBg: 'from-cyan-500 to-sky-500',
    cardBorder: 'border-cyan-300 dark:border-cyan-500/45',
    cardTint: 'from-cyan-50/95 via-white/95 to-sky-50/95 dark:from-cyan-950/85 dark:via-slate-900/95 dark:to-sky-950/85',
  },
  camp_ending: {
    icon: Clock,
    iconBg: 'from-red-500 to-rose-500',
    cardBorder: 'border-red-300 dark:border-red-500/45',
    cardTint: 'from-red-50/95 via-white/95 to-rose-50/95 dark:from-red-950/85 dark:via-slate-900/95 dark:to-rose-950/85',
  },
};

export const ColoredNotificationToast: React.FC<{
  toast: ToastNotificationPayload | null;
  onDismiss: () => void;
  onOpenTarget?: (tab?: string) => void;
}> = ({ toast, onDismiss, onOpenTarget }) => {
  if (!toast) return null;
  const theme = TOAST_THEME[toast.type] || {
    icon: Sparkles,
    iconBg: 'from-pink-500 to-purple-500',
    cardBorder: 'border-pink-300 dark:border-pink-500/45',
    cardTint: 'from-pink-50/95 via-white/95 to-purple-50/95 dark:from-pink-950/85 dark:via-slate-900/95 dark:to-purple-950/85',
  };
  const Icon = theme.icon;

  return (
    <div
      className={`fixed bottom-20 lg:bottom-6 left-4 z-50 max-w-sm w-[calc(100%-2rem)] rounded-2xl p-4 bg-gradient-to-br ${theme.cardTint} backdrop-blur-xl border ${theme.cardBorder} shadow-2xl flex items-start gap-3 animate-surprise-bloom`}
    >
      <button
        type="button"
        onClick={() => onOpenTarget?.(toast.targetTab)}
        className="flex-1 min-w-0 flex items-start gap-3 text-right cursor-pointer"
      >
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${theme.iconBg} text-white flex items-center justify-center shrink-0 shadow-md`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
            {toast.title}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 leading-relaxed">
            {toast.body}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="إغلاق التنبيه"
        className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const BroadcastNotificationDetailModal: React.FC<{
  notification: {
    id: string;
    title: string;
    body: string;
    imageUrl?: string;
    targetRoute?: string;
    createdAtText?: string;
  } | null;
  onClose: () => void;
  onOpenDestination?: (targetRoute: string) => void;
}> = ({ notification, onClose, onOpenDestination }) => {
  if (!notification) return null;

  const destinationLabels: Record<string, string> = {
    home: 'روح على الرئيسية',
    azkar: 'روح على قسم الأذكار',
    exams: 'روح على الامتحانات',
    leaderboard: 'روح على لوحة المتصدرين',
    little_question: 'روح على سؤال صغنن',
    settings: 'افتح الإعدادات',
  };

  const actionLabel =
    notification.targetRoute && destinationLabels[notification.targetRoute]
      ? destinationLabels[notification.targetRoute]
      : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-surface-strong rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 border border-pink-200/80 dark:border-fuchsia-500/35 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 text-white flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-pink-600 dark:text-pink-300">
                رسالة من إدارة المنصة
              </div>
              {notification.createdAtText && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {notification.createdAtText}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white leading-snug">
          {notification.title}
        </h3>

        {notification.imageUrl && (
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <img
              src={notification.imageUrl}
              alt={notification.title}
              className="w-full max-h-72 object-contain mx-auto"
            />
          </div>
        )}

        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
          {notification.body}
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            اقفل
          </button>
          {actionLabel && onOpenDestination && notification.targetRoute && (
            <button
              type="button"
              onClick={() => {
                onOpenDestination(notification.targetRoute!);
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:brightness-105 cursor-pointer"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
