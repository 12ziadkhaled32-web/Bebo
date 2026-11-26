import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Info,
  Laptop,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { compressBroadcastNotificationImage } from '../lib/pushMediaUpload';
import {
  BroadcastHistoryItem,
  fetchAdminBroadcastHistory,
  fetchAdminStudentsPushDirectory,
  sendAdminGroupBroadcast,
  SendBroadcastResult,
  StudentPushDirectoryRow,
} from '../services/pushNotificationService';
import { BroadcastTargetRoute, UserProfile } from '../types/camp';
import { AvatarImage } from './Decorations';

interface AdminPushBroadcastTabProps {
  user: User;
  gateToken: string;
  profiles: UserProfile[];
  onTokenInvalidated: () => void;
}

type RecipientFilter = 'all' | 'ready' | 'inactive';

const TARGET_ROUTE_OPTIONS: { value: BroadcastTargetRoute; label: string }[] = [
  { value: 'notification_view', label: 'عرض الإشعار وصورته داخل المنصة' },
  { value: 'home', label: 'الصفحة الرئيسية للمنصة' },
  { value: 'exams', label: 'قسم الامتحانات التنافسية' },
  { value: 'leaderboard', label: 'لوحة المتصدرين' },
  { value: 'little_question', label: 'ركن سؤال صغنن' },
  { value: 'azkar', label: 'قسم الأذكار' },
  { value: 'settings', label: 'إعدادات الحساب الشخصي' },
];

const TARGET_ROUTE_LABELS: Record<BroadcastTargetRoute, string> = {
  notification_view: 'بطاقة الإشعار',
  home: 'الرئيسية',
  exams: 'الامتحانات',
  leaderboard: 'المتصدرون',
  little_question: 'سؤال صغنن',
  azkar: 'الأذكار',
  settings: 'الإعدادات',
};

export const AdminPushBroadcastTab: React.FC<AdminPushBroadcastTabProps> = ({
  user,
  gateToken,
  profiles,
  onTokenInvalidated,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [targetRoute, setTargetRoute] = useState<BroadcastTargetRoute>('notification_view');
  const [uploadingImg, setUploadingImg] = useState(false);

  const [students, setStudents] = useState<StudentPushDirectoryRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<RecipientFilter>('all');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());

  const [historyItems, setHistoryItems] = useState<BroadcastHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [persistentVapid, setPersistentVapid] = useState(true);

  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastResult, setLastResult] = useState<SendBroadcastResult | null>(null);

  const loadDirectoryAndHistory = useCallback(async () => {
    setLoadingStudents(true);
    setLoadingHistory(true);
    setErrorMsg('');
    try {
      const idToken = await user.getIdToken();
      const [dir, hist] = await Promise.all([
        fetchAdminStudentsPushDirectory(profiles),
        fetchAdminBroadcastHistory({ idToken, gateToken }),
      ]);
      setStudents(dir);
      setHistoryItems(hist.items);
      setPersistentVapid(hist.persistentVapid);

      // Default select all ready (opted-in & active devices) students on load
      setSelectedUids((prev) => {
        if (prev.size > 0) {
          const validReady = new Set(dir.filter((s) => s.readyDevicesCount > 0).map((s) => s.uid));
          return new Set(Array.from(prev).filter((uid) => validReady.has(uid)));
        }
        return new Set(dir.filter((s) => s.readyDevicesCount > 0).map((s) => s.uid));
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'معرفناش نحمّل قايمة الشباب والبنات أو سجل الإشعارات.'
      );
    } finally {
      setLoadingStudents(false);
      setLoadingHistory(false);
    }
  }, [user, gateToken, profiles]);

  useEffect(() => {
    void loadDirectoryAndHistory();
  }, [loadDirectoryAndHistory]);

  const readyStudents = useMemo(
    () => students.filter((s) => s.readyDevicesCount > 0 && s.consentState !== 'opt_out'),
    [students]
  );

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return students.filter((s) => {
      if (filterMode === 'ready' && (s.readyDevicesCount === 0 || s.consentState === 'opt_out')) {
        return false;
      }
      if (filterMode === 'inactive' && s.readyDevicesCount > 0 && s.consentState !== 'opt_out') {
        return false;
      }
      if (!q) return true;
      return (
        s.displayName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.uid.toLowerCase().includes(q)
      );
    });
  }, [students, searchTerm, filterMode]);

  const selectedReadyStudents = useMemo(
    () => readyStudents.filter((s) => selectedUids.has(s.uid)),
    [readyStudents, selectedUids]
  );

  const uniqueSelectedDevicesCount = useMemo(() => {
    const endpoints = new Set<string>();
    for (const st of selectedReadyStudents) {
      for (const sub of st.subscriptions) {
        if (sub.active && sub.endpoint) endpoints.add(sub.endpoint);
      }
    }
    return endpoints.size;
  }, [selectedReadyStudents]);

  const handleToggleStudent = (student: StudentPushDirectoryRow) => {
    if (student.readyDevicesCount === 0 || student.consentState === 'opt_out') return;
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(student.uid)) next.delete(student.uid);
      else next.add(student.uid);
      return next;
    });
  };

  const handleSelectAllReady = () => {
    setSelectedUids(new Set(readyStudents.map((s) => s.uid)));
  };

  const handleClearSelection = () => {
    setSelectedUids(new Set());
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg('');
    setUploadingImg(true);
    try {
      const compressed = await compressBroadcastNotificationImage(file);
      setImageDataUrl(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'معرفناش نظبّط الصورة دي.');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLastResult(null);

    if (!title.trim()) {
      setErrorMsg('اكتب عنوان الإشعار الأول.');
      return;
    }
    if (!body.trim()) {
      setErrorMsg('اكتب كلام الإشعار الأول.');
      return;
    }
    if (selectedReadyStudents.length === 0 || uniqueSelectedDevicesCount === 0) {
      setErrorMsg('اختار طالب أو طالبة واحدة على الأقل جهازهم مفعّل لاستلام الإشعارات.');
      return;
    }
    if (!gateToken) {
      onTokenInvalidated();
      return;
    }

    setSending(true);
    try {
      const idToken = await user.getIdToken(true);
      const res = await sendAdminGroupBroadcast({
        adminUid: user.uid,
        idToken,
        gateToken,
        title,
        body,
        imageDataUrl,
        targetRoute,
        selectedStudents: selectedReadyStudents,
      });

      setLastResult(res);
      setTitle('');
      setBody('');
      setImageDataUrl('');
      await loadDirectoryAndHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'معرفناش نبعت الإشعار.';
      if (msg.includes('بوابة الأدمن')) {
        onTokenInvalidated();
      }
      setErrorMsg(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {!persistentVapid && (
        <div className="rounded-2xl bg-amber-950/50 border border-amber-500/40 p-4 text-xs text-amber-200 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <div className="font-display font-bold text-amber-300">
              وضع المعاينة المؤقت لمفاتيح Web Push
            </div>
            <p>
              يعمل الإرسال الآن مجانًا بمفتاح VAPID مولّد في ذاكرة الخادم. لضمان بقاء اشتراكات أجهزة الطلاب صالحة حتى بعد إعادة تشغيل الخادم، أضف{' '}
              <span className="font-mono text-white">VAPID_PUBLIC_KEY</span> و{' '}
              <span className="font-mono text-white">VAPID_PRIVATE_KEY</span> في إعدادات الأسرار (Secrets).
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-2xl bg-rose-950/70 border border-rose-500/40 p-4 text-xs sm:text-sm text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} className="cursor-pointer">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {lastResult && (
        <div className="rounded-2xl bg-emerald-950/60 border border-emerald-500/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-display font-bold text-emerald-300">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>بعتنا طلب الإشعار عبر السيرفر تمام</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
            <div className="rounded-xl bg-black/25 border border-white/10 p-2.5">
              <div className="text-slate-400">الأجهزة المستهدفة</div>
              <div className="font-mono-num tabular-nums text-lg font-black text-white">
                {lastResult.totalUniqueDevices}
              </div>
            </div>
            <div className="rounded-xl bg-black/25 border border-emerald-500/30 p-2.5">
              <div className="text-emerald-300">اتقبل من سيرفر البث</div>
              <div className="font-mono-num tabular-nums text-lg font-black text-emerald-400">
                {lastResult.acceptedCount}
              </div>
            </div>
            <div className="rounded-xl bg-black/25 border border-amber-500/30 p-2.5">
              <div className="text-amber-300">اشتراكات قديمة اتمسحت</div>
              <div className="font-mono-num tabular-nums text-lg font-black text-amber-400">
                {lastResult.staleRemovedCount}
              </div>
            </div>
            <div className="rounded-xl bg-black/25 border border-rose-500/30 p-2.5">
              <div className="text-rose-300">فشل مؤقت</div>
              <div className="font-mono-num tabular-nums text-lg font-black text-rose-400">
                {lastResult.failedCount}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            ملحوظة: رقم «اتقبل من سيرفر البث» معناه إن سيرفر الإشعارات (Google / Apple / Mozilla) استلم الرسالة؛ ورقم «الوصول والفتح الأكيد» هيظهر في السجل تحت أول ما الإشعار يوصل لموبايل كل طالب أو طالبة أو يدوسوا عليه.
          </p>
        </div>
      )}

      {/* Composer + Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSendBroadcast}
          className="lg:col-span-7 rounded-3xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  اكتب إشعار جماعي جديد
                </h2>
                <p className="text-[11px] text-slate-400">
                  بيوصل عبر Web Push للمتصفح والتطبيق المثبت حتى لو مقفول
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-slate-200">عنوان الإشعار</label>
              <span className="font-mono-num tabular-nums text-[11px] text-slate-400">
                {title.length}/120
              </span>
            </div>
            <input
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: ميعاد امتحان الفيزياء الشامل الليلة الساعة 9 ⏰"
              className="w-full rounded-xl bg-[#0D0A1A] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-slate-200">كلام الإشعار</label>
              <span className="font-mono-num tabular-nums text-[11px] text-slate-400">
                {body.length}/500
              </span>
            </div>
            <textarea
              rows={4}
              maxLength={500}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="اكتب الرسالة اللي هتظهر على شاشة الشباب والبنات..."
              className="w-full rounded-xl bg-[#0D0A1A] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-200 block">
                صورة مرفقة (JPG / PNG — اختياري)
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0D0A1A] border border-dashed border-amber-400/40 hover:border-amber-400/80 text-xs text-slate-200 flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <ImagePlus className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>{uploadingImg ? 'بنضغط الصورة...' : imageDataUrl ? 'غيّر الصورة' : 'ارفع صورة من الجهاز'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    onChange={handleImagePick}
                    disabled={uploadingImg}
                    className="hidden"
                  />
                </label>
                {imageDataUrl && (
                  <button
                    type="button"
                    onClick={() => setImageDataUrl('')}
                    aria-label="إزالة الصورة"
                    className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-200 block">
                هيفتح فين لما يدوسوا على الإشعار (اختياري)
              </label>
              <select
                value={targetRoute}
                onChange={(e) => setTargetRoute(e.target.value as BroadcastTargetRoute)}
                className="w-full rounded-xl bg-[#0D0A1A] border border-white/15 px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-amber-400/60 focus:outline-none"
              >
                {TARGET_ROUTE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-300">
              اللي اخترتهم للإرسال:{' '}
              <span className="font-mono-num tabular-nums font-bold text-emerald-400">
                {selectedReadyStudents.length}
              </span>{' '}
              طالب وطالبة (
              <span className="font-mono-num tabular-nums font-bold text-cyan-300">
                {uniqueSelectedDevicesCount}
              </span>{' '}
              جهاز)
            </div>
            <button
              type="submit"
              disabled={sending || uploadingImg || uniqueSelectedDevicesCount === 0}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-display font-bold text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-105 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'بنبعت...' : 'ابعت الإشعار دلوقتي'}</span>
            </button>
          </div>
        </form>

        {/* Live Real Preview Panel */}
        <div className="lg:col-span-5 rounded-3xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-display text-sm sm:text-base font-bold text-white">
              شكل الإشعار الحقيقي قدامك
            </h3>
            <span className="text-[11px] text-slate-400">Android & Chrome</span>
          </div>

          {/* Mobile/Android System Notification Card Mockup */}
          <div className="rounded-2xl bg-[#1F2430] border border-slate-700/80 p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <img
                  src="/pwa-192x192.png"
                  alt="DUO CAMP"
                  className="w-4 h-4 rounded-sm object-cover"
                />
                <span className="font-semibold">معسكر مغلق · DUO CAMP</span>
              </div>
              <span className="text-slate-400">دلوقتي</span>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="font-display font-bold text-sm text-white break-words">
                  {title.trim() || 'عنوان الإشعار بيظهر هنا واضح'}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                  {body.trim() || 'كلام الرسالة كله بيظهر هنا زي ما هيقرأه الطالب أو الطالبة على شاشة موبايلهم.'}
                </p>
              </div>
            </div>

            {imageDataUrl && (
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40 max-h-48">
                <img
                  src={imageDataUrl}
                  alt="معاينة صورة الإشعار"
                  className="w-full max-h-48 object-cover"
                />
              </div>
            )}

            <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/10">
              <span className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3 text-cyan-400" />
                عند الضغط: {TARGET_ROUTE_LABELS[targetRoute]}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            على أجهزة Android/Chrome تظهر الصورة كمرفق عريض أسفل النص، بينما تظهر على شاشة iOS المثبتة داخل الإشعار وتُفتح الصورة كاملة عند الضغط.
          </p>
        </div>
      </div>

      {/* Select Recipients Directory */}
      <section className="rounded-3xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-display text-base sm:text-lg font-bold text-white">
                اختيار المستلمين من الطلاب المسجلين
              </h3>
              <p className="text-xs text-slate-400">
                مفيش إشعار بيتبعت لحد رفض أو لغى اشتراكه، ومبنكررش الإرسال لنفس الجهاز
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadDirectoryAndHistory()}
            disabled={loadingStudents}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStudents ? 'animate-spin' : ''}`} />
            <span>تحديث القايمة</span>
          </button>
        </div>

        {/* Filter & Bulk Selection Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="دوّر باسم الطالب أو الطالبة أو الإيميل..."
              className="w-full rounded-xl bg-[#0D0A1A] border border-white/15 pr-9 pl-3 py-2 text-xs text-white focus:border-cyan-400/50 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `الكل (${students.length})` },
                { id: 'ready', label: `جاهز (${readyStudents.length})` },
                { id: 'inactive', label: `مش مفعّل / لغاه (${students.length - readyStudents.length})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  filterMode === f.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                    : 'bg-[#0D0A1A] text-slate-400 border border-white/10 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllReady}
              disabled={readyStudents.length === 0}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer disabled:opacity-40"
            >
              اختار كل الجاهزين
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-bold cursor-pointer"
            >
              الغِ التحديد
            </button>
          </div>
        </div>

        {/* Directory Table / States */}
        {loadingStudents ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-11 rounded-xl bg-white/5 border border-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-10 text-center text-xs sm:text-sm text-slate-400">
            مفيش شباب أو بنات مطابقين للبحث أو الفلتر ده.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-2xl border border-white/10">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-[#1A1433] border-b border-white/10 text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 w-10">اختيار</th>
                  <th className="py-2.5 px-3">الطالب / الطالبة</th>
                  <th className="py-2.5 px-3">حالة الإشعارات</th>
                  <th className="py-2.5 px-3">الأجهزة الشغالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredStudents.map((st) => {
                  const eligible = st.readyDevicesCount > 0 && st.consentState !== 'opt_out';
                  const checked = eligible && selectedUids.has(st.uid);
                  return (
                    <tr
                      key={st.uid}
                      onClick={() => handleToggleStudent(st)}
                      className={`transition-colors ${
                        eligible ? 'hover:bg-white/[0.03] cursor-pointer' : 'opacity-65'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!eligible}
                          onChange={() => handleToggleStudent(st)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-amber-400 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <AvatarImage
                            src={st.avatarUrl}
                            name={st.displayName}
                            sizeClass="w-8 h-8"
                            ringClass="ring-1 ring-white/20"
                          />
                          <div className="min-w-0">
                            <div className="font-display font-bold text-white truncate max-w-[180px]">
                              {st.displayName}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 truncate max-w-[200px]">
                              {st.email || st.uid}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {st.consentState === 'opt_out' ? (
                          <span className="text-rose-400 font-semibold">لغى / لغت الاشتراك</span>
                        ) : eligible ? (
                          <span className="text-emerald-400 font-semibold">موافق وجاهز</span>
                        ) : (
                          <span className="text-amber-300 font-semibold">لسه ما فعّلش</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {eligible ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                            <span className="font-mono-num tabular-nums font-bold text-cyan-300">
                              {st.readyDevicesCount}
                            </span>
                            {st.subscriptions.map((sub) => (
                              <span
                                key={sub.id}
                                className="inline-flex items-center gap-1 text-slate-300"
                              >
                                {sub.platform === 'android' || sub.platform === 'ios' ? (
                                  <Smartphone className="w-3 h-3 text-slate-400" />
                                ) : (
                                  <Laptop className="w-3 h-3 text-slate-400" />
                                )}
                                <span>{sub.installMode === 'pwa' ? 'PWA' : 'متصفح'}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sent Broadcast History */}
      <section className="rounded-3xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-white">
              سجل الإشعارات الجماعية اللي اتبعتت
            </h3>
            <p className="text-xs text-slate-400">
              بيورّيك قبول البث من سيرفرات الإشعارات مقارنة بالوصول والفتح الأكيد على موبايلات الشباب والبنات
            </p>
          </div>
          <span className="text-xs font-mono-num tabular-nums text-slate-400">
            آخر {historyItems.length} إشعار
          </span>
        </div>

        {loadingHistory ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-14 rounded-xl bg-white/5 border border-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : historyItems.length === 0 ? (
          <div className="py-10 text-center text-xs sm:text-sm text-slate-400">
            لسه مبعتناش أي إشعارات جماعية. استخدم النموذج اللي فوق عشان تبعت أول إشعار.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#1A1433] border-b border-white/10 text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">الإشعار والصورة</th>
                  <th className="py-2.5 px-3">وقت الإرسال</th>
                  <th className="py-2.5 px-3">المستلمين</th>
                  <th className="py-2.5 px-3">اتقبل للبث</th>
                  <th className="py-2.5 px-3">وصل واتفتح أكيد</th>
                  <th className="py-2.5 px-3">قديم واتمسح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {historyItems.map((item) => {
                  const n = item.notification;
                  const timeStr = n.createdAt?.toDate
                    ? n.createdAt.toDate().toLocaleString('ar-EG')
                    : 'دلوقتي';
                  return (
                    <tr key={n.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3 max-w-xs">
                        <div className="flex items-start gap-2.5">
                          {n.imageUrl ? (
                            <img
                              src={n.imageUrl}
                              alt={n.title}
                              className="w-11 h-11 rounded-lg object-cover border border-white/10 shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 shrink-0">
                              <Bell className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-display font-bold text-white truncate">
                              {n.title}
                            </div>
                            <div className="text-[11px] text-slate-400 line-clamp-1">
                              {n.body}
                            </div>
                            <div className="text-[10px] text-cyan-300 mt-0.5">
                              الوجهة: {TARGET_ROUTE_LABELS[n.targetRoute] || 'المنصة'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-mono-num tabular-nums whitespace-nowrap">
                        {timeStr}
                      </td>
                      <td className="py-3 px-3 font-mono-num tabular-nums text-white">
                        {n.recipientCount} طالب وطالبة / {n.targetedDevicesCount} جهاز
                      </td>
                      <td className="py-3 px-3 font-mono-num tabular-nums font-bold text-amber-300">
                        {n.acceptedCount}
                      </td>
                      <td className="py-3 px-3 font-mono-num tabular-nums font-bold text-emerald-400">
                        {item.serverDeliveredCount} وصل · {item.serverOpenedCount} اتفتح
                      </td>
                      <td className="py-3 px-3 font-mono-num tabular-nums text-slate-400">
                        {n.staleRemovedCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
