import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, DocumentSnapshot, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileCheck2,
  Flower2,
  GraduationCap,
  History,
  ImagePlus,
  KeyRound,
  LogOut,
  Play,
  PlusCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { GROUP_CAMP_LIMITS } from '../constants/campConfig';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  areResultsReleased,
  canStudentStartAttempt,
  formatArabicDateTime,
  getExamTimeStatus,
} from '../lib/groupCampUtils';
import {
  deleteStoredGroupImage,
  uploadGroupCampCoverImage,
} from '../lib/groupImageUpload';
import {
  adminUpdateGroupCamp,
  createAndJoinGroupCamp,
  fetchAllGroupCampMembers,
  fetchExamQuestions,
  fetchGroupCamp,
  fetchGroupCampExams,
  fetchGroupMembersPage,
  fetchStudentExamAttempts,
  fetchStudentExamHistory,
  joinGroupCampByCode,
  leaveCurrentGroupCamp,
  startOrResumeExamAttempt,
  switchGroupCampByCode,
} from '../services/groupCampService';
import {
  GroupCamp,
  GroupCampMember,
  GroupExam,
  GroupExamAttempt,
  GroupExamQuestion,
  LittleQuestion,
  StudentExamHistoryEntry,
  UserProfile,
} from '../types/camp';
import { AvatarImage } from './Decorations';
import { CampExamPublisherPanel } from './CampExamPublisherPanel';
import { GroupExamRunnerModal } from './GroupExamRunnerModal';
import { GroupLeaderboardView } from './GroupLeaderboardView';
import { LittleQuestionView } from './LittleQuestionView';

export type GroupSubTab =
  | 'exams'
  | 'leaderboard'
  | 'members'
  | 'history'
  | 'little_question'
  | 'admin_exam_panel';

interface GroupCampsViewProps {
  profile: UserProfile;
  onProfileChanged: (updated: UserProfile) => void;
  subTabResetKey?: number;
  requestedSubTab?: { tab: GroupSubTab; seq: number } | null;
  onSubTabChanged?: (subTab: GroupSubTab) => void;
}

type ExamFilter = 'all' | 'available' | 'upcoming' | 'ended';

export const GroupCampsView: React.FC<GroupCampsViewProps> = ({
  profile,
  onProfileChanged,
  subTabResetKey = 0,
  requestedSubTab = null,
  onSubTabChanged,
}) => {
  const [groupCamp, setGroupCamp] = useState<GroupCamp | null>(null);
  const [loadingCamp, setLoadingCamp] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Entry mode & Join / Create / Switch / Leave state
  const [entryMode, setEntryMode] = useState<'join' | 'create'>('join');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createMaxMembers, setCreateMaxMembers] = useState(50);
  const [createInviteCode, setCreateInviteCode] = useState('');
  const [createCoverUrl, setCreateCoverUrl] = useState('');
  const [createCoverPath, setCreateCoverPath] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  // Creator quick settings modal (only for groupCamp.createdByUid === profile.uid)
  const [creatorSettingsOpen, setCreatorSettingsOpen] = useState(false);
  const [editCampName, setEditCampName] = useState('');
  const [editCampDesc, setEditCampDesc] = useState('');
  const [editCampMax, setEditCampMax] = useState(50);
  const [editCampStatus, setEditCampStatus] = useState<'open' | 'closed'>('open');
  const [editCampBusy, setEditCampBusy] = useState(false);
  const [editCampError, setEditCampError] = useState('');

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);

  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [switchCodeInput, setSwitchCodeInput] = useState('');
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState('');

  // Active sub-tab & data
  const [subTab, setSubTab] = useState<GroupSubTab>('exams');
  const [examFilter, setExamFilter] = useState<ExamFilter>('all');
  const [exams, setExams] = useState<GroupExam[]>([]);
  const [attemptsByExam, setAttemptsByExam] = useState<Record<string, GroupExamAttempt[]>>({});
  const [allMembersForLeaderboard, setAllMembersForLeaderboard] = useState<GroupCampMember[]>([]);
  const [pagedMembers, setPagedMembers] = useState<GroupCampMember[]>([]);
  const [membersCursor, setMembersCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMoreMembers, setHasMoreMembers] = useState(false);
  const [loadingMoreMembers, setLoadingMoreMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const [history, setHistory] = useState<StudentExamHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [littleQuestions, setLittleQuestions] = useState<LittleQuestion[]>([]);
  const [coverBroken, setCoverBroken] = useState(false);

  // Active Exam Runner state
  const [runnerState, setRunnerState] = useState<{
    exam: GroupExam;
    questions: GroupExamQuestion[];
    attempt: GroupExamAttempt;
    serverNowMs: number;
    readOnlyReviewOnly?: boolean;
  } | null>(null);
  const [launchingExamId, setLaunchingExamId] = useState('');
  const [examActionError, setExamActionError] = useState('');

  const activeGroupCampId = profile.groupCampId || '';

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const list = await fetchStudentExamHistory(profile.uid);
      setHistory(list);
    } catch {
      // Non-fatal
    } finally {
      setLoadingHistory(false);
    }
  }, [profile.uid]);

  const loadCampData = useCallback(
    async (options?: { silent?: boolean }) => {
      setLoadError('');
      if (!activeGroupCampId) {
        setGroupCamp(null);
        setExams([]);
        setAllMembersForLeaderboard([]);
        setPagedMembers([]);
        setLoadingCamp(false);
        return;
      }

      if (!options?.silent) {
        setLoadingCamp(true);
      }
      try {
        const campDoc = await fetchGroupCamp(activeGroupCampId);
        if (!campDoc) {
          setGroupCamp(null);
          setLoadingCamp(false);
          return;
        }
        setGroupCamp(campDoc);
        setCoverBroken(false);

        const [examList, firstMembersPage, leaderboardMembers] = await Promise.all([
          fetchGroupCampExams({ campId: campDoc.id, includeDrafts: false }),
          fetchGroupMembersPage({ campId: campDoc.id, pageSize: GROUP_CAMP_LIMITS.MEMBERS_PAGE_SIZE }),
          fetchAllGroupCampMembers(campDoc.id),
        ]);

        setExams(examList);
        setPagedMembers(firstMembersPage.members);
        setMembersCursor(firstMembersPage.lastDoc);
        setHasMoreMembers(firstMembersPage.hasMore);
        setAllMembersForLeaderboard(leaderboardMembers);

        // Load student's own attempts per published exam
        const attemptsEntries = await Promise.all(
          examList.map(async (ex) => {
            const atts = await fetchStudentExamAttempts({
              campId: campDoc.id,
              examId: ex.id,
              uid: profile.uid,
            });
            return [ex.id, atts] as const;
          })
        );
        setAttemptsByExam(Object.fromEntries(attemptsEntries));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'معرفناش نحمّل بيانات المعسكر الجماعي.');
      } finally {
        if (!options?.silent) {
          setLoadingCamp(false);
        }
      }
    },
    [activeGroupCampId, profile.uid]
  );

  useEffect(() => {
    void loadCampData();
    void loadHistory();
  }, [loadCampData, loadHistory]);

  useEffect(() => {
    setSubTab('exams');
  }, [activeGroupCampId, subTabResetKey]);

  useEffect(() => {
    if (requestedSubTab && requestedSubTab.seq > 0) {
      setSubTab(requestedSubTab.tab);
    }
  }, [requestedSubTab]);

  useEffect(() => {
    onSubTabChanged?.(groupCamp ? subTab : 'exams');
  }, [groupCamp, subTab, onSubTabChanged]);

  useEffect(() => {
    if (!groupCamp?.id) {
      setLittleQuestions([]);
      return;
    }
    const path = `groupCamps/${groupCamp.id}/littleQuestions`;
    const unsub = onSnapshot(
      query(collection(db, 'groupCamps', groupCamp.id, 'littleQuestions'), orderBy('createdAt', 'desc')),
      (snap) => {
        setLittleQuestions(snap.docs.map((d) => d.data() as LittleQuestion));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [groupCamp?.id]);

  const handleJoinCamp = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    if (!joinCodeInput.trim()) {
      setJoinError('اكتب / اكتبي كود الدعوة الأول.');
      return;
    }
    setJoinBusy(true);
    try {
      const joined = await joinGroupCampByCode({
        rawCode: joinCodeInput,
        profile,
      });
      setJoinCodeInput('');
      onProfileChanged({ ...profile, groupCampId: joined.id });
      setGroupCamp(joined);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'معرفناش ندخّلك المعسكر دلوقتي.');
    } finally {
      setJoinBusy(false);
    }
  };

  const handleUploadCreateCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCreateError('');
    setUploadingCover(true);
    try {
      if (createCoverPath) {
        await deleteStoredGroupImage(createCoverPath);
      }
      const res = await uploadGroupCampCoverImage({
        file,
        campId: `user_${profile.uid}`,
      });
      setCreateCoverUrl(res.url);
      setCreateCoverPath(res.storagePath);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'معرفناش نرفع صورة الغلاف.');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCreateGroupCamp = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (createName.trim().length < GROUP_CAMP_LIMITS.CAMP_NAME_MIN) {
      setCreateError('اكتب / اكتبي اسم واضح للمعسكر (حرفين على الأقل).');
      return;
    }
    setCreateBusy(true);
    try {
      const created = await createAndJoinGroupCamp({
        profile,
        name: createName,
        description: createDesc,
        maxMembers: createMaxMembers,
        inviteCode: createInviteCode || undefined,
        coverImageUrl: createCoverUrl,
        coverStoragePath: createCoverPath,
      });
      setCreateName('');
      setCreateDesc('');
      setCreateInviteCode('');
      setCreateCoverUrl('');
      setCreateCoverPath('');
      setCreateModalOpen(false);
      onProfileChanged({ ...profile, groupCampId: created.id });
      setGroupCamp(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'معرفناش نعمل المعسكر الجديد.');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleOpenCreatorSettings = () => {
    if (!groupCamp) return;
    setEditCampName(groupCamp.name);
    setEditCampDesc(groupCamp.description);
    setEditCampMax(groupCamp.maxMembers);
    setEditCampStatus(groupCamp.status);
    setEditCampError('');
    setCreatorSettingsOpen(true);
  };

  const handleSaveCreatorSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupCamp) return;
    setEditCampError('');
    setEditCampBusy(true);
    try {
      await adminUpdateGroupCamp({
        campId: groupCamp.id,
        name: editCampName,
        description: editCampDesc,
        coverImageUrl: groupCamp.coverImageUrl,
        coverStoragePath: groupCamp.coverStoragePath,
        maxMembers: editCampMax,
        status: editCampStatus,
        currentMemberCount: groupCamp.memberCount,
      });
      setCreatorSettingsOpen(false);
      await loadCampData();
    } catch (err) {
      setEditCampError(err instanceof Error ? err.message : 'معرفناش نحفظ تعديلات المعسكر.');
    } finally {
      setEditCampBusy(false);
    }
  };

  const handleConfirmLeave = async () => {
    if (!groupCamp) return;
    setLeaveBusy(true);
    try {
      await leaveCurrentGroupCamp({ campId: groupCamp.id, uid: profile.uid });
      setLeaveModalOpen(false);
      onProfileChanged({ ...profile, groupCampId: '' });
      setGroupCamp(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'معرفناش نخرجك من المعسكر دلوقتي.');
    } finally {
      setLeaveBusy(false);
    }
  };

  const handleSwitchCamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupCamp) return;
    setSwitchError('');
    if (!switchCodeInput.trim()) {
      setSwitchError('اكتب / اكتبي كود دعوة المعسكر الجديد.');
      return;
    }
    setSwitchBusy(true);
    try {
      const newCamp = await switchGroupCampByCode({
        oldCampId: groupCamp.id,
        rawNewCode: switchCodeInput,
        profile,
      });
      setSwitchCodeInput('');
      setSwitchModalOpen(false);
      onProfileChanged({ ...profile, groupCampId: newCamp.id });
      setGroupCamp(newCamp);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : 'معرفناش ننقلك للمعسكر الجديد.');
    } finally {
      setSwitchBusy(false);
    }
  };

  const handleLoadMoreMembers = async () => {
    if (!groupCamp || !membersCursor || loadingMoreMembers) return;
    setLoadingMoreMembers(true);
    try {
      const next = await fetchGroupMembersPage({
        campId: groupCamp.id,
        pageSize: GROUP_CAMP_LIMITS.MEMBERS_PAGE_SIZE,
        cursor: membersCursor,
      });
      setPagedMembers((prev) => [...prev, ...next.members]);
      setMembersCursor(next.lastDoc);
      setHasMoreMembers(next.hasMore);
    } finally {
      setLoadingMoreMembers(false);
    }
  };

  const handleCopyCode = async () => {
    if (!groupCamp) return;
    try {
      await navigator.clipboard.writeText(groupCamp.inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleStartOrResumeExam = async (exam: GroupExam) => {
    if (!groupCamp) return;
    setExamActionError('');
    setLaunchingExamId(exam.id);
    try {
      const qs = await fetchExamQuestions(groupCamp.id, exam.id);
      if (qs.length === 0) {
        throw new Error('الامتحان ده مفيهوش أسئلة منشورة لسه.');
      }
      const res = await startOrResumeExamAttempt({
        camp: groupCamp,
        exam,
        questions: qs,
        profile,
        publishedExamsCount: exams.length,
      });
      setRunnerState({
        exam,
        questions: qs,
        attempt: res.attempt,
        serverNowMs: res.serverNowMs,
        readOnlyReviewOnly: false,
      });
    } catch (err) {
      setExamActionError(err instanceof Error ? err.message : 'معرفناش نفتح الامتحان دلوقتي.');
      void loadCampData({ silent: true });
      void loadHistory();
    } finally {
      setLaunchingExamId('');
    }
  };

  const handleReviewFinishedAttempt = async (exam: GroupExam, att: GroupExamAttempt) => {
    if (!groupCamp) return;
    setExamActionError('');
    setLaunchingExamId(exam.id);
    try {
      const qs = await fetchExamQuestions(groupCamp.id, exam.id);
      setRunnerState({
        exam,
        questions: qs,
        attempt: att,
        serverNowMs: Date.now(),
        readOnlyReviewOnly: true,
      });
    } catch (err) {
      setExamActionError(err instanceof Error ? err.message : 'معرفناش نفتح مراجعة النتيجة.');
    } finally {
      setLaunchingExamId('');
    }
  };

  const filteredExams = useMemo(() => {
    const now = Date.now();
    if (examFilter === 'all') return exams;
    return exams.filter((ex) => getExamTimeStatus(ex, now) === examFilter);
  }, [examFilter, exams]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const source = q ? allMembersForLeaderboard : pagedMembers;
    if (!q) return source;
    return source.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [allMembersForLeaderboard, memberSearch, pagedMembers]);

  // Shared History Section (visible both inside and outside a camp!)
  const PreservedHistoryBlock = (
    <section className="glass-surface-strong rounded-3xl p-5 sm:p-7 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              سجل درجاتك المحفوظة
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              كل درجاتك اللي قبل كده متسجلة دايمًا ومش بتتمسح لو خرجت / خرجتي من أي معسكر أو روحت / روحتي لمعسكر تاني.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono-num tabular-nums text-slate-500 dark:text-slate-400">
          {history.length} نتيجة
        </span>
      </div>

      {loadingHistory ? (
        <div className="py-8 text-center text-sm text-slate-500">بنحمّل السجل...</div>
      ) : history.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          لسه ما امتحنتش / ما امتحنتيش امتحانات جماعية لحد دلوقتي.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {history.map((item) => {
            const released = !item.resultsReleaseAtMs || Date.now() >= item.resultsReleaseAtMs;
            return (
              <div
                key={item.id}
                className="rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-white/10 p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-xs font-semibold text-purple-600 dark:text-purple-300 truncate">
                    {item.campName} · {item.subject}
                  </div>
                  <div className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {item.examTitle}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    المحاولة {item.attemptNumber} · {formatArabicDateTime(item.submittedAtMs)}
                  </div>
                </div>
                <div className="text-left shrink-0 font-mono-num tabular-nums">
                  {released ? (
                    <>
                      <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                        {item.score} / {item.maxScore}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.percentage}%
                      </div>
                    </>
                  ) : (
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-300">
                      مستنيين إعلان النتيجة
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  if (loadingCamp && !groupCamp) {
    return (
      <div className="glass-surface-strong rounded-3xl p-12 text-center space-y-3">
        <GraduationCap className="w-10 h-10 text-purple-500 mx-auto animate-pulse" />
        <div className="font-display font-bold text-lg text-slate-900 dark:text-white">
          بنحمّل المعسكرات الجماعية...
        </div>
      </div>
    );
  }

  // Reusable Create Group Camp Form Fields
  const renderCreateCampFormBody = (isModalContext: boolean) => (
    <form onSubmit={handleCreateGroupCamp} className={`${isModalContext ? '' : 'max-w-2xl'} space-y-4`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
            اسم المعسكر *
          </label>
          <input
            type="text"
            required
            maxLength={GROUP_CAMP_LIMITS.CAMP_NAME_MAX}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="مثال: معسكر إنقاذ الفيزياء — 50 طالب وطالبة"
            className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/35 px-4 py-2.5 text-sm text-slate-900 dark:text-white"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
            وصف المعسكر (اختياري)
          </label>
          <textarea
            rows={2}
            maxLength={GROUP_CAMP_LIMITS.CAMP_DESC_MAX}
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            placeholder="هدف المعسكر ومواعيد المذاكرة والامتحانات..."
            className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/35 px-4 py-2 text-xs sm:text-sm text-slate-900 dark:text-white"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
            أقصى عدد للشباب والبنات (من 2 لـ 50)
          </label>
          <input
            type="number"
            min={2}
            max={50}
            value={createMaxMembers}
            onChange={(e) =>
              setCreateMaxMembers(Math.min(50, Math.max(2, Number(e.target.value) || 50)))
            }
            className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/35 px-4 py-2.5 text-sm font-mono-num text-slate-900 dark:text-white"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
            كود الدعوة (اختياري — بيتعمل لوحده)
          </label>
          <input
            type="text"
            dir="ltr"
            maxLength={20}
            value={createInviteCode}
            onChange={(e) =>
              setCreateInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
            }
            placeholder="GRP-XXXXXX"
            className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/35 px-4 py-2.5 text-sm font-mono uppercase text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Optional Cover Upload */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
          صورة غلاف المعسكر (اختياري — JPG / PNG / WEBP)
        </label>
        {createCoverUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={createCoverUrl}
              alt="غلاف المعسكر"
              className="w-24 h-14 rounded-xl object-cover border border-purple-200 dark:border-white/15"
            />
            <button
              type="button"
              onClick={() => {
                void deleteStoredGroupImage(createCoverPath);
                setCreateCoverUrl('');
                setCreateCoverPath('');
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold cursor-pointer"
            >
              شيل الغلاف
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-300 dark:border-purple-500/40 bg-white/60 dark:bg-slate-900/50 py-3.5 text-xs font-bold text-purple-700 dark:text-purple-300 cursor-pointer hover:bg-purple-50/70 dark:hover:bg-purple-950/30">
            <ImagePlus className="w-4 h-4" />
            <span>{uploadingCover ? 'بنرفع ونضغط الصورة...' : 'ارفع / ارفعي صورة غلاف من جهازك'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void handleUploadCreateCover(e)}
              className="hidden"
            />
          </label>
        )}
      </div>

      {createError && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{createError}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {isModalContext && (
          <button
            type="button"
            disabled={createBusy}
            onClick={() => setCreateModalOpen(false)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            إلغاء
          </button>
        )}
        <button
          type="submit"
          disabled={createBusy || uploadingCover}
          className="px-6 py-3 rounded-2xl font-display font-bold text-sm text-white bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 shadow-md hover:brightness-105 transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>
            {createBusy
              ? 'بنعمل المعسكر...'
              : isModalContext && groupCamp
                ? 'اعمل المعسكر الجديد وانقله'
                : 'اعمل المعسكر وطلّع كود الدعوة'}
          </span>
        </button>
      </div>
    </form>
  );

  // Not currently a member of any Group Camp -> Join OR Create View
  if (!groupCamp) {
    return (
      <div className="space-y-6">
        <section className="glass-surface-strong rounded-3xl p-6 sm:p-10 space-y-6 border border-purple-200/80 dark:border-fuchsia-500/25">
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-mono tracking-wider font-bold text-purple-600 dark:text-purple-300">
              GROUP CAMPS · لحد 50 طالب وطالبة في كل معسكر
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              المعسكرات الجماعية والامتحانات التنافسية
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              ادخل / ادخلي معسكر جماعي بكود الدعوة، أو اعمل / اعملي معسكرك الخاص وشاركه مع صحابك وزمايلك (شباب وبنات).
            </p>
          </div>

          {/* Join vs Create Tabs */}
          <div className="inline-grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setEntryMode('join');
                setCreateError('');
              }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-display font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                entryMode === 'join'
                  ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>دخول بكود دعوة</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryMode('create');
                setJoinError('');
              }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-display font-bold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                entryMode === 'create'
                  ? 'bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>اعمل معسكر جديد</span>
            </button>
          </div>

          {entryMode === 'join' ? (
            <form onSubmit={handleJoinCamp} className="max-w-xl space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-purple-500" />
                  <span>اكتب / اكتبي كود دعوة المعسكر الجماعي</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    dir="ltr"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="مثال: GRP-A1B2C3"
                    className="flex-1 rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/35 px-4 py-3 text-base font-mono font-bold tracking-wider text-slate-900 dark:text-white uppercase"
                  />
                  <button
                    type="submit"
                    disabled={joinBusy}
                    className="px-6 py-3 rounded-2xl font-display font-bold text-sm text-white bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 shadow-md hover:brightness-105 transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    {joinBusy ? 'بنتأكد...' : 'ادخل / ادخلي المعسكر'}
                  </button>
                </div>
              </div>

              {joinError && (
                <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{joinError}</span>
                </div>
              )}
            </form>
          ) : (
            renderCreateCampFormBody(false)
          )}
        </section>

        {PreservedHistoryBlock}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Group Camp Header Hero Card */}
      <section className="glass-surface-strong rounded-3xl overflow-hidden border border-purple-200/80 dark:border-fuchsia-500/25 shadow-lg">
        <div className="relative h-44 sm:h-52 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900">
          {groupCamp.coverImageUrl && !coverBroken ? (
            <img
              src={groupCamp.coverImageUrl}
              alt={groupCamp.name}
              referrerPolicy="no-referrer"
              onError={() => setCoverBroken(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-600/35 via-purple-700/45 to-cyan-600/35">
              <GraduationCap className="w-16 h-16 text-white/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 flex flex-col lg:flex-row lg:items-end justify-between gap-4 text-white">
            <div className="space-y-1.5 max-w-2xl">
              <div className="text-xs font-mono tracking-wider text-amber-300 font-bold">
                GROUP CAMPS · {groupCamp.status === 'open' ? 'معسكر مفتوح' : 'معسكر مقفول'} ·{' '}
                {groupCamp.memberCount} / {groupCamp.maxMembers} طالب وطالبة
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-white">
                {groupCamp.name}
              </h1>
              {groupCamp.description && (
                <p className="text-xs sm:text-sm text-slate-200 line-clamp-2">
                  {groupCamp.description}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-xs font-mono font-bold flex items-center gap-2 cursor-pointer"
                title="نسخ كود الدعوة"
              >
                <span>{groupCamp.inviteCode}</span>
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {groupCamp.createdByUid === profile.uid && (
                <button
                  type="button"
                  onClick={handleOpenCreatorSettings}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>إعدادات المعسكر</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setCreateError('');
                  setCreateModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>اعمل معسكر جديد</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSwitchCodeInput('');
                  setSwitchError('');
                  setSwitchModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>تنقّل لمعسكر تاني</span>
              </button>

              <button
                type="button"
                onClick={() => setLeaveModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-xs font-display font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج من المعسكر</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sub-navigation bar inside Group Camp */}
        <div
          className={`px-4 sm:px-6 py-3 border-t flex flex-wrap items-center justify-between gap-3 transition-colors duration-300 ${
            subTab === 'little_question'
              ? 'bg-[#1a0829]/95 border-fuchsia-400/25'
              : subTab === 'leaderboard'
                ? 'bg-[#140730]/95 border-purple-400/30'
                : 'bg-white/75 dark:bg-slate-900/75 border-slate-200/70 dark:border-white/10'
          }`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'exams', label: 'خانة الامتحان | EXAM CENTER', icon: FileCheck2 },
                { id: 'leaderboard', label: 'التصنيف العام والرانكات', icon: Trophy },
                { id: 'members', label: `الأبطال (${groupCamp.memberCount})`, icon: Users },
                { id: 'history', label: 'درجاتي اللي قبل كده', icon: History },
                { id: 'little_question', label: 'سؤال صغنن 🌸', icon: Flower2 },
                { id: 'admin_exam_panel', label: 'لوحة الأدمن', icon: ShieldCheck },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = subTab === tab.id;
              const isLqBtn = tab.id === 'little_question';
              const isAdminPanelBtn = tab.id === 'admin_exam_panel';
              const isDarkCosmicBar = subTab === 'little_question' || subTab === 'leaderboard';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`px-3.5 py-2 text-xs font-display font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    isLqBtn ? 'rounded-full' : 'rounded-xl'
                  } ${
                    active
                      ? isLqBtn
                        ? 'bg-gradient-to-r from-[#d91b86] via-[#e83ca4] to-[#b81782] border border-pink-200/50 text-white shadow-[0_0_20px_rgba(232,60,164,0.55)]'
                        : isAdminPanelBtn
                          ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 shadow-sm'
                          : 'bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 text-white shadow-sm'
                      : isDarkCosmicBar
                        ? 'bg-[#230e42]/85 border border-purple-300/20 text-purple-100/90 hover:border-purple-300/50 hover:text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isLqBtn && active ? 'text-amber-200' : ''
                    }`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              void loadCampData();
              void loadHistory();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              subTab === 'little_question' || subTab === 'leaderboard'
                ? 'text-purple-100/85 hover:bg-white/10'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </button>
        </div>
      </section>

      {loadError && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {examActionError && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{examActionError}</span>
        </div>
      )}

      {/* Sub-tab 1: EXAM CENTER */}
      {subTab === 'exams' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-black text-slate-900 dark:text-white">
                خانة الامتحان | EXAM CENTER
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                الامتحانات الإلكترونية المتاحة واللي جاية واللي خلصت جوه «{groupCamp.name}»
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'available', label: 'متاحة دلوقتي' },
                  { id: 'upcoming', label: 'لسه جاية' },
                  { id: 'ended', label: 'خلصت' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setExamFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    examFilter === f.id
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredExams.length === 0 ? (
            <div className="glass-surface-strong rounded-3xl p-10 text-center space-y-2">
              <BookOpen className="w-10 h-10 text-purple-400 mx-auto" />
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                مفيش امتحانات في القسم ده دلوقتي
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                أول ما الأدمن ينشر امتحان جديد هيظهرلك هنا على طول.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredExams.map((exam) => {
                const nowMs = Date.now();
                const status = getExamTimeStatus(exam, nowMs);
                const myAttempts = attemptsByExam[exam.id] || [];
                const decision = canStudentStartAttempt(exam, myAttempts, nowMs);
                const finishedAttempts = myAttempts.filter((a) => a.status !== 'in_progress');
                const latestFinished = finishedAttempts[finishedAttempts.length - 1] || null;
                const released = areResultsReleased(exam, nowMs);

                const statusLabel =
                  status === 'available'
                    ? 'شغّال دلوقتي'
                    : status === 'upcoming'
                      ? 'امتحان جاي'
                      : 'وقته خلص';
                const statusColor =
                  status === 'available'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : status === 'upcoming'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-slate-500 dark:text-slate-400';

                return (
                  <div
                    key={exam.id}
                    className="glass-surface-strong rounded-3xl p-5 sm:p-6 space-y-4 border border-slate-200/80 dark:border-white/10 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                        <span className="text-purple-600 dark:text-purple-300">
                          {exam.subject}
                          {exam.unit ? ` · ${exam.unit}` : ''}
                        </span>
                        <span className={statusColor}>{statusLabel}</span>
                      </div>

                      <div>
                        <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                          {exam.title}
                        </h3>
                        {exam.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                            {exam.description}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-mono-num tabular-nums">
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 px-3 py-2 border border-slate-200/70 dark:border-white/10">
                          <div className="text-[10px] text-slate-500">المدة</div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {exam.durationMinutes} د
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 px-3 py-2 border border-slate-200/70 dark:border-white/10">
                          <div className="text-[10px] text-slate-500">الأسئلة</div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {exam.questionsCount} سؤال
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 px-3 py-2 border border-slate-200/70 dark:border-white/10">
                          <div className="text-[10px] text-slate-500">الدرجة</div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {exam.totalScore}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 px-3 py-2 border border-slate-200/70 dark:border-white/10">
                          <div className="text-[10px] text-slate-500">المحاولات</div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {myAttempts.length} / {exam.maxAttempts}
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                          <span>يفتح: {formatArabicDateTime(exam.startsAtMs)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>يغلق: {formatArabicDateTime(exam.endsAtMs)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                      {latestFinished && (
                        <button
                          type="button"
                          onClick={() => void handleReviewFinishedAttempt(exam, latestFinished)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>
                            {released
                              ? `نتيجتك: ${latestFinished.score}/${latestFinished.maxScore}`
                              : 'تم التسليم (عرض الحالة)'}
                          </span>
                        </button>
                      )}

                      {decision.allowed ? (
                        <button
                          type="button"
                          disabled={launchingExamId === exam.id}
                          onClick={() => void handleStartOrResumeExam(exam)}
                          className="mr-auto px-5 py-2.5 rounded-xl text-xs font-display font-bold text-white bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 shadow-sm hover:brightness-105 cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>
                            {launchingExamId === exam.id
                              ? 'بنفتح...'
                              : decision.activeAttempt
                                ? 'كمّل الامتحان دلوقتي'
                                : myAttempts.length > 0
                                  ? 'ابدأ / ابدأي محاولة جديدة'
                                  : 'ابدأ / ابدأي الامتحان دلوقتي'}
                          </span>
                        </button>
                      ) : myAttempts.some((a) => a.status === 'in_progress') ? (
                        <button
                          type="button"
                          disabled={launchingExamId === exam.id}
                          onClick={() => void handleStartOrResumeExam(exam)}
                          className="mr-auto px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer disabled:opacity-60"
                        >
                          {launchingExamId === exam.id
                            ? 'بنحسب...'
                            : 'احسب المحاولة اللي خلصت'}
                        </button>
                      ) : (
                        <span className="mr-auto text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {decision.reason}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Sub-tab 2: Leaderboard & Champion */}
      {subTab === 'leaderboard' && (
        <GroupLeaderboardView
          camp={groupCamp}
          members={allMembersForLeaderboard}
          currentUid={profile.uid}
          exams={exams}
          onRefresh={() => loadCampData({ silent: true })}
          onBackToExams={() => setSubTab('exams')}
          onOpenMembers={() => setSubTab('members')}
        />
      )}

      {/* Sub-tab 3: Paginated Members List */}
      {subTab === 'members' && (
        <section className="glass-surface-strong rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                الأبطال في «{groupCamp.name}» ({groupCamp.memberCount}/{groupCamp.maxMembers})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                الشباب والبنات المنضمين في المعسكر دلوقتي
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="دوّر على اسم طالب أو طالبة..."
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 pr-9 pl-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredMembers.map((m) => (
              <div
                key={m.uid}
                className={`rounded-2xl p-4 border flex items-center gap-3.5 ${
                  m.uid === profile.uid
                    ? 'bg-pink-50/75 dark:bg-fuchsia-950/35 border-pink-300 dark:border-fuchsia-500/40'
                    : 'bg-white/80 dark:bg-slate-900/70 border-slate-200/80 dark:border-white/10'
                }`}
              >
                <AvatarImage
                  src={m.avatarUrl}
                  name={m.displayName}
                  sizeClass="w-12 h-12"
                  ringClass="ring-2 ring-purple-300/70 dark:ring-purple-500/40"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {m.displayName}
                    {m.uid === profile.uid ? ' (أنت / أنتي)' : ''}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num tabular-nums mt-0.5">
                    {m.totalScore} نقطة · {m.examsTakenCount} امتحانات
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!memberSearch && hasMoreMembers && (
            <div className="text-center pt-2">
              <button
                type="button"
                disabled={loadingMoreMembers}
                onClick={() => void handleLoadMoreMembers()}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 cursor-pointer disabled:opacity-60"
              >
                {loadingMoreMembers ? 'بنحمّل...' : 'اعرض أبطال أكتر'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Sub-tab 4: Permanent Preserved Exam History */}
      {subTab === 'history' && PreservedHistoryBlock}

      {/* Sub-tab 5: Little Question (سؤال صغنن — shared with all joined members inside the camp) */}
      {subTab === 'little_question' && (
        <LittleQuestionView
          camp={groupCamp}
          profile={profile}
          questions={littleQuestions}
        />
      )}

      {/* Sub-tab 6: Passcode-gated Exam Creator & Publisher ONLY (لوحة الأدمن) */}
      {subTab === 'admin_exam_panel' && (
        <CampExamPublisherPanel
          camp={groupCamp}
          profile={profile}
          onExamPublished={async () => {
            await loadCampData({ silent: true });
          }}
          onOpenExamsTab={() => setSubTab('exams')}
        />
      )}

      {/* Leave Camp Confirmation Modal */}
      {leaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-surface-strong rounded-3xl max-w-md w-full p-6 space-y-4 border border-rose-200 dark:border-rose-500/35">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                متأكد / متأكدة إنك عاوز تخرج من المعسكر؟
              </h3>
              <button
                type="button"
                onClick={() => setLeaveModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              عاوز / عاوزة تسيب معسكر <span className="font-bold">«{groupCamp.name}»</span>؟
            </p>
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 p-3 text-xs text-emerald-800 dark:text-emerald-200">
              متقلقش / متقلقيش: حسابك الشخصي وكل درجاتك ونتائج امتحاناتك اللي فاتت هتفضل محفوظة بالكامل ومش هتتمسح.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={leaveBusy}
                onClick={() => setLeaveModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={leaveBusy}
                onClick={() => void handleConfirmLeave()}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 cursor-pointer disabled:opacity-60"
              >
                {leaveBusy ? 'بنخرج...' : 'أيوة، اخرج من المعسكر'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Atomic Switch Camp Modal */}
      {switchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSwitchCamp}
            className="glass-surface-strong rounded-3xl max-w-md w-full p-6 space-y-4 border border-purple-200 dark:border-fuchsia-500/35"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                انقل / انقلي لمعسكر جماعي تاني
              </h3>
              <button
                type="button"
                onClick={() => setSwitchModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              هنتأكد الأول من صحة الكود وإن فيه مكان فاضي في المعسكر الجديد قبل ما تخرج / تخرجي من «{groupCamp.name}». لو حصل أي خطأ، هتفضل / هتفضلي زي ما أنت / أنتي في المعسكر الحالي.
            </p>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 p-3 text-[11px] text-amber-800 dark:text-amber-200">
              ملحوظة: ترتيبك في المعسكر الجديد بيبدأ من الصفر، وكل درجاتك اللي قبل كده بتفضل محفوظة في «درجاتي اللي قبل كده».
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                كود دعوة المعسكر الجديد
              </label>
              <input
                type="text"
                dir="ltr"
                value={switchCodeInput}
                onChange={(e) => setSwitchCodeInput(e.target.value.toUpperCase())}
                placeholder="مثال: GRP-XYZ123"
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/35 px-3.5 py-2.5 text-sm font-mono font-bold uppercase text-slate-900 dark:text-white"
              />
            </div>

            {switchError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 p-3 text-xs text-rose-700 dark:text-rose-200">
                {switchError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={switchBusy}
                onClick={() => setSwitchModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={switchBusy}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 cursor-pointer disabled:opacity-60"
              >
                {switchBusy ? 'بنتأكد وبننقلك...' : 'تأكيد النقل الآمن'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create New Group Camp Modal (while already inside a camp) */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-surface-strong rounded-3xl max-w-xl w-full p-6 space-y-4 border border-purple-200 dark:border-fuchsia-500/35 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                اعمل معسكر جماعي جديد
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              هنعمل المعسكر الجديد وننقلك ليه بأمان، ودرجاتك ونتائجك اللي فاتت هتفضل محفوظة زي ما هي.
            </p>
            {renderCreateCampFormBody(true)}
          </div>
        </div>
      )}

      {/* Creator Camp Settings Modal */}
      {creatorSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCreatorSettings}
            className="glass-surface-strong rounded-3xl max-w-md w-full p-6 space-y-4 border border-amber-200 dark:border-amber-500/35"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-black text-slate-900 dark:text-white">
                إعدادات المعسكر اللي عملته
              </h3>
              <button
                type="button"
                onClick={() => setCreatorSettingsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">اسم المعسكر</label>
              <input
                type="text"
                required
                maxLength={GROUP_CAMP_LIMITS.CAMP_NAME_MAX}
                value={editCampName}
                onChange={(e) => setEditCampName(e.target.value)}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">الوصف</label>
              <textarea
                rows={2}
                maxLength={GROUP_CAMP_LIMITS.CAMP_DESC_MAX}
                value={editCampDesc}
                onChange={(e) => setEditCampDesc(e.target.value)}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">الحد الأقصى</label>
                <input
                  type="number"
                  min={Math.max(2, groupCamp.memberCount)}
                  max={50}
                  value={editCampMax}
                  onChange={(e) =>
                    setEditCampMax(
                      Math.min(50, Math.max(Math.max(2, groupCamp.memberCount), Number(e.target.value) || 50))
                    )
                  }
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3 py-2 text-sm font-mono-num text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">الحالة</label>
                <select
                  value={editCampStatus}
                  onChange={(e) => setEditCampStatus(e.target.value as 'open' | 'closed')}
                  className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="open">مفتوح للانضمام</option>
                  <option value="closed">مقفول</option>
                </select>
              </div>
            </div>

            {editCampError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 p-3 text-xs text-rose-700 dark:text-rose-200">
                {editCampError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={editCampBusy}
                onClick={() => setCreatorSettingsOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={editCampBusy}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 cursor-pointer disabled:opacity-60"
              >
                {editCampBusy ? 'بنحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Exam Runner Modal */}
      {runnerState && (
        <GroupExamRunnerModal
          open={Boolean(runnerState)}
          camp={groupCamp}
          exam={runnerState.exam}
          questions={runnerState.questions}
          attempt={runnerState.attempt}
          serverNowMs={runnerState.serverNowMs}
          publishedExamsCount={exams.length}
          readOnlyReviewOnly={runnerState.readOnlyReviewOnly}
          onClose={() => {
            setRunnerState(null);
            void loadCampData({ silent: true });
            void loadHistory();
          }}
          onAttemptCompleted={(completedAttempt) => {
            setRunnerState((prev) =>
              prev ? { ...prev, attempt: completedAttempt } : null
            );
            void loadCampData({ silent: true });
            void loadHistory();
          }}
        />
      )}
    </div>
  );
};
