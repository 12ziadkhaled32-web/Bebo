import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Edit3,
  Eye,
  Gem,
  Lightbulb,
  Plus,
  PowerOff,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { ISLAMIC_TREASURES } from '../constants/azkarData';
import {
  adminActivateIslamicTreasure,
  adminDeactivateIslamicTreasure,
  adminDeleteIslamicTreasure,
  adminFetchActiveIslamicTreasure,
  adminFetchAllIslamicTreasures,
  adminSaveIslamicTreasure,
  TREASURE_FIELD_LIMITS,
} from '../services/treasureService';
import { ActiveIslamicTreasureDoc, IslamicTreasureDoc } from '../types/camp';

interface AdminIslamicTreasureTabProps {
  user: User;
}

export const AdminIslamicTreasureTab: React.FC<AdminIslamicTreasureTabProps> = ({ user }) => {
  const [treasures, setTreasures] = useState<IslamicTreasureDoc[]>([]);
  const [activeDoc, setActiveDoc] = useState<ActiveIslamicTreasureDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyActionId, setBusyActionId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionLead, setQuestionLead] = useState('هل كنت تعرف ؟');
  const [factLine1, setFactLine1] = useState('');
  const [factLine2, setFactLine2] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [closingNote, setClosingNote] = useState(
    'معلومة رائعة .. فاحرص / احرصي على أن تكونوا من المقبولين ! 💗'
  );

  const loadTreasures = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [list, currentActive] = await Promise.all([
        adminFetchAllIslamicTreasures(),
        adminFetchActiveIslamicTreasure(),
      ]);
      setTreasures(list);
      setActiveDoc(currentActive);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'معرفناش نحمّل المعلومات الدينية من قاعدة البيانات.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTreasures();
  }, [loadTreasures]);

  const resetForm = () => {
    setEditingId(null);
    setQuestionLead('هل كنت تعرف ؟');
    setFactLine1('');
    setFactLine2('');
    setEvidenceText('');
    setEvidenceRef('');
    setClosingNote('معلومة رائعة .. فاحرص / احرصي على أن تكونوا من المقبولين ! 💗');
  };

  const handleLoadForEdit = (item: IslamicTreasureDoc) => {
    setEditingId(item.id);
    setQuestionLead(item.questionLead || 'هل كنت تعرف ؟');
    setFactLine1(item.factLine1 || '');
    setFactLine2(item.factLine2 || '');
    setEvidenceText(item.evidenceText || '');
    setEvidenceRef(item.evidenceRef || '');
    setClosingNote(item.closingNote || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleFillSample = () => {
    const sample = ISLAMIC_TREASURES[0];
    setQuestionLead(sample.questionLead);
    setFactLine1(sample.factLines[0]);
    setFactLine2(sample.factLines[1]);
    setEvidenceText(sample.evidenceText);
    setEvidenceRef(sample.evidenceRef);
    setClosingNote(sample.closingNote);
    setErrorMsg('');
  };

  const handleSave = async (publishNow: boolean) => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!factLine1.trim()) {
      setErrorMsg('اكتب نص المعلومة الدينية (السطر الأول) الأول.');
      return;
    }

    setSaving(true);
    try {
      const saved = await adminSaveIslamicTreasure({
        treasureId: editingId || undefined,
        adminUid: user.uid,
        questionLead,
        factLine1,
        factLine2,
        evidenceText,
        evidenceRef,
        closingNote,
        publishNow,
      });

      setSuccessMsg(
        publishNow
          ? 'تم حفظ ونشر «معلومة يمكن اول مرة تعرفها» وبقت ظاهرة لكل الشباب والبنات في ركن الأذكار دلوقتي ✨'
          : 'تم حفظ المعلومة في الأرشيف كمسودة تمام.'
      );
      if (saved.id) {
        resetForm();
      }
      await loadTreasures();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'معرفناش نحفظ المعلومة الدينية. جرب تاني.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (item: IslamicTreasureDoc) => {
    setErrorMsg('');
    setSuccessMsg('');
    setBusyActionId(item.id);
    try {
      await adminActivateIslamicTreasure({ treasure: item, adminUid: user.uid });
      setSuccessMsg('تم تفعيل ونشر المعلومة دي فورًا في صفحة الأذكار للطلاب والطالبات 💎');
      await loadTreasures();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'معرفناش نفعّل المعلومة دي.');
    } finally {
      setBusyActionId('');
    }
  };

  const handleDeactivate = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setBusyActionId('deactivate_active');
    try {
      await adminDeactivateIslamicTreasure();
      setSuccessMsg('تم إلغاء التثبيت والرجوع للعرض التلقائي اليومي في ركن الأذكار.');
      await loadTreasures();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'معرفناش نلغي النشر دلوقتي.');
    } finally {
      setBusyActionId('');
    }
  };

  const handleDelete = async (item: IslamicTreasureDoc) => {
    setErrorMsg('');
    setSuccessMsg('');
    setBusyActionId(item.id);
    try {
      await adminDeleteIslamicTreasure(item);
      setConfirmDeleteId('');
      if (editingId === item.id) {
        resetForm();
      }
      setSuccessMsg('تم مسح المعلومة من الأرشيف خلاص.');
      await loadTreasures();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'معرفناش نمسح المعلومة.');
    } finally {
      setBusyActionId('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Live Status */}
      <div className="rounded-3xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 border border-amber-300/60 flex items-center justify-center text-amber-200 shadow-lg shrink-0">
              <Gem className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-black text-white">
                معلومة يمكن اول مرة تعرفها
              </h2>
              <p className="text-xs text-slate-400">
                اكتب المعلومة الدينية والدليل هنا وهتظهر فورًا لجميع الشباب والبنات جوه ركن الأذكار الملكي
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadTreasures()}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>حدّث القائمة</span>
          </button>
        </div>

        {/* Active Broadcast Status */}
        {activeDoc ? (
          <div className="rounded-2xl bg-emerald-950/45 border border-emerald-500/40 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                <span>المعلومة المنشورة حاليًا لجميع الطلاب والطالبات:</span>
              </div>
              <p className="text-sm font-display font-bold text-white">
                {activeDoc.factLine1} {activeDoc.factLine2}
              </p>
              {activeDoc.evidenceText && (
                <p className="text-xs text-emerald-200/85">
                  {activeDoc.evidenceText} {activeDoc.evidenceRef}
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={busyActionId === 'deactivate_active'}
              onClick={() => void handleDeactivate()}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-bold text-amber-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
            >
              <PowerOff className="w-3.5 h-3.5" />
              <span>رجّع للعرض التلقائي اليومي</span>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-purple-950/40 border border-purple-400/30 p-4 text-xs text-purple-200 flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              مفيش معلومة مخصصة منشورة دلوقتي — صفحة الأذكار بتعرض المعلومة التلقائية اليومية لحد ما تنشر معلومة جديدة من هنا.
            </span>
          </div>
        )}

        {successMsg && (
          <div className="rounded-2xl bg-emerald-950/75 border border-emerald-500/40 p-3.5 text-xs sm:text-sm text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-2xl bg-rose-950/75 border border-rose-500/40 p-3.5 text-xs sm:text-sm text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Authoring Form + Live Student Card Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave(true);
          }}
          className="xl:col-span-7 rounded-3xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base sm:text-lg font-black text-amber-300 flex items-center gap-2">
              {editingId ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{editingId ? 'تعديل المعلومة الدينية' : 'كتابة معلومة دينية جديدة'}</span>
            </h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFillSample}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-bold text-slate-200 cursor-pointer"
              >
                حط مثال جاهز
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-[11px] font-bold text-rose-200 cursor-pointer"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
              <label htmlFor="treasure-question-lead">عنوان السؤال التمهيدي (الشريط الذهبي)</label>
              <span className="font-mono-num text-[11px] text-slate-400">
                {questionLead.length}/{TREASURE_FIELD_LIMITS.QUESTION_LEAD_MAX}
              </span>
            </div>
            <input
              id="treasure-question-lead"
              type="text"
              maxLength={TREASURE_FIELD_LIMITS.QUESTION_LEAD_MAX}
              value={questionLead}
              onChange={(e) => setQuestionLead(e.target.value)}
              placeholder="هل كنت تعرف ؟"
              className="w-full rounded-2xl bg-[#0D091A] border border-white/15 focus:border-amber-400 focus:outline-none px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
              <label htmlFor="treasure-fact-line1">نص المعلومة الدينية — السطر الأول *</label>
              <span className="font-mono-num text-[11px] text-slate-400">
                {factLine1.length}/{TREASURE_FIELD_LIMITS.FACT_LINE_MAX}
              </span>
            </div>
            <textarea
              id="treasure-fact-line1"
              rows={2}
              maxLength={TREASURE_FIELD_LIMITS.FACT_LINE_MAX}
              value={factLine1}
              onChange={(e) => setFactLine1(e.target.value)}
              placeholder="مثال: أن الملائكة تستغفر للمؤمنين"
              className="w-full rounded-2xl bg-[#0D091A] border border-white/15 focus:border-amber-400 focus:outline-none px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
              <label htmlFor="treasure-fact-line2">السطر الثاني من المعلومة (اختياري)</label>
              <span className="font-mono-num text-[11px] text-slate-400">
                {factLine2.length}/{TREASURE_FIELD_LIMITS.FACT_LINE_MAX}
              </span>
            </div>
            <textarea
              id="treasure-fact-line2"
              rows={2}
              maxLength={TREASURE_FIELD_LIMITS.FACT_LINE_MAX}
              value={factLine2}
              onChange={(e) => setFactLine2(e.target.value)}
              placeholder="مثال: في كل وقت، حتى في وقت معصيتهم ؟!"
              className="w-full rounded-2xl bg-[#0D091A] border border-white/15 focus:border-amber-400 focus:outline-none px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                <label htmlFor="treasure-evidence-text">الدليل (آية قرآنية أو حديث شريف)</label>
                <span className="font-mono-num text-[11px] text-slate-400">
                  {evidenceText.length}/{TREASURE_FIELD_LIMITS.EVIDENCE_TEXT_MAX}
                </span>
              </div>
              <textarea
                id="treasure-evidence-text"
                rows={2}
                maxLength={TREASURE_FIELD_LIMITS.EVIDENCE_TEXT_MAX}
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="{ إن الله وملائكته يصلون على النبي }"
                className="w-full rounded-2xl bg-[#0D091A] border border-white/15 focus:border-amber-400 focus:outline-none px-4 py-2.5 text-sm text-white"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                <label htmlFor="treasure-evidence-ref">المصدر / السورة</label>
                <span className="font-mono-num text-[11px] text-slate-400">
                  {evidenceRef.length}/{TREASURE_FIELD_LIMITS.EVIDENCE_REF_MAX}
                </span>
              </div>
              <input
                id="treasure-evidence-ref"
                type="text"
                maxLength={TREASURE_FIELD_LIMITS.EVIDENCE_REF_MAX}
                value={evidenceRef}
                onChange={(e) => setEvidenceRef(e.target.value)}
                placeholder="[الأحزاب : 56]"
                className="w-full rounded-2xl bg-[#0D091A] border border-white/15 focus:border-amber-400 focus:outline-none px-4 py-2.5 text-sm text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
              <label htmlFor="treasure-closing-note">جملة التشجيع أسفل البطاقة (اختياري)</label>
              <span className="font-mono-num text-[11px] text-slate-400">
                {closingNote.length}/{TREASURE_FIELD_LIMITS.CLOSING_NOTE_MAX}
              </span>
            </div>
            <input
              id="treasure-closing-note"
              type="text"
              maxLength={TREASURE_FIELD_LIMITS.CLOSING_NOTE_MAX}
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              placeholder="معلومة رائعة .. فاحرص / احرصي على أن تكونوا من المقبولين ! 💗"
              className="w-full rounded-2xl bg-[#0D091A] border border-white/15 focus:border-amber-400 focus:outline-none px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-w-[200px] py-3 px-5 rounded-2xl font-display font-black text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-105 transition-all cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{saving ? 'بننشر...' : 'حفظ ونشر المعلومة للطلاب دلوقتي'}</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(false)}
              className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 font-display font-bold text-xs sm:text-sm text-slate-200 cursor-pointer disabled:opacity-60"
            >
              حفظ في الأرشيف بس
            </button>
          </div>
        </form>

        {/* Live Student Preview */}
        <div className="xl:col-span-5 rounded-3xl bg-[#151028] border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-200">
            <Eye className="w-4 h-4 text-amber-300" />
            <span>معاينة حية زي ما هتظهر للطلاب والطالبات في ركن الأذكار:</span>
          </div>

          <div className="pt-4 pb-2">
            <div className="relative z-20 flex justify-center -mb-5">
              <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-gradient-to-b from-[#2c0d59] via-[#1c083d] to-[#13052b] border border-amber-300/85 shadow-[0_0_24px_rgba(251,191,36,0.4)]">
                <div className="text-right">
                  <div className="font-display text-sm sm:text-base font-black text-amber-200">
                    معلومة يمكن اول مرة تعرفها
                  </div>
                  <div className="text-[10px] font-bold text-amber-100/85">
                    معلومة دينية مميزة كل يوم ✨
                  </div>
                </div>
                <Gem className="w-6 h-6 text-sky-300 shrink-0" />
              </div>
            </div>

            <div className="rounded-[24px] border border-fuchsia-400/65 bg-gradient-to-b from-[#1e0a45] via-[#150634] to-[#0f0425] px-4 pt-9 pb-6 text-center space-y-3 shadow-[0_0_32px_rgba(217,70,239,0.28)]">
              <div className="flex justify-center">
                <span className="px-4 py-1 rounded-full bg-gradient-to-r from-[#581c87] via-[#78350f] to-[#581c87] border border-amber-300/80 inline-flex items-center gap-1.5 text-xs font-display font-black text-amber-200">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
                  <span>{questionLead.trim() || 'هل كنت تعرف ؟'}</span>
                </span>
              </div>

              <div className="rounded-2xl bg-[#18083d]/85 border border-purple-300/30 p-4 space-y-3">
                <p className="font-display text-base sm:text-lg font-black text-white leading-relaxed">
                  {factLine1.trim() || 'اكتب نص المعلومة هنا عشان تشوف شكلها...'}
                  {factLine2.trim() && (
                    <>
                      <br />
                      {factLine2.trim()}
                    </>
                  )}
                </p>

                {(evidenceText.trim() || evidenceRef.trim()) && (
                  <div className="rounded-xl bg-[#240f54]/75 border border-purple-300/25 px-3 py-2.5 space-y-1">
                    <div className="inline-flex items-center gap-1 text-xs font-display font-black text-amber-200">
                      <BookOpen className="w-3.5 h-3.5 text-amber-300" />
                      <span>والدليل ✨</span>
                    </div>
                    {evidenceText.trim() && (
                      <p className="font-display text-xs sm:text-sm font-bold text-rose-100">
                        {evidenceText.trim()}
                      </p>
                    )}
                    {evidenceRef.trim() && (
                      <div className="text-[11px] text-purple-200/85">{evidenceRef.trim()}</div>
                    )}
                  </div>
                )}
              </div>

              {closingNote.trim() && (
                <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#2e1065]/90 border border-purple-300/45 text-[11px] font-display font-bold text-white">
                  <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
                  <span>{closingNote.trim()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Saved Archive List */}
      <div className="rounded-3xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base sm:text-lg font-black text-white">
            أرشيف المعلومات الدينية ({treasures.length})
          </h3>
          <span className="text-xs text-slate-400">
            تقدر تنشر أي معلومة محفوظة أو تعدلها في أي وقت
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">بنحمّل الأرشيف...</div>
        ) : treasures.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            لسه مكتبتش أي معلومات دينية مخصصة. اكتب أول معلومة من الفورم اللي فوق ✨
          </div>
        ) : (
          <div className="space-y-3">
            {treasures.map((item) => {
              const isPublishedNow =
                item.isActive || (activeDoc?.treasureId && activeDoc.treasureId === item.id);
              const isBusy = busyActionId === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isPublishedNow
                      ? 'bg-emerald-950/30 border-emerald-500/45'
                      : 'bg-[#0D091A] border-white/10'
                  }`}
                >
                  <div className="space-y-1 text-right">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-amber-300">{item.questionLead}</span>
                      {isPublishedNow && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-bold text-emerald-300">
                          منشورة للطلاب دلوقتي ✨
                        </span>
                      )}
                    </div>
                    <p className="font-display text-sm sm:text-base font-bold text-white">
                      {item.factLine1} {item.factLine2}
                    </p>
                    {(item.evidenceText || item.evidenceRef) && (
                      <p className="text-xs text-slate-300">
                        {item.evidenceText} {item.evidenceRef}
                      </p>
                    )}
                    {item.closingNote && (
                      <p className="text-[11px] text-purple-300">{item.closingNote}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!isPublishedNow && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleActivate(item)}
                        className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-display font-black cursor-pointer disabled:opacity-60"
                      >
                        {isBusy ? 'بنفعل...' : 'نشر للطلاب الآن'}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleLoadForEdit(item)}
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>

                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDelete(item)}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
                        >
                          {isBusy ? 'بنمسح...' : 'تأكيد المسح'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId('')}
                          className="px-2.5 py-2 rounded-xl bg-white/10 text-xs font-bold text-slate-300 cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 cursor-pointer disabled:opacity-60"
                        title="مسح المعلومة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
