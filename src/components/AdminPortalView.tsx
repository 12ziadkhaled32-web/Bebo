import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  DocumentSnapshot,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  BarChart2,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Edit3,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  Gem,
  GraduationCap,
  ImagePlus,
  KeyRound,
  Lock,
  LogOut,
  Phone,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  ARABIC_OPTION_LETTERS,
  GROUP_CAMP_LIMITS,
  SCIENTIFIC_SYMBOL_SNIPPETS,
} from '../constants/campConfig';
import {
  AdminGateMode,
  claimAdminGatePasscode,
  fetchAdminGateStatus,
  parseQuestionsWithAI,
  validateAdminGateToken,
  verifyAdminGatePasscode,
} from '../lib/adminGateApi';
import { generateSafeId } from '../lib/campUtils';
import { auth, db } from '../lib/firebase';
import {
  AiParsedQuestionsSummary,
  formatArabicDateTime,
  parseBulkMcqQuestions,
  toDatetimeLocalInput,
} from '../lib/groupCampUtils';
import {
  deleteStoredGroupImage,
  uploadExamQuestionImage,
  uploadGroupCampCoverImage,
} from '../lib/groupImageUpload';
import {
  ADMIN_PHONE_LOCAL,
  getSecurityAnswerValidationError,
  getStudentPasswordValidationError,
  isAdminPhoneAuthEmail,
  SECURITY_QUESTIONS,
  toLocalEgyptianPhone,
} from '../lib/phoneAuthUtils';
import {
  adminCreateGroupCamp,
  adminDeleteGroupCamp,
  adminDeleteGroupExam,
  adminFetchAllGroupCamps,
  adminFetchExamAttempts,
  adminSaveGroupExam,
  adminToggleAttemptApproval,
  adminUpdateGroupCamp,
  fetchAllGroupCampMembers,
  fetchExamQuestions,
  fetchGroupCampExams,
} from '../services/groupCampService';
import {
  signInStudentWithPhonePassword,
  signUpStudentWithPhonePassword,
} from '../services/studentAuthService';
import {
  Camp,
  GroupCamp,
  GroupCampMember,
  GroupCampStatus,
  GroupExam,
  GroupExamAttempt,
  GroupExamPublishStatus,
  GroupExamQuestion,
  GroupQuestionType,
  UserProfile,
} from '../types/camp';
import { AvatarImage } from './Decorations';
import { AdminIslamicTreasureTab } from './AdminIslamicTreasureTab';
import { AdminPushBroadcastTab } from './AdminPushBroadcastTab';
import { ForgotPasswordModal } from './ForgotPasswordModal';

type AdminTab =
  | 'overview'
  | 'group_camps'
  | 'exam_editor'
  | 'exam_monitor'
  | 'notifications'
  | 'islamic_treasure'
  | 'security';

interface VisitorLog {
  id: string;
  timestamp: any;
  userEmail: string;
  userName: string;
  userAgent: string;
  screen: string;
}

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

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
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

interface AdminPortalViewProps {
  gateToken?: string;
  onGateVerified?: (token: string) => void;
  onExitAdminPortal?: () => void;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  gateToken = '',
  onGateVerified,
  onExitAdminPortal,
}) => {
  const [gateChecking, setGateChecking] = useState(true);
  const [gateVerified, setGateVerified] = useState(false);
  const [localGateToken, setLocalGateToken] = useState(gateToken);
  const [gateMode, setGateMode] = useState<AdminGateMode>('env');
  const [gatePasscode, setGatePasscode] = useState('');
  const [gatePasscodeConfirm, setGatePasscodeConfirm] = useState('');
  const [showGatePasscode, setShowGatePasscode] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState('');

  const activeGateToken = localGateToken || gateToken;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [adminAuthMode, setAdminAuthMode] = useState<'login' | 'signup'>('login');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminSecurityQuestion, setAdminSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [adminSecurityAnswer, setAdminSecurityAnswer] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminForgotOpen, setAdminForgotOpen] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Overview state
  const [camps, setCamps] = useState<Camp[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [visitors, setVisitors] = useState<VisitorLog[]>([]);
  const [visitorsCursor, setVisitorsCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMoreVisitors, setHasMoreVisitors] = useState(false);
  const [loadingMoreVisitors, setLoadingMoreVisitors] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  // In-UI Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Group Camps state
  const [groupCamps, setGroupCamps] = useState<GroupCamp[]>([]);
  const [editingGroupCamp, setEditingGroupCamp] = useState<GroupCamp | null>(null);
  const [gcName, setGcName] = useState('');
  const [gcDesc, setGcDesc] = useState('');
  const [gcMaxMembers, setGcMaxMembers] = useState(50);
  const [gcInviteCode, setGcInviteCode] = useState('');
  const [gcStatus, setGcStatus] = useState<GroupCampStatus>('open');
  const [gcCoverUrl, setGcCoverUrl] = useState('');
  const [gcCoverPath, setGcCoverPath] = useState('');
  const [gcCoverProviderMsg, setGcCoverProviderMsg] = useState('');
  const [gcUploadingCover, setGcUploadingCover] = useState(false);
  const [gcSaving, setGcSaving] = useState(false);
  const [copiedCampCode, setCopiedCampCode] = useState('');

  // Inspecting group camp members
  const [inspectCampId, setInspectCampId] = useState('');
  const [inspectMembers, setInspectMembers] = useState<GroupCampMember[]>([]);
  const [loadingInspectMembers, setLoadingInspectMembers] = useState(false);

  // Exam Editor state
  const [editorCampId, setEditorCampId] = useState('');
  const [campExams, setCampExams] = useState<GroupExam[]>([]);
  const [loadingCampExams, setLoadingCampExams] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
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
  const [exStatus, setExStatus] = useState<GroupExamPublishStatus>('published');
  const [exQuestions, setExQuestions] = useState<EditableQuestion[]>(() => [
    createBlankQuestion('image_mcq', 0),
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
  const [savingExam, setSavingExam] = useState(false);

  // Exam Monitor state
  const [monitorCampId, setMonitorCampId] = useState('');
  const [monitorExams, setMonitorExams] = useState<GroupExam[]>([]);
  const [monitorExamId, setMonitorExamId] = useState('');
  const [monitorMembers, setMonitorMembers] = useState<GroupCampMember[]>([]);
  const [monitorAttempts, setMonitorAttempts] = useState<GroupExamAttempt[]>([]);
  const [loadingMonitor, setLoadingMonitor] = useState(false);

  // Diagnostics state
  const [diagResults, setDiagResults] = useState<
    { label: string; ok: boolean; detail: string }[]
  >([]);
  const [runningDiag, setRunningDiag] = useState(false);

  useEffect(() => {
    let active = true;
    setGateChecking(true);
    void (async () => {
      try {
        if (gateToken) {
          setLocalGateToken(gateToken);
          const valid = await validateAdminGateToken(gateToken);
          if (!active) return;
          if (valid) {
            setGateVerified(true);
            setGateChecking(false);
            return;
          }
        }
        const status = await fetchAdminGateStatus();
        if (!active) return;
        setGateMode(status.mode);
        setGateVerified(false);
      } catch {
        if (active) setGateVerified(false);
      } finally {
        if (active) setGateChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [gateToken]);

  const handlePasscodeGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = gatePasscode.trim();
    if (!trimmed) {
      setGateError('اكتب كلمة سر لوحة الأدمن الأول.');
      return;
    }
    if (gateMode === 'claim_required') {
      if (trimmed.length < 4) {
        setGateError('كلمة السر لازم تكون 4 حروف أو أرقام على الأقل.');
        return;
      }
      if (gatePasscodeConfirm.trim() !== trimmed) {
        setGateError('تأكيد كلمة السر مش متطابق.');
        return;
      }
    }
    setGateBusy(true);
    setGateError('');
    try {
      const result =
        gateMode === 'claim_required'
          ? await claimAdminGatePasscode(trimmed)
          : await verifyAdminGatePasscode(trimmed);

      if (!result.ok || !result.token) {
        if (result.mode === 'claim_required') setGateMode('claim_required');
        setGateError(result.error || 'معرفناش نتأكد من كلمة السر.');
        return;
      }

      setGatePasscode('');
      setGatePasscodeConfirm('');
      setLocalGateToken(result.token);
      setGateVerified(true);
      onGateVerified?.(result.token);
    } catch {
      setGateError('معرفناش نتصل بسيرفر التحقق.');
    } finally {
      setGateBusy(false);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const isAuthorizedAdmin = Boolean(user && isAdminPhoneAuthEmail(user.email));

  const handleAdminPhoneAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const passErr = getStudentPasswordValidationError(adminPassword);
    if (passErr) {
      setError(passErr);
      return;
    }

    if (adminAuthMode === 'signup') {
      if (adminPassword !== adminConfirmPassword) {
        setError('كلمتين السر مش زي بعض.. راجعهم واتأكد إنهم متطابقين.');
        return;
      }
      const ansErr = getSecurityAnswerValidationError(adminSecurityAnswer);
      if (ansErr) {
        setError(ansErr);
        return;
      }
    }

    setError('');
    setAuthBusy(true);
    try {
      if (auth.currentUser && !isAdminPhoneAuthEmail(auth.currentUser.email)) {
        await signOut(auth);
      }
      if (adminAuthMode === 'signup') {
        await signUpStudentWithPhonePassword({
          local01: ADMIN_PHONE_LOCAL,
          password: adminPassword,
          securityQuestion: adminSecurityQuestion,
          securityAnswer: adminSecurityAnswer,
        });
      } else {
        await signInStudentWithPhonePassword(ADMIN_PHONE_LOCAL, adminPassword);
      }
      setAdminPassword('');
      setAdminConfirmPassword('');
      setAdminSecurityAnswer('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نسجل الدخول بحساب المسؤول.');
    } finally {
      setAuthBusy(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!user || !isAdminPhoneAuthEmail(user.email)) return;
    setFetchingData(true);
    setError('');
    try {
      const [campsSnap, profilesSnap, visitorsSnap, loadedGroupCamps] = await Promise.all([
        getDocs(query(collection(db, 'camps'), limit(100))),
        getDocs(query(collection(db, 'userProfiles'), limit(200))),
        getDocs(
          query(
            collection(db, 'visitors'),
            orderBy('timestamp', 'desc'),
            limit(GROUP_CAMP_LIMITS.VISITORS_PAGE_SIZE + 1)
          )
        ),
        adminFetchAllGroupCamps(),
      ]);

      setCamps(campsSnap.docs.map((d) => d.data() as Camp));
      setProfiles(profilesSnap.docs.map((d) => d.data() as UserProfile));

      const hasMoreV = visitorsSnap.docs.length > GROUP_CAMP_LIMITS.VISITORS_PAGE_SIZE;
      const slicedV = hasMoreV
        ? visitorsSnap.docs.slice(0, GROUP_CAMP_LIMITS.VISITORS_PAGE_SIZE)
        : visitorsSnap.docs;
      setVisitors(slicedV.map((d) => d.data() as VisitorLog));
      setVisitorsCursor(slicedV.length > 0 ? slicedV[slicedV.length - 1] : null);
      setHasMoreVisitors(hasMoreV);

      setGroupCamps(loadedGroupCamps);
      if (loadedGroupCamps.length > 0) {
        setEditorCampId((prev) => prev || loadedGroupCamps[0].id);
        setMonitorCampId((prev) => prev || loadedGroupCamps[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'معرفناش نجيب بيانات لوحة التحكم من قاعدة البيانات.'
      );
    } finally {
      setFetchingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthorizedAdmin) {
      void fetchData();
    }
  }, [isAuthorizedAdmin, fetchData]);

  const handleLoadMoreVisitors = async () => {
    if (!visitorsCursor || loadingMoreVisitors) return;
    setLoadingMoreVisitors(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'visitors'),
          orderBy('timestamp', 'desc'),
          startAfter(visitorsCursor),
          limit(GROUP_CAMP_LIMITS.VISITORS_PAGE_SIZE + 1)
        )
      );
      const hasMore = snap.docs.length > GROUP_CAMP_LIMITS.VISITORS_PAGE_SIZE;
      const sliced = hasMore
        ? snap.docs.slice(0, GROUP_CAMP_LIMITS.VISITORS_PAGE_SIZE)
        : snap.docs;
      setVisitors((prev) => [...prev, ...sliced.map((d) => d.data() as VisitorLog)]);
      setVisitorsCursor(sliced.length > 0 ? sliced[sliced.length - 1] : null);
      setHasMoreVisitors(hasMore);
    } finally {
      setLoadingMoreVisitors(false);
    }
  };

  // Load exams for selected camp in Exam Editor
  const refreshEditorCampExams = useCallback(async (campId: string) => {
    if (!campId) {
      setCampExams([]);
      return;
    }
    setLoadingCampExams(true);
    try {
      const list = await fetchGroupCampExams({ campId, includeDrafts: true });
      setCampExams(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نحمّل امتحانات المعسكر.');
    } finally {
      setLoadingCampExams(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorizedAdmin && editorCampId) {
      void refreshEditorCampExams(editorCampId);
    }
  }, [isAuthorizedAdmin, editorCampId, refreshEditorCampExams]);

  // Load exams + monitor data for selected camp in Exam Monitor
  useEffect(() => {
    if (!isAuthorizedAdmin || !monitorCampId) {
      setMonitorExams([]);
      setMonitorExamId('');
      return;
    }
    void (async () => {
      try {
        const list = await fetchGroupCampExams({ campId: monitorCampId, includeDrafts: true });
        setMonitorExams(list);
        setMonitorExamId(list[0]?.id || '');
      } catch {
        setMonitorExams([]);
      }
    })();
  }, [isAuthorizedAdmin, monitorCampId]);

  const loadMonitorExamDetails = useCallback(async () => {
    if (!monitorCampId || !monitorExamId) {
      setMonitorAttempts([]);
      setMonitorMembers([]);
      return;
    }
    setLoadingMonitor(true);
    try {
      const [members, attempts] = await Promise.all([
        fetchAllGroupCampMembers(monitorCampId),
        adminFetchExamAttempts(monitorCampId, monitorExamId),
      ]);
      setMonitorMembers(members);
      setMonitorAttempts(attempts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نحمّل نتائج الامتحان.');
    } finally {
      setLoadingMonitor(false);
    }
  }, [monitorCampId, monitorExamId]);

  useEffect(() => {
    if (isAuthorizedAdmin && activeTab === 'exam_monitor' && monitorCampId && monitorExamId) {
      void loadMonitorExamDetails();
    }
  }, [isAuthorizedAdmin, activeTab, monitorCampId, monitorExamId, loadMonitorExamDetails]);

  const handleConfirmExecute = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    setError('');
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش ننفذ العملية دي.');
      setConfirmDialog(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const requestDeleteDuoCamp = (campId: string, campName: string) => {
    setConfirmDialog({
      title: 'مسح المعسكر الثنائي',
      message: `متأكد إنك عاوز تمسح المعسكر الثنائي «${campName}» نهائيًا؟`,
      confirmLabel: 'أيوة، امسح',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'camps', campId));
        setCamps((prev) => prev.filter((c) => c.id !== campId));
        setActionMessage(`مسحنا المعسكر "${campName}" خلاص.`);
      },
    });
  };

  // ============================================================
  // Group Camp CRUD Handlers
  // ============================================================

  const resetGroupCampForm = () => {
    setEditingGroupCamp(null);
    setGcName('');
    setGcDesc('');
    setGcMaxMembers(50);
    setGcInviteCode('');
    setGcStatus('open');
    setGcCoverUrl('');
    setGcCoverPath('');
    setGcCoverProviderMsg('');
  };

  const startEditGroupCamp = (gc: GroupCamp) => {
    setEditingGroupCamp(gc);
    setGcName(gc.name);
    setGcDesc(gc.description);
    setGcMaxMembers(gc.maxMembers);
    setGcInviteCode(gc.inviteCode);
    setGcStatus(gc.status);
    setGcCoverUrl(gc.coverImageUrl);
    setGcCoverPath(gc.coverStoragePath);
    setGcCoverProviderMsg('');
  };

  const handleUploadCampCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setGcUploadingCover(true);
    try {
      const targetId = editingGroupCamp?.id || 'draft_cover';
      if (gcCoverPath) {
        await deleteStoredGroupImage(gcCoverPath);
      }
      const res = await uploadGroupCampCoverImage({ file, campId: targetId });
      setGcCoverUrl(res.url);
      setGcCoverPath(res.storagePath);
      setGcCoverProviderMsg(
        res.storageProvider === 'firebase_storage'
          ? 'رفعنا الغلاف تمام على Firebase Storage'
          : 'ضغطنا وحفظنا الغلاف بجودة عالية'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نرفع صورة الغلاف.');
    } finally {
      setGcUploadingCover(false);
    }
  };

  const handleRemoveCampCover = async () => {
    if (gcCoverPath) {
      await deleteStoredGroupImage(gcCoverPath);
    }
    setGcCoverUrl('');
    setGcCoverPath('');
    setGcCoverProviderMsg('');
  };

  const handleSaveGroupCamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setActionMessage('');
    setGcSaving(true);
    try {
      if (editingGroupCamp) {
        await adminUpdateGroupCamp({
          campId: editingGroupCamp.id,
          name: gcName,
          description: gcDesc,
          coverImageUrl: gcCoverUrl,
          coverStoragePath: gcCoverPath,
          maxMembers: gcMaxMembers,
          status: gcStatus,
          currentMemberCount: editingGroupCamp.memberCount,
        });
        setActionMessage(`حدّثنا بيانات معسكر «${gcName}» تمام.`);
      } else {
        const created = await adminCreateGroupCamp({
          adminUid: user.uid,
          name: gcName,
          description: gcDesc,
          coverImageUrl: gcCoverUrl,
          coverStoragePath: gcCoverPath,
          maxMembers: gcMaxMembers,
          inviteCode: gcInviteCode || undefined,
          status: gcStatus,
        });
        setActionMessage(
          `عملنا المعسكر الجماعي «${created.name}» بكود دعوة (${created.inviteCode}).`
        );
        setEditorCampId((prev) => prev || created.id);
        setMonitorCampId((prev) => prev || created.id);
      }
      resetGroupCampForm();
      const updatedList = await adminFetchAllGroupCamps();
      setGroupCamps(updatedList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نحفظ المعسكر الجماعي.');
    } finally {
      setGcSaving(false);
    }
  };

  const handleToggleCampStatus = async (gc: GroupCamp) => {
    setError('');
    setActionMessage('');
    try {
      const nextStatus: GroupCampStatus = gc.status === 'open' ? 'closed' : 'open';
      await adminUpdateGroupCamp({
        campId: gc.id,
        name: gc.name,
        description: gc.description,
        coverImageUrl: gc.coverImageUrl,
        coverStoragePath: gc.coverStoragePath,
        maxMembers: gc.maxMembers,
        status: nextStatus,
        currentMemberCount: gc.memberCount,
      });
      setGroupCamps((prev) =>
        prev.map((item) => (item.id === gc.id ? { ...item, status: nextStatus } : item))
      );
      setActionMessage(
        nextStatus === 'closed'
          ? `قفلنا معسكر «${gc.name}» مؤقتًا عن دخول أعضاء جدد.`
          : `فتحنا معسكر «${gc.name}» عشان يستقبل الشباب والبنات.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نغيّر حالة المعسكر.');
    }
  };

  const requestDeleteGroupCamp = (gc: GroupCamp) => {
    setConfirmDialog({
      title: 'مسح المعسكر الجماعي',
      message: `عاوز تمسح معسكر «${gc.name}»؟ (مسموح بس لو فاضي من الأعضاء والامتحانات اللي فيها محاولات).`,
      confirmLabel: 'امسح المعسكر',
      onConfirm: async () => {
        await adminDeleteGroupCamp(gc);
        setGroupCamps((prev) => prev.filter((item) => item.id !== gc.id));
        if (editingGroupCamp?.id === gc.id) resetGroupCampForm();
        if (inspectCampId === gc.id) {
          setInspectCampId('');
          setInspectMembers([]);
        }
        setActionMessage(`مسحنا المعسكر الجماعي «${gc.name}» خلاص.`);
      },
    });
  };

  const handleInspectMembers = async (campId: string) => {
    if (inspectCampId === campId) {
      setInspectCampId('');
      setInspectMembers([]);
      return;
    }
    setInspectCampId(campId);
    setLoadingInspectMembers(true);
    try {
      const members = await fetchAllGroupCampMembers(campId);
      setInspectMembers(members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نجيب أسماء المشاركين.');
    } finally {
      setLoadingInspectMembers(false);
    }
  };

  // ============================================================
  // Exam Builder Handlers
  // ============================================================

  const resetExamForm = () => {
    setEditingExamId(null);
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
    setExStatus('published');
    setExQuestions([createBlankQuestion('mcq', 0)]);
    setBulkRawText('');
    setAiParseError('');
    setLastAiSortSummary(null);
    setQuestionFilterType('all');
    setShowAdvancedExamFields(false);
    setExpandedQuestionExtras({});
  };

  const handleEditExistingExam = async (exam: GroupExam) => {
    setError('');
    try {
      const qs = await fetchExamQuestions(exam.campId, exam.id);
      setEditingExamId(exam.id);
      setExTitle(exam.title);
      setExSubject(exam.subject);
      setExUnit(exam.unit);
      setExDesc(exam.description);
      setExInstructions(exam.instructions);
      setExDurationMinutes(exam.durationMinutes);
      setExStartsAt(toDatetimeLocalInput(exam.startsAtMs));
      setExEndsAt(toDatetimeLocalInput(exam.endsAtMs));
      setExMaxAttempts(exam.maxAttempts);
      setExImmediateResults(!exam.resultsReleaseAtMs || exam.resultsReleaseAtMs <= 0);
      setExResultsAt(
        toDatetimeLocalInput(
          exam.resultsReleaseAtMs > 0 ? exam.resultsReleaseAtMs : exam.endsAtMs
        )
      );
      setExAllowReview(exam.allowReviewAfterSubmit);
      setExStatus(exam.status);
      setLastAiSortSummary(null);
      setQuestionFilterType('all');
      setExpandedQuestionExtras({});
      setExQuestions(
        qs.map((q, idx) => ({
          id: q.id,
          order: idx,
          type: q.type,
          promptText: q.promptText,
          imageUrl: q.imageUrl || '',
          imageStoragePath: q.imageStoragePath || '',
          options: q.options.length > 0 ? q.options : ['', '', '', ''],
          correctOptionIndex: q.correctOptionIndex,
          score: q.score || 1,
          explanation: q.explanation || '',
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نحمّل أسئلة الامتحان للتعديل.');
    }
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
    if (!file || !editorCampId) return;
    setError('');
    setUploadingQuestionId(q.id);
    try {
      if (q.imageStoragePath) {
        await deleteStoredGroupImage(q.imageStoragePath);
      }
      const res = await uploadExamQuestionImage({
        file,
        campId: editorCampId,
        examId: editingExamId || 'draft_exam',
        questionId: q.id,
      });
      handleUpdateQuestion(q.id, (prev) => ({
        ...prev,
        imageUrl: res.url,
        imageStoragePath: res.storagePath,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نرفع صورة السؤال.');
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
    setError('');
    setActionMessage('');
    if (bulkParseResult.questions.length === 0) {
      setError('ملقيناش أسئلة اختيار من متعدد مظبوطة في الكلام. اتأكد إن السؤال والاختيارات تحته.');
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

    if (mode === 'replace') {
      const capped = mapped.slice(0, GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM);
      setExQuestions(capped.map((q, i) => ({ ...q, order: i })));
      setActionMessage(
        `جبنا ${capped.length} سؤال اختيار من متعدد تمام${
          bulkParseResult.missingStarNumbers.length > 0
            ? ` (تنبيه: الأسئلة رقم ${bulkParseResult.missingStarNumbers.join('، ')} من غير نجمة * فاخترنا أول إجابة مؤقتًا)`
            : ''
        }. راجع الأسئلة وبعدها دوس «حفظ ونشر الامتحان».`
      );
    } else {
      const remainingRoom = Math.max(
        0,
        GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM - exQuestions.length
      );
      if (remainingRoom === 0) {
        setError(`وصلت للحد الأقصى للأسئلة (${GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM}).`);
        return;
      }
      const toAdd = mapped.slice(0, remainingRoom);
      setExQuestions((prev) =>
        [...prev, ...toAdd].map((q, i) => ({ ...q, order: i }))
      );
      setActionMessage(
        `ضفنا ${toAdd.length} سؤال اختيار من متعدد على القائمة الحالية تمام.`
      );
    }

    setBulkRawText('');
    setLastAiSortSummary(null);
    setAiParseError('');
    setQuestionFilterType('all');
  };

  const handleAnalyzeBulkWithAI = async () => {
    setError('');
    setActionMessage('');
    setAiParseError('');
    setLastAiSortSummary(null);

    if (bulkRawText.trim().length < 10) {
      setAiParseError('اكتب أو حط الأسئلة واختياراتها الأول وبعدها دوس «فرز بالذكاء الاصطناعي».');
      return;
    }

    if (!activeGateToken) {
      setAiParseError('جلسة بوابة الأدمن خلصت دلوقتي. اكتب كلمة سر البوابة تاني.');
      setGateVerified(false);
      return;
    }

    setAiParsingBulk(true);
    try {
      const result = await parseQuestionsWithAI({
        token: activeGateToken,
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

      const effectiveMode: 'replace' | 'append' =
        hasOnlyUntouchedBlank ? 'replace' : aiImportMode;

      let appliedCount = 0;
      if (effectiveMode === 'replace') {
        const capped = mapped.slice(0, GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM);
        appliedCount = capped.length;
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
        appliedCount = toAdd.length;
        setExQuestions((prev) => [...prev, ...toAdd].map((q, i) => ({ ...q, order: i })));
      }

      setLastAiSortSummary(result.summary);
      setQuestionFilterType('all');
      setActionMessage(
        `فرزنا ${appliedCount} سؤال بالذكاء الاصطناعي تمام${
          result.summary.unmarkedCount > 0
            ? ` (خلي بالك راجع ${result.summary.unmarkedCount} سؤال إجابتهم مكنتش متعلمة صراحة)`
            : ''
        }${
          result.summary.byType.image_mcq > 0
            ? ` · ${result.summary.byType.image_mcq} سؤال محتاج ترفعله صورة`
            : ''
        }.`
      );

      setTimeout(() => {
        document
          .getElementById('sorted-questions-list')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : 0;
      const msg =
        err instanceof Error
          ? err.message
          : 'معرفناش نفرز الأسئلة بالذكاء الاصطناعي. جرب تاني.';
      setAiParseError(msg);
      if (status === 401) {
        setLocalGateToken('');
        setGateVerified(false);
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

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editorCampId) return;
    setError('');
    setActionMessage('');

    const startsAtMs = new Date(exStartsAt).getTime();
    const endsAtMs = new Date(exEndsAt).getTime();
    const resultsReleaseAtMs = exImmediateResults ? 0 : new Date(exResultsAt).getTime();

    if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) {
      setError('حدد ميعاد بداية ونهاية صح للامتحان.');
      return;
    }

    for (let i = 0; i < exQuestions.length; i++) {
      const q = exQuestions[i];
      if (!q.promptText.trim() && !q.imageUrl.trim()) {
        setError(`السؤال رقم ${i + 1} لازم يكون فيه نص أو صورة على الأقل.`);
        return;
      }
      if (q.type === 'image_mcq' && !q.imageUrl.trim()) {
        setError(`السؤال رقم ${i + 1} من نوع «صورة سؤال + 4 أزرار» ولازم ترفعله صورة.`);
        return;
      }
    }

    setSavingExam(true);
    try {
      const saved = await adminSaveGroupExam({
        examId: editingExamId || undefined,
        campId: editorCampId,
        adminUid: user.uid,
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
        status: exStatus,
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

      setActionMessage(
        `حفظنا امتحان «${saved.title}» (${saved.questionsCount} سؤال · الدرجة النهائية ${saved.totalScore}) تمام.`
      );
      resetExamForm();
      await refreshEditorCampExams(editorCampId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نحفظ الامتحان.');
    } finally {
      setSavingExam(false);
    }
  };

  const requestDeleteGroupExam = (exam: GroupExam) => {
    if (exam.attemptsStartedCount > 0) {
      setError('مينفعش تمسح امتحان في شباب أو بنات بدأوا يمتحنوه فعلًا.');
      return;
    }
    setConfirmDialog({
      title: 'مسح الامتحان',
      message: `عاوز تمسح امتحان «${exam.title}» وكل أسئلته نهائيًا؟`,
      confirmLabel: 'أيوة، امسح',
      onConfirm: async () => {
        await adminDeleteGroupExam(exam);
        setCampExams((prev) => prev.filter((item) => item.id !== exam.id));
        if (editingExamId === exam.id) resetExamForm();
        setActionMessage(`مسحنا امتحان «${exam.title}» خلاص.`);
      },
    });
  };

  const handleToggleAttemptApproval = async (att: GroupExamAttempt) => {
    try {
      await adminToggleAttemptApproval({
        campId: att.campId,
        examId: att.examId,
        attemptId: att.id,
        approved: !att.adminApproved,
      });
      setMonitorAttempts((prev) =>
        prev.map((a) => (a.id === att.id ? { ...a, adminApproved: !att.adminApproved } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'معرفناش نحدّث اعتماد المحاولة.');
    }
  };

  // ============================================================
  // Security & Integrity Diagnostics
  // ============================================================

  const runDiagnostics = async () => {
    setRunningDiag(true);
    const checks: { label: string; ok: boolean; detail: string }[] = [];
    try {
      checks.push({
        label: `التحقق من حساب المسؤول (${ADMIN_PHONE_LOCAL})`,
        ok: Boolean(user && isAdminPhoneAuthEmail(user.email)),
        detail: user
          ? `${toLocalEgyptianPhone(user.email) || user.email || user.uid}`
          : 'غير مسجل الدخول',
      });

      const snap = await getDocs(query(collection(db, 'groupCamps'), limit(1)));
      checks.push({
        label: 'اتصال قاعدة البيانات المسماة Firestore (ai-studio-3e6b8295)',
        ok: true,
        detail: `متصل وراجع منه ${snap.size} سجل عينة تمام (مرتبط بقاعدة البيانات المسماة للمشروع)`,
      });
    } catch (err) {
      checks.push({
        label: 'اتصال قاعدة البيانات وقواعد الأمان',
        ok: false,
        detail: err instanceof Error ? err.message : 'فشل الاتصال',
      });
    } finally {
      setDiagResults(checks);
      setRunningDiag(false);
    }
  };

  // ============================================================
  // Auth / Access Gates
  // ============================================================

  if (gateChecking || loading) {
    return (
      <div className="min-h-screen bg-[#0D0A1A] text-white flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Sparkles className="w-8 h-8 text-amber-400 mx-auto animate-pulse" />
          <p className="text-sm font-display">بنتأكد من الصلاحيات الأمنية...</p>
        </div>
      </div>
    );
  }

  if (!gateVerified) {
    return (
      <div className="min-h-screen bg-[#0D0A1A] text-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={handlePasscodeGateSubmit}
          className="w-full max-w-md rounded-3xl bg-[#16112C] border border-amber-500/30 p-8 shadow-2xl space-y-5 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center mx-auto">
            <KeyRound className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-black text-white">
              {gateMode === 'claim_required' ? 'تعيين كلمة سر لوحة الأدمن' : 'بوابة لوحة تحكم الأدمن'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {gateMode === 'claim_required'
                ? 'لأول مرة: اختار كلمة سر تحمي بيها بوابة لوحة التحكم وبعدها دوس متابعة.'
                : 'اكتب باسورد لوحة الأدمن علشان تكمل.'}
            </p>
          </div>

          <div className="space-y-2.5 text-right">
            <div className="relative">
              <input
                type={showGatePasscode ? 'text' : 'password'}
                name="admin_portal_gate_passcode"
                autoComplete="new-password"
                data-lpignore="true"
                value={gatePasscode}
                onChange={(e) => {
                  setGatePasscode(e.target.value);
                  if (gateError) setGateError('');
                }}
                placeholder="كلمة سر لوحة الأدمن..."
                className="w-full rounded-2xl bg-[#0D0A1A] border border-amber-500/35 pr-4 pl-10 py-3 text-sm text-white"
              />
              <button
                type="button"
                onClick={() => setShowGatePasscode((prev) => !prev)}
                aria-label={showGatePasscode ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showGatePasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {gateMode === 'claim_required' && (
              <input
                type={showGatePasscode ? 'text' : 'password'}
                name="admin_portal_gate_passcode_confirm"
                autoComplete="new-password"
                data-lpignore="true"
                value={gatePasscodeConfirm}
                onChange={(e) => {
                  setGatePasscodeConfirm(e.target.value);
                  if (gateError) setGateError('');
                }}
                placeholder="اكتب كلمة السر تاني للتأكيد..."
                className="w-full rounded-2xl bg-[#0D0A1A] border border-amber-500/35 px-4 py-3 text-sm text-white"
              />
            )}
          </div>

          {gateError && (
            <div className="rounded-xl bg-rose-950/80 border border-rose-500/40 p-3 text-xs text-rose-200">
              {gateError}
            </div>
          )}

          <div className="flex gap-2.5">
            {onExitAdminPortal ? (
              <button
                type="button"
                onClick={onExitAdminPortal}
                className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>رجوع</span>
              </button>
            ) : (
              <a
                href="/"
                className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>رجوع</span>
              </a>
            )}
            <button
              type="submit"
              disabled={gateBusy}
              className="flex-1 py-3 px-5 rounded-2xl font-display font-bold text-slate-900 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-105 transition-all cursor-pointer disabled:opacity-60"
            >
              {gateBusy
                ? 'بنتأكد...'
                : gateMode === 'claim_required'
                  ? 'حفظ كلمة السر والدخول'
                  : 'فتح لوحة الأدمن'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!user || !isAuthorizedAdmin) {
    const currentAccountLabel = user
      ? toLocalEgyptianPhone(user.email) || user.email || user.uid
      : '';

    return (
      <div className="min-h-screen bg-[#0D0A1A] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-[#16112C] border border-amber-500/30 p-7 sm:p-8 shadow-2xl space-y-5 text-right">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center mx-auto">
              {user ? <ShieldAlert className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
            </div>
            <h1 className="font-display text-2xl font-black text-white">
              {user ? 'لازم حساب المسؤول المعتمد' : 'لوحة تحكم DUO CAMP'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {user ? (
                <>
                  الحساب المسجّل دلوقتي (<span className="font-mono text-white">{currentAccountLabel}</span>) مش هو رقم المسؤول المعتمد ({' '}
                  <span className="font-mono text-amber-300 font-bold" dir="ltr">{ADMIN_PHONE_LOCAL}</span> ). سجّل دخولك برقم المسؤول تحت للمتابعة.
                </>
              ) : (
                <>
                  سجّل دخولك بحساب المسؤول المعتمد (<span className="font-mono text-amber-300 font-bold" dir="ltr">{ADMIN_PHONE_LOCAL}</span>) وكلمة السر.
                </>
              )}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="وضع دخول المسؤول"
            className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#0D0A1A] border border-white/10"
          >
            <button
              type="button"
              role="tab"
              aria-selected={adminAuthMode === 'login'}
              onClick={() => {
                setAdminAuthMode('login');
                setError('');
              }}
              className={`py-2 px-3 rounded-xl font-display font-bold text-xs transition-all cursor-pointer ${
                adminAuthMode === 'login'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminAuthMode === 'signup'}
              onClick={() => {
                setAdminAuthMode('signup');
                setError('');
              }}
              className={`py-2 px-3 rounded-xl font-display font-bold text-xs transition-all cursor-pointer ${
                adminAuthMode === 'signup'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              تفعيل لأول مرة
            </button>
          </div>

          <form onSubmit={handleAdminPhoneAuthSubmit} className="space-y-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-300">رقم موبايل المسؤول المعتمد</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-amber-300 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="tel"
                  readOnly
                  dir="ltr"
                  value={ADMIN_PHONE_LOCAL}
                  aria-label="رقم موبايل المسؤول المعتمد"
                  className="w-full rounded-2xl bg-[#0D0A1A]/80 border border-amber-500/35 pr-10 pl-4 py-2.5 text-sm font-mono text-amber-200 text-left cursor-default"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="admin-phone-password" className="text-xs font-bold text-slate-300">
                  كلمة السر
                </label>
                {adminAuthMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setAdminForgotOpen(true)}
                    className="text-xs font-bold text-amber-300 hover:underline cursor-pointer"
                  >
                    نسيت كلمة السر؟
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="admin-phone-password"
                  type={showAdminPassword ? 'text' : 'password'}
                  autoComplete={adminAuthMode === 'signup' ? 'new-password' : 'current-password'}
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder={adminAuthMode === 'signup' ? 'على الأقل 6 حروف أو أرقام' : 'اكتب كلمة سر حساب المسؤول...'}
                  className="w-full rounded-2xl bg-[#0D0A1A] border border-white/15 pr-10 pl-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword((prev) => !prev)}
                  aria-label={showAdminPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {adminAuthMode === 'signup' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="admin-phone-confirm-password" className="block text-xs font-bold text-slate-300">
                    تأكيد كلمة السر
                  </label>
                  <input
                    id="admin-phone-confirm-password"
                    type={showAdminPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={adminConfirmPassword}
                    onChange={(e) => {
                      setAdminConfirmPassword(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="اكتب نفس كلمة السر تاني..."
                    className="w-full rounded-2xl bg-[#0D0A1A] border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin-security-question" className="block text-xs font-bold text-slate-300">
                    سؤال أمان لاسترجاع كلمة السر (بدون SMS)
                  </label>
                  <select
                    id="admin-security-question"
                    value={adminSecurityQuestion}
                    onChange={(e) => setAdminSecurityQuestion(e.target.value)}
                    className="w-full rounded-2xl bg-[#0D0A1A] border border-white/15 px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                  <input
                    id="admin-security-answer"
                    type="text"
                    maxLength={120}
                    value={adminSecurityAnswer}
                    onChange={(e) => {
                      setAdminSecurityAnswer(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="اكتب إجابة سؤال الأمان هنا..."
                    className="w-full rounded-2xl bg-[#0D0A1A] border border-white/15 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-rose-950/80 border border-rose-500/40 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-3.5 px-6 rounded-2xl font-display font-bold text-slate-900 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-105 transition-all cursor-pointer disabled:opacity-60"
            >
              {authBusy
                ? 'بنسجّل الدخول...'
                : adminAuthMode === 'signup'
                  ? `تفعيل والدخول بحساب المسؤول (${ADMIN_PHONE_LOCAL})`
                  : `دخول لوحة المسؤول (${ADMIN_PHONE_LOCAL})`}
            </button>
          </form>

          <div className="flex gap-3 pt-1">
            {user && (
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-display font-bold text-xs cursor-pointer"
              >
                تسجيل الخروج
              </button>
            )}
            {onExitAdminPortal ? (
              <button
                type="button"
                onClick={onExitAdminPortal}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                العودة للرئيسية
              </button>
            ) : (
              <a
                href="/"
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                العودة للرئيسية
              </a>
            )}
          </div>
        </div>

        <ForgotPasswordModal
          open={adminForgotOpen}
          initialPhone={ADMIN_PHONE_LOCAL}
          onClose={() => setAdminForgotOpen(false)}
          onResetCompleted={() => {
            setAdminForgotOpen(false);
          }}
        />
      </div>
    );
  }

  const totalGroupMembers = groupCamps.reduce((sum, g) => sum + g.memberCount, 0);
  const selectedMonitorExam = monitorExams.find((e) => e.id === monitorExamId) || null;
  const submittedAttemptsCount = monitorAttempts.filter((a) => a.status !== 'in_progress').length;
  const inProgressAttemptsCount = monitorAttempts.filter((a) => a.status === 'in_progress').length;

  return (
    <div className="min-h-screen bg-[#0A0714] text-slate-100 p-4 sm:p-8 space-y-6">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center font-black">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display text-xl sm:text-2xl font-black text-white">
                لوحة تحكم DUO CAMP السرية
              </h1>
              <span className="text-[11px] font-bold text-emerald-400">مشرف موثق</span>
            </div>
            <p className="text-xs text-slate-400">
              {user.displayName || 'المسؤول'} · <span dir="ltr" className="font-mono">{ADMIN_PHONE_LOCAL}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={fetchingData}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingData ? 'animate-spin' : ''}`} />
            <span>حدّث البيانات</span>
          </button>
          {onExitAdminPortal ? (
            <button
              type="button"
              onClick={onExitAdminPortal}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>ارجع للموقع</span>
            </button>
          ) : (
            <a
              href="/"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>ارجع للموقع</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 cursor-pointer transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Admin Sub-Navigation */}
      <nav className="max-w-7xl mx-auto flex flex-wrap gap-2">
        {(
          [
            { id: 'overview', label: 'الزوار والأبطال والثنائيات', icon: Users },
            { id: 'group_camps', label: 'إدارة المعسكرات الجماعية (50 طالب وطالبة)', icon: GraduationCap },
            { id: 'exam_editor', label: 'محرر الامتحانات والفرز الذكي', icon: FilePlus2 },
            { id: 'exam_monitor', label: 'متابعة المحاولات والنتائج', icon: BarChart2 },
            { id: 'notifications', label: 'إرسال إشعارات', icon: Bell },
            { id: 'islamic_treasure', label: 'معلومة يمكن اول مرة تعرفها', icon: Gem },
            { id: 'security', label: 'فحص الأمان وقاعدة البيانات', icon: ShieldCheck },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-display font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md'
                  : 'bg-[#151028] text-slate-300 border border-white/10 hover:border-amber-400/40'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="max-w-7xl mx-auto space-y-6">
        {actionMessage && (
          <div className="rounded-2xl bg-emerald-950/80 border border-emerald-500/40 p-4 text-sm text-emerald-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{actionMessage}</span>
            </div>
            <button type="button" onClick={() => setActionMessage('')} className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-rose-950/80 border border-rose-500/40 p-4 text-sm text-rose-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError('')} className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: Overview, Visitors, Registered Users, Duo Camps */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-3xl bg-[#151028] border border-white/10 p-5 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>المستخدمين المسجلين</span>
                  <Users className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="font-mono-num tabular-nums text-3xl font-black text-white">
                  {profiles.length}
                </div>
                <div className="text-[11px] text-slate-400">حسابات الشباب والبنات</div>
              </div>

              <div className="rounded-3xl bg-[#151028] border border-white/10 p-5 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>الزيارات المسجلة</span>
                  <Eye className="w-4 h-4 text-purple-400" />
                </div>
                <div className="font-mono-num tabular-nums text-3xl font-black text-white">
                  {visitors.length}
                  {hasMoreVisitors ? '+' : ''}
                </div>
                <div className="text-[11px] text-purple-300">أحدث زيارات المنصة الحقيقية</div>
              </div>

              <div className="rounded-3xl bg-[#151028] border border-white/10 p-5 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>المعسكرات الجماعية</span>
                  <GraduationCap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="font-mono-num tabular-nums text-3xl font-black text-white">
                  {groupCamps.length}
                </div>
                <div className="text-[11px] text-amber-300">
                  إجمالي المشاركين: {totalGroupMembers} طالب وطالبة
                </div>
              </div>

              <div className="rounded-3xl bg-[#151028] border border-white/10 p-5 space-y-1.5">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>المعسكرات الثنائية (DUO)</span>
                  <Database className="w-4 h-4 text-pink-400" />
                </div>
                <div className="font-mono-num tabular-nums text-3xl font-black text-white">
                  {camps.length}
                </div>
                <div className="text-[11px] text-emerald-400">
                  نشط: {camps.filter((c) => c.status === 'active').length} معسكر
                </div>
              </div>
            </div>

            {/* Visitors Log */}
            <section className="rounded-3xl bg-[#151028] border border-white/10 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">سجل زوار الموقع</h2>
                  <p className="text-xs text-slate-400">
                    متابعة الزوار الحقيقيين (مسجلين وغير مسجلين) وأوقات دخولهم
                  </p>
                </div>
                <span className="text-xs font-mono-num tabular-nums text-purple-300">
                  {visitors.length} سجل
                </span>
              </div>

              {visitors.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  {fetchingData ? 'بنحمّل سجل الزوار...' : 'لسه مفيش زيارات متسجلة لحد دلوقتي.'}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="pb-3 px-3">الزائر / الحساب</th>
                          <th className="pb-3 px-3">تاريخ ووقت الزيارة</th>
                          <th className="pb-3 px-3">الشاشة</th>
                          <th className="pb-3 px-3">المتصفح</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {visitors.map((v) => {
                          const timeStr = v.timestamp?.toDate
                            ? v.timestamp.toDate().toLocaleString('ar-EG')
                            : 'قيد المزامنة...';
                          return (
                            <tr key={v.id} className="hover:bg-white/[0.02]">
                              <td className="py-3 px-3 font-display font-bold text-white">
                                <span>{v.userName || 'زائر / زائرة'}</span>
                                {v.userEmail && v.userEmail !== 'زائر غير مسجل' && v.userEmail !== 'زائر / زائرة مش مسجل' && (
                                  <span className="mr-2 text-[11px] font-mono text-slate-400">
                                    ({v.userEmail})
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-300 font-mono-num tabular-nums text-xs">
                                {timeStr}
                              </td>
                              <td className="py-3 px-3 text-slate-400 font-mono text-xs">
                                {v.screen || 'مش معروف'}
                              </td>
                              <td
                                className="py-3 px-3 text-slate-500 font-mono text-[11px] truncate max-w-xs"
                                title={v.userAgent}
                              >
                                {v.userAgent}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hasMoreVisitors && (
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        disabled={loadingMoreVisitors}
                        onClick={() => void handleLoadMoreVisitors()}
                        className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold cursor-pointer disabled:opacity-60"
                      >
                        {loadingMoreVisitors ? 'بنحمّل...' : 'عرض زيارات أكتر'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Registered Users */}
            <section className="rounded-3xl bg-[#151028] border border-white/10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    الشباب والبنات المسجلين ({profiles.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    أسماء وصور وإيميل وعضوية كل حساب متسجل على المنصة
                  </p>
                </div>
              </div>

              {profiles.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  {fetchingData ? 'بنحمّل...' : 'لسه مفيش حسابات متسجلة لحد دلوقتي.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {profiles.map((p) => (
                    <div
                      key={p.uid}
                      className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex items-center gap-3.5"
                    >
                      <AvatarImage
                        src={p.avatarUrl}
                        name={p.displayName}
                        sizeClass="w-14 h-14"
                        ringClass="ring-2 ring-cyan-400/60"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <h3 className="font-display font-bold text-sm text-white truncate">
                          {p.displayName}
                        </h3>
                        {p.email && (
                          <div className="text-[11px] font-mono text-cyan-300 truncate">
                            {p.email}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 truncate">
                          ثنائي: {p.campId ? 'منضم / منضمة' : 'مفيش'} · جماعي:{' '}
                          {p.groupCampId ? 'منضم / منضمة' : 'مفيش'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Duo Camps Table */}
            <section className="rounded-3xl bg-[#151028] border border-white/10 p-6 space-y-4">
              <h2 className="font-display text-lg font-bold text-white">
                المعسكرات الثنائية (DUO CAMPS) ({camps.length})
              </h2>
              {camps.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">لا توجد معسكرات ثنائية.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400">
                        <th className="pb-3 px-3">اسم المعسكر</th>
                        <th className="pb-3 px-3">كود الدعوة</th>
                        <th className="pb-3 px-3">تاريخ البداية</th>
                        <th className="pb-3 px-3">الأعضاء</th>
                        <th className="pb-3 px-3">الحالة</th>
                        <th className="pb-3 px-3 text-left">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {camps.map((camp) => (
                        <tr key={camp.id}>
                          <td className="py-3 px-3 font-bold text-white">{camp.name}</td>
                          <td className="py-3 px-3 font-mono font-bold text-amber-300">
                            {camp.inviteCode}
                          </td>
                          <td className="py-3 px-3 text-slate-300 font-mono-num">
                            {camp.startDate}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {camp.member1Name}
                            {camp.member2Name ? ` & ${camp.member2Name}` : ' (بانتظار شريك)'}
                          </td>
                          <td className="py-3 px-3 text-xs font-bold text-emerald-400">
                            {camp.status === 'active' ? 'نشط' : 'بانتظار الشريك'}
                          </td>
                          <td className="py-3 px-3 text-left">
                            <button
                              type="button"
                              onClick={() => requestDeleteDuoCamp(camp.id, camp.name)}
                              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: Group Camps Management */}
        {activeTab === 'group_camps' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Create / Edit Group Camp Form */}
            <form
              onSubmit={handleSaveGroupCamp}
              className="lg:col-span-5 rounded-3xl bg-[#151028] border border-amber-400/25 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-black text-white">
                  {editingGroupCamp ? 'تعديل معسكر جماعي' : 'إنشاء معسكر جماعي جديد'}
                </h2>
                {editingGroupCamp && (
                  <button
                    type="button"
                    onClick={resetGroupCampForm}
                    className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">اسم المعسكر *</label>
                <input
                  type="text"
                  required
                  maxLength={GROUP_CAMP_LIMITS.CAMP_NAME_MAX}
                  value={gcName}
                  onChange={(e) => setGcName(e.target.value)}
                  placeholder="مثال: معسكر المراجعة النهائية - فيزياء"
                  className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">وصف المعسكر</label>
                <textarea
                  rows={3}
                  maxLength={GROUP_CAMP_LIMITS.CAMP_DESC_MAX}
                  value={gcDesc}
                  onChange={(e) => setGcDesc(e.target.value)}
                  placeholder="أهداف المعسكر والفئة المستهدفة وجدول الامتحانات..."
                  className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">الحد الأقصى للأعضاء (بحد أقصى 50)</label>
                  <input
                    type="number"
                    min={editingGroupCamp ? Math.max(1, editingGroupCamp.memberCount) : 1}
                    max={50}
                    value={gcMaxMembers}
                    onChange={(e) =>
                      setGcMaxMembers(Math.min(50, Math.max(1, Number(e.target.value) || 50)))
                    }
                    className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm font-mono-num text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">حالة المعسكر</label>
                  <select
                    value={gcStatus}
                    onChange={(e) => setGcStatus(e.target.value as GroupCampStatus)}
                    className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="open">مفتوح للانضمام</option>
                    <option value="closed">مغلق حاليًا</option>
                  </select>
                </div>
              </div>

              {!editingGroupCamp && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>كود الدعوة (اختياري — يُولّد تلقائيًا إذا تُرك فارغًا)</span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={20}
                    value={gcInviteCode}
                    onChange={(e) =>
                      setGcInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))
                    }
                    placeholder="GRP-XXXXXX"
                    className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm font-mono uppercase text-amber-300"
                  />
                </div>
              )}

              {/* Cover image upload */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">
                  صورة غلاف المعسكر (JPG / PNG / WEBP)
                </label>
                {gcCoverUrl ? (
                  <div className="space-y-2">
                    <div className="relative rounded-2xl overflow-hidden border border-white/15 h-36 bg-black/40">
                      <img
                        src={gcCoverUrl}
                        alt="غلاف المعسكر"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold cursor-pointer">
                        <span>{gcUploadingCover ? 'بنرفع...' : 'تغيير الصورة'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleUploadCampCover}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleRemoveCampCover()}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-bold cursor-pointer"
                      >
                        مسح الغلاف
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/25 hover:border-amber-400/60 bg-[#0D091A] py-5 text-xs font-bold text-slate-300 cursor-pointer">
                    <ImagePlus className="w-4 h-4 text-amber-400" />
                    <span>{gcUploadingCover ? 'بنظبط الصورة...' : 'ارفع صورة غلاف من الجهاز'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUploadCampCover}
                      className="hidden"
                    />
                  </label>
                )}
                {gcCoverProviderMsg && (
                  <p className="text-[11px] text-emerald-400">{gcCoverProviderMsg}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={gcSaving || gcUploadingCover}
                className="w-full py-3 rounded-2xl font-display font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400 hover:brightness-105 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>
                  {gcSaving
                    ? 'بنحفظ...'
                    : editingGroupCamp
                      ? 'حفظ تعديلات المعسكر'
                      : 'عمل المعسكر وتفعيل كود الدعوة'}
                </span>
              </button>
            </form>

            {/* Existing Group Camps List */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-3xl bg-[#151028] border border-white/10 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-black text-white">
                    المعسكرات الجماعية الحالية ({groupCamps.length})
                  </h2>
                </div>

                {groupCamps.length === 0 ? (
                  <div className="py-12 text-center space-y-2 text-slate-400 text-sm">
                    <GraduationCap className="w-10 h-10 text-amber-400/70 mx-auto" />
                    <p>لا توجد معسكرات جماعية بعد — ابدأ بإنشاء أول معسكر من النموذج الجانبي.</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {groupCamps.map((gc) => (
                      <div
                        key={gc.id}
                        className="rounded-2xl bg-[#0D091A] border border-white/10 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {gc.coverImageUrl ? (
                              <img
                                src={gc.coverImageUrl}
                                alt={gc.name}
                                className="w-16 h-12 rounded-xl object-cover shrink-0 border border-white/10"
                              />
                            ) : (
                              <div className="w-16 h-12 rounded-xl bg-purple-950/60 border border-white/10 flex items-center justify-center shrink-0">
                                <GraduationCap className="w-6 h-6 text-amber-300" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <h3 className="font-display font-bold text-base text-white truncate">
                                {gc.name}
                              </h3>
                              <div className="text-xs text-slate-400 font-mono-num tabular-nums">
                                الأعضاء: {gc.memberCount} / {gc.maxMembers} ·{' '}
                                <span
                                  className={
                                    gc.status === 'open' ? 'text-emerald-400' : 'text-rose-400'
                                  }
                                >
                                  {gc.status === 'open' ? 'مفتوح' : 'مغلق'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(gc.inviteCode);
                              setCopiedCampCode(gc.id);
                              setTimeout(() => setCopiedCampCode(''), 1500);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/15 font-mono text-xs font-bold text-amber-300 flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>{gc.inviteCode}</span>
                            {copiedCampCode === gc.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {gc.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">{gc.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => startEditGroupCamp(gc)}
                            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleCampStatus(gc)}
                            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold cursor-pointer"
                          >
                            {gc.status === 'open' ? 'إغلاق المعسكر' : 'فتح المعسكر'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleInspectMembers(gc.id)}
                            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>المشاركون ({gc.memberCount})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditorCampId(gc.id);
                              setActiveTab('exam_editor');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <FilePlus2 className="w-3.5 h-3.5" />
                            <span>الامتحانات</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteGroupCamp(gc)}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1 mr-auto cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>

                        {inspectCampId === gc.id && (
                          <div className="pt-3 border-t border-white/10 space-y-2">
                            <div className="text-xs font-bold text-cyan-300">
                              قائمة المشاركين داخل المعسكر:
                            </div>
                            {loadingInspectMembers ? (
                              <div className="text-xs text-slate-400">بنحمّل الأبطال...</div>
                            ) : inspectMembers.length === 0 ? (
                              <div className="text-xs text-slate-400">لسه مفيش شباب أو بنات دخلوا المعسكر ده.</div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {inspectMembers.map((m, idx) => (
                                  <div
                                    key={m.uid}
                                    className="rounded-xl bg-white/5 px-3 py-2 flex items-center gap-2.5"
                                  >
                                    <span className="font-mono-num text-xs font-bold text-amber-300">
                                      #{idx + 1}
                                    </span>
                                    <AvatarImage
                                      src={m.avatarUrl}
                                      name={m.displayName}
                                      sizeClass="w-8 h-8"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-bold text-white truncate">
                                        {m.displayName}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono-num">
                                        {m.totalScore} نقطة · {m.examsTakenCount} امتحانات
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Exam Creator & Direct AI Question Sorter */}
        {activeTab === 'exam_editor' && (
          <div className="space-y-6">
            {groupCamps.length === 0 ? (
              <div className="rounded-2xl bg-[#151028] border border-white/10 p-10 text-center space-y-3">
                <GraduationCap className="w-10 h-10 text-amber-400 mx-auto" />
                <div className="font-display font-bold text-lg text-white">
                  أنشئ معسكرًا جماعيًا أولًا
                </div>
                <p className="text-xs text-slate-400">
                  تحتاج إلى وجود معسكر جماعي واحد على الأقل لإضافة الامتحانات الإلكترونية إليه.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('group_camps')}
                  className="px-5 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  الانتقال لإنشاء معسكر
                </button>
              </div>
            ) : (
              <>
                {/* Zone A: Top Context Bar (Camp + Existing Exam Switcher) */}
                <div className="rounded-2xl bg-[#151028] border border-white/10 p-4 sm:p-5">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-wrap items-end gap-3 flex-1 min-w-[260px]">
                      <div className="space-y-1.5 min-w-[210px] flex-1 max-w-xs">
                        <label className="block text-xs font-bold text-slate-300">
                          المعسكر المستهدف
                        </label>
                        <select
                          value={editorCampId}
                          onChange={(e) => {
                            setEditorCampId(e.target.value);
                            resetExamForm();
                          }}
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3 py-2.5 text-sm text-white"
                        >
                          {groupCamps.map((gc) => (
                            <option key={gc.id} value={gc.id}>
                              {gc.name} ({gc.memberCount}/{gc.maxMembers})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 min-w-[220px] flex-1 max-w-sm">
                        <label className="block text-xs font-bold text-slate-300">
                          الامتحانات المحفوظة ({campExams.length})
                        </label>
                        <select
                          value={editingExamId || '__new__'}
                          disabled={loadingCampExams}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__new__') {
                              resetExamForm();
                              return;
                            }
                            const target = campExams.find((ex) => ex.id === val);
                            if (target) void handleEditExistingExam(target);
                          }}
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3 py-2.5 text-sm text-white"
                        >
                          <option value="__new__">+ إنشاء امتحان جديد</option>
                          {campExams.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              {ex.title} · {ex.questionsCount} سؤال (
                              {ex.status === 'published' ? 'منشور' : 'مسودة'})
                            </option>
                          ))}
                        </select>
                      </div>

                      {editingExamId && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={resetExamForm}
                            className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer whitespace-nowrap shrink-0"
                          >
                            امتحان جديد
                          </button>
                          {(() => {
                            const activeEx = campExams.find((ex) => ex.id === editingExamId);
                            if (!activeEx) return null;
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMonitorCampId(activeEx.campId);
                                    setMonitorExamId(activeEx.id);
                                    setActiveTab('exam_monitor');
                                  }}
                                  className="px-3.5 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  المراقبة والنتائج
                                </button>
                                <button
                                  type="button"
                                  disabled={activeEx.attemptsStartedCount > 0}
                                  onClick={() => requestDeleteGroupExam(activeEx)}
                                  className="px-3.5 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                                  title={
                                    activeEx.attemptsStartedCount > 0
                                      ? 'ممنوع حذف امتحان بدأت فيه محاولات'
                                      : 'حذف الامتحان'
                                  }
                                >
                                  حذف الامتحان
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="text-xs font-mono-num tabular-nums text-slate-300 flex items-center gap-2 shrink-0">
                      <span className="font-bold text-amber-300">{exQuestions.length} سؤال</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="font-bold text-white">{computedTotalScore} درجة</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span>{editingExamId ? 'وضع التعديل' : 'امتحان جديد'}</span>
                    </div>
                  </div>
                </div>

                {/* Zone B: Hero 50-Question Direct AI Composer & Sorter */}
                <section className="rounded-2xl bg-[#151028] border border-amber-400/30 p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="font-display text-lg sm:text-xl font-black text-white">
                        اكتب أو الصق الـ 50 سؤال دفعة واحدة
                      </h2>
                      <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                        اكتب جميع الأسئلة بأي صيغة (اختيار من متعدد، صح أو خطأ، أو معادلات علمية) واضغط «فرز بالذكاء الاصطناعي» لتتحول مباشرةً إلى أسئلة مفروزة ومصنفة باختياراتها جاهزة للنشر.
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
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-amber-200 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        إدراج مثال سريع
                      </button>
                      {bulkRawText.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setBulkRawText('');
                            setAiParseError('');
                          }}
                          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          مسح النص
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={10}
                    value={bulkRawText}
                    onChange={(e) => {
                      setBulkRawText(e.target.value);
                      if (aiParseError) setAiParseError('');
                    }}
                    placeholder={`اكتب أو الصق هنا حتى 50+ سؤال دفعة واحدة...\nمثال:\nالسؤال الأول: ما هي عاصمة مصر؟\n١- الإسكندرية\n٢- القاهرة*\n٣- الجيزة\n٤- أسوان\n\nالسؤال الثاني: الشمس تدور حول الأرض. (صح / خطأ*)`}
                    className="w-full rounded-xl bg-[#0D091A] border border-white/15 focus:border-amber-400/60 focus:outline-none px-4 py-3.5 text-sm text-white leading-relaxed"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-300 whitespace-nowrap">
                          الدرجة لكل سؤال:
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          min="0.25"
                          max="1000"
                          value={bulkDefaultScore}
                          onChange={(e) =>
                            setBulkDefaultScore(Math.max(0.25, Number(e.target.value) || 1))
                          }
                          className="w-20 rounded-xl bg-[#0D091A] border border-white/15 px-2.5 py-2 text-xs font-mono-num tabular-nums text-center text-white"
                        />
                      </div>

                      <div className="flex items-center p-1 rounded-xl bg-[#0D091A] border border-white/10">
                        <button
                          type="button"
                          onClick={() => setAiImportMode('replace')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                            aiImportMode === 'replace'
                              ? 'bg-amber-400 text-slate-950'
                              : 'text-slate-300 hover:text-white'
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
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          إضافة على القائمة
                        </button>
                      </div>

                      {bulkRawText.trim().length > 0 && (
                        <span className="text-[11px] font-mono-num tabular-nums text-slate-400">
                          {bulkRawText.trim().split('\n').filter((l) => l.trim()).length} سطر
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {bulkRawText.trim().length > 0 && bulkParseResult.questions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleApplyBulkMcqImport(aiImportMode)}
                          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          فرز فوري بعلامة * ({bulkParseResult.questions.length})
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={aiParsingBulk || bulkRawText.trim().length < 10}
                        onClick={() => void handleAnalyzeBulkWithAI()}
                        className="px-6 py-3 rounded-xl font-display font-black text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400 hover:brightness-105 transition-all cursor-pointer disabled:opacity-45 flex items-center gap-2 whitespace-nowrap shrink-0 shadow-lg"
                      >
                        {aiParsingBulk ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span>
                          {aiParsingBulk ? 'بنفرز الأسئلة بالذكاء الاصطناعي...' : 'فرز بالذكاء الاصطناعي'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {aiParseError && (
                    <div className="rounded-xl bg-rose-950/75 border border-rose-500/40 px-4 py-3 text-xs text-rose-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <span>{aiParseError}</span>
                    </div>
                  )}
                </section>

                {/* Zone C: Exam Settings + Sorted Questions Form */}
                <form
                  onSubmit={handleSaveExam}
                  className="rounded-2xl bg-[#151028] border border-white/10 p-5 sm:p-6 space-y-6"
                >
                  {/* Exam Settings Header */}
                  <div className="space-y-4 border-b border-white/10 pb-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-display text-base sm:text-lg font-black text-white">
                        {editingExamId ? 'بيانات الامتحان الحالي' : 'بيانات ونشر الامتحان'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedExamFields((prev) => !prev)}
                        className="text-xs font-bold text-amber-300 hover:text-amber-200 cursor-pointer whitespace-nowrap"
                      >
                        {showAdvancedExamFields
                          ? 'إخفاء الإعدادات الإضافية'
                          : 'إعدادات إضافية (الوصف، التعليمات، النتائج، المحاولات)'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-300">
                          اسم الامتحان *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={GROUP_CAMP_LIMITS.EXAM_TITLE_MAX}
                          value={exTitle}
                          onChange={(e) => setExTitle(e.target.value)}
                          placeholder="مثال: اختبار الفصل الأول — الكهربية"
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-300">المادة *</label>
                        <input
                          type="text"
                          required
                          maxLength={GROUP_CAMP_LIMITS.EXAM_SUBJECT_MAX}
                          value={exSubject}
                          onChange={(e) => setExSubject(e.target.value)}
                          placeholder="مثال: الفيزياء"
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-300">
                          المدة (دقيقة)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={GROUP_CAMP_LIMITS.MAX_DURATION_MINUTES}
                          value={exDurationMinutes}
                          onChange={(e) =>
                            setExDurationMinutes(Math.max(1, Number(e.target.value) || 30))
                          }
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm font-mono-num tabular-nums text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-300">
                          موعد بداية الامتحان
                        </label>
                        <input
                          type="datetime-local"
                          value={exStartsAt}
                          onChange={(e) => setExStartsAt(e.target.value)}
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3 py-2.5 text-xs font-mono-num text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-300">
                          موعد انتهاء الامتحان
                        </label>
                        <input
                          type="datetime-local"
                          value={exEndsAt}
                          onChange={(e) => setExEndsAt(e.target.value)}
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3 py-2.5 text-xs font-mono-num text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-300">
                          الباب أو الوحدة
                        </label>
                        <input
                          type="text"
                          maxLength={GROUP_CAMP_LIMITS.EXAM_UNIT_MAX}
                          value={exUnit}
                          onChange={(e) => setExUnit(e.target.value)}
                          placeholder="اختياري"
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-300">
                          حالة النشر
                        </label>
                        <select
                          value={exStatus}
                          onChange={(e) => setExStatus(e.target.value as GroupExamPublishStatus)}
                          className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3 py-2.5 text-xs font-bold text-white"
                        >
                          <option value="published">منشور للطلاب</option>
                          <option value="draft">مسودة (مخفي)</option>
                        </select>
                      </div>
                    </div>

                    {showAdvancedExamFields && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-3 border-t border-white/10">
                        <div className="space-y-1 sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-300">
                            وصف الامتحان
                          </label>
                          <textarea
                            rows={2}
                            maxLength={GROUP_CAMP_LIMITS.EXAM_DESC_MAX}
                            value={exDesc}
                            onChange={(e) => setExDesc(e.target.value)}
                            className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2 text-xs text-white"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-300">
                            تعليمات الامتحان
                          </label>
                          <textarea
                            rows={2}
                            maxLength={GROUP_CAMP_LIMITS.EXAM_INSTRUCTIONS_MAX}
                            value={exInstructions}
                            onChange={(e) => setExInstructions(e.target.value)}
                            placeholder="مثال: يُحفظ الحل تلقائيًا عند كل اختيار..."
                            className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2 text-xs text-white"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-300">
                            عدد المحاولات المسموح بها
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={GROUP_CAMP_LIMITS.MAX_ATTEMPTS_PER_EXAM}
                            value={exMaxAttempts}
                            onChange={(e) =>
                              setExMaxAttempts(
                                Math.min(10, Math.max(1, Number(e.target.value) || 1))
                              )
                            }
                            className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2 text-sm font-mono-num tabular-nums text-white"
                          />
                        </div>

                        <div className="space-y-2 pt-1">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={exAllowReview}
                              onChange={(e) => setExAllowReview(e.target.checked)}
                              className="w-4 h-4 accent-amber-400"
                            />
                            <span>السماح بمراجعة الإجابات بعد التسليم</span>
                          </label>
                        </div>

                        <div className="space-y-2 sm:col-span-2 pt-1">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={exImmediateResults}
                              onChange={(e) => setExImmediateResults(e.target.checked)}
                              className="w-4 h-4 accent-amber-400"
                            />
                            <span>إظهار الدرجة فور التسليم مباشرة</span>
                          </label>
                          {!exImmediateResults && (
                            <input
                              type="datetime-local"
                              value={exResultsAt}
                              onChange={(e) => setExResultsAt(e.target.value)}
                              className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2 text-xs font-mono-num text-white"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sorted Questions Workspace */}
                  <div id="sorted-questions-list" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="font-display text-lg font-black text-white">
                          الأسئلة المفروزة ({exQuestions.length})
                        </h3>
                        {lastAiSortSummary && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono-num tabular-nums">
                            <span className="text-emerald-400 font-bold">
                              آخر فرز بالذكاء الاصطناعي: {lastAiSortSummary.total} سؤال
                            </span>
                            {lastAiSortSummary.byType.mcq > 0 && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span>اختيار من متعدد: {lastAiSortSummary.byType.mcq}</span>
                              </>
                            )}
                            {lastAiSortSummary.byType.true_false > 0 && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span>صح أو خطأ: {lastAiSortSummary.byType.true_false}</span>
                              </>
                            )}
                            {lastAiSortSummary.byType.scientific_mcq > 0 && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span>علمي ومعادلات: {lastAiSortSummary.byType.scientific_mcq}</span>
                              </>
                            )}
                            {lastAiSortSummary.byType.image_mcq > 0 && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span className="text-amber-300">
                                  يحتاج صورة: {lastAiSortSummary.byType.image_mcq}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Add Single Question Controls */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            'mcq',
                            'true_false',
                            'scientific_mcq',
                            'image_mcq',
                          ] as GroupQuestionType[]
                        ).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              handleAddQuestion(t);
                              setQuestionFilterType('all');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-amber-400 hover:text-slate-950 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{QUESTION_TYPE_LABELS[t]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Type Filter Bar (helpful when reviewing 50 questions) */}
                    {exQuestions.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#0D091A] border border-white/10 w-fit">
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
                                ? 'bg-white text-slate-950'
                                : 'text-slate-300 hover:text-white'
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
                        .filter(
                          ({ q }) =>
                            questionFilterType === 'all' || q.type === questionFilterType
                        )
                        .map(({ q, realIdx }) => {
                          const extras = expandedQuestionExtras[q.id] || {};
                          const showImageZone =
                            q.type === 'image_mcq' ||
                            Boolean(q.imageUrl) ||
                            Boolean(extras.image);
                          const showExplanationZone =
                            Boolean(q.explanation) || Boolean(extras.explanation);

                          return (
                            <div
                              key={q.id}
                              className="rounded-2xl bg-[#0D091A] border border-white/10 p-4 sm:p-5 space-y-3.5"
                            >
                              {/* Question Header Row */}
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <span className="font-mono-num tabular-nums text-sm font-black text-amber-300">
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
                                            correctOptionIndex:
                                              prev.correctOptionIndex === 1 ? 1 : 0,
                                          };
                                        }
                                        if (nextType === 'image_mcq') {
                                          return {
                                            ...prev,
                                            type: nextType,
                                            options:
                                              prev.options.length >= 2
                                                ? prev.options
                                                : ['أ', 'ب', 'ج', 'د'],
                                            correctOptionIndex: Math.min(
                                              Math.max(0, prev.correctOptionIndex),
                                              Math.max(
                                                0,
                                                (prev.options.length >= 2
                                                  ? prev.options.length
                                                  : 4) - 1
                                              )
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
                                    className="rounded-lg bg-[#161028] border border-white/15 px-2.5 py-1 text-xs font-bold text-white"
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
                                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-slate-300 cursor-pointer whitespace-nowrap"
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
                                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-slate-300 cursor-pointer whitespace-nowrap"
                                    >
                                      + تفسير
                                    </button>
                                  )}

                                  <label className="text-[11px] text-slate-400 mr-1">
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
                                    className="w-16 rounded-lg bg-[#161028] border border-white/15 px-2 py-1 text-xs font-mono-num tabular-nums text-center text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleMoveQuestion(realIdx, -1)}
                                    disabled={realIdx === 0}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 cursor-pointer"
                                    title="نقل لأعلى"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveQuestion(realIdx, 1)}
                                    disabled={realIdx === exQuestions.length - 1}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-30 cursor-pointer"
                                    title="نقل لأسفل"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={exQuestions.length <= 1}
                                    onClick={() => void handleDeleteQuestion(q)}
                                    className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 disabled:opacity-30 cursor-pointer"
                                    title="حذف السؤال"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Scientific Symbols Bar */}
                              {q.type === 'scientific_mcq' && (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[11px] text-cyan-300 font-bold ml-1.5">
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
                                      className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-cyan-500/30 font-mono text-xs text-white cursor-pointer"
                                    >
                                      {sym}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Question Prompt */}
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
                                className="w-full rounded-xl bg-[#161028] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                              />

                              {/* Optional / Image MCQ Upload */}
                              {showImageZone && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-300">
                                      صورة السؤال (JPG / PNG / WEBP)
                                    </span>
                                    {q.imageUrl && (
                                      <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold text-amber-300 hover:underline cursor-pointer">
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
                                          className="text-xs font-bold text-rose-400 cursor-pointer"
                                        >
                                          حذف الصورة
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {q.imageUrl ? (
                                    <div className="rounded-xl bg-white p-2 border border-white/15 flex items-center justify-center max-h-60 overflow-hidden">
                                      <img
                                        src={q.imageUrl}
                                        alt={`صورة سؤال ${realIdx + 1}`}
                                        className="max-h-52 w-auto object-contain"
                                      />
                                    </div>
                                  ) : (
                                    <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 hover:border-amber-400/60 bg-[#161028] py-3.5 text-xs font-bold text-slate-300 cursor-pointer">
                                      <ImagePlus className="w-4 h-4 text-amber-400" />
                                      <span>
                                        {uploadingQuestionId === q.id
                                          ? 'بنرفع وبنظبط وضوح الصورة...'
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

                              {/* Options Grid */}
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
                                          ? 'border-emerald-400/70 bg-emerald-500/10'
                                          : 'border-white/15 bg-[#161028]'
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
                                            : 'bg-white/10 text-slate-300 hover:bg-white/20'
                                        }`}
                                        title="تعيين كإجابة صحيحة"
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
                                        className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                                      />
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Optional Explanation */}
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
                                  placeholder="تفسير الإجابة بعد التسليم (اختياري)..."
                                  className="w-full rounded-xl bg-[#161028] border border-white/10 px-3 py-2 text-xs text-white"
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Save Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
                    <div className="text-xs font-mono-num tabular-nums text-slate-300">
                      الإجمالي الجاهز للحفظ: <span className="font-bold text-amber-300">{exQuestions.length} سؤال</span> ·{' '}
                      <span className="font-bold text-white">{computedTotalScore} درجة</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {editingExamId && (
                        <button
                          type="button"
                          onClick={resetExamForm}
                          className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                        >
                          إلغاء التعديل
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={savingExam || Boolean(uploadingQuestionId)}
                        className="px-6 py-3 rounded-xl font-display font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400 hover:brightness-105 cursor-pointer disabled:opacity-60 flex items-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <Save className="w-4 h-4" />
                        <span>
                          {savingExam
                            ? 'بنحفظ الامتحان والأسئلة...'
                            : editingExamId
                              ? 'حفظ تعديلات الامتحان'
                              : 'حفظ ونشر الامتحان'}
                        </span>
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {/* TAB 4: Live Exam Participation & Results Monitor */}
        {activeTab === 'exam_monitor' && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-[#151028] border border-white/10 p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">المعسكر الجماعي</label>
                  <select
                    value={monitorCampId}
                    onChange={(e) => setMonitorCampId(e.target.value)}
                    className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                  >
                    {groupCamps.map((gc) => (
                      <option key={gc.id} value={gc.id}>
                        {gc.name} ({gc.memberCount} طالب وطالبة)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">الامتحان</label>
                  <select
                    value={monitorExamId}
                    onChange={(e) => setMonitorExamId(e.target.value)}
                    className="w-full rounded-xl bg-[#0D091A] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                  >
                    {monitorExams.length === 0 ? (
                      <option value="">مفيش امتحانات للمعسكر ده</option>
                    ) : (
                      monitorExams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.title} ({ex.subject})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {selectedMonitorExam && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="rounded-2xl bg-[#0D091A] border border-white/10 p-4">
                    <div className="text-[11px] text-slate-400">أبطال المعسكر</div>
                    <div className="font-mono-num text-2xl font-black text-white">
                      {monitorMembers.length}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#0D091A] border border-white/10 p-4">
                    <div className="text-[11px] text-slate-400">اللي بدأوا الامتحان</div>
                    <div className="font-mono-num text-2xl font-black text-amber-300">
                      {selectedMonitorExam.attemptsStartedCount}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#0D091A] border border-white/10 p-4">
                    <div className="text-[11px] text-slate-400">اللي سلّموا الامتحان</div>
                    <div className="font-mono-num text-2xl font-black text-emerald-400">
                      {submittedAttemptsCount}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#0D091A] border border-white/10 p-4">
                    <div className="text-[11px] text-slate-400">بيحلوا دلوقتي</div>
                    <div className="font-mono-num text-2xl font-black text-cyan-300">
                      {inProgressAttemptsCount}
                    </div>
                  </div>
                </div>
              )}

              {loadingMonitor ? (
                <div className="py-10 text-center text-sm text-slate-400">بنحمّل المحاولات...</div>
              ) : monitorAttempts.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  لسه مفيش محاولات للامتحان ده لحد دلوقتي.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400">
                        <th className="pb-3 px-3">الطالب / الطالبة</th>
                        <th className="pb-3 px-3">المحاولة</th>
                        <th className="pb-3 px-3">الحالة</th>
                        <th className="pb-3 px-3">الدرجة</th>
                        <th className="pb-3 px-3">وقت التسليم</th>
                        <th className="pb-3 px-3">اعتماد الدرجة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {monitorAttempts.map((att) => (
                        <tr key={att.id}>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <AvatarImage
                                src={att.studentAvatar}
                                name={att.studentName}
                                sizeClass="w-8 h-8"
                              />
                              <span className="font-display font-bold text-white">
                                {att.studentName}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono-num text-slate-300">
                            #{att.attemptNumber}
                          </td>
                          <td className="py-3 px-3 text-xs font-bold">
                            {att.status === 'submitted' ? (
                              <span className="text-emerald-400">تم التسليم</span>
                            ) : att.status === 'timed_out' ? (
                              <span className="text-amber-300">تسليم تلقائي</span>
                            ) : (
                              <span className="text-cyan-300">بيحل دلوقتي</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono-num tabular-nums font-bold text-white">
                            {att.graded ? `${att.score} / ${att.maxScore} (${att.percentage}%)` : '—'}
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-400 font-mono-num">
                            {att.submittedAtMs ? formatArabicDateTime(att.submittedAtMs) : '—'}
                          </td>
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              onClick={() => void handleToggleAttemptApproval(att)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                                att.adminApproved
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {att.adminApproved ? 'معتمد' : 'موقوف'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4.5: Group Broadcast Push Notifications */}
        {activeTab === 'notifications' && (
          <AdminPushBroadcastTab
            user={user}
            gateToken={activeGateToken}
            profiles={profiles}
            onTokenInvalidated={() => {
              setLocalGateToken('');
              setGateVerified(false);
            }}
          />
        )}

        {/* TAB 4.6: Admin-Managed Daily Religious Fact */}
        {activeTab === 'islamic_treasure' && <AdminIslamicTreasureTab user={user} />}

        {/* TAB 5: Security & Storage Diagnostics */}
        {activeTab === 'security' && (
          <div className="rounded-3xl bg-[#151028] border border-white/10 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-black text-white">
                  فحص الأمان وسلامة قاعدة البيانات والصور
                </h2>
                <p className="text-xs text-slate-400">
                  التحقق الحي من ارتباط اللوحة بقاعدة البيانات الصحيحة وقواعد الحماية المنشورة
                </p>
              </div>
              <button
                type="button"
                disabled={runningDiag}
                onClick={() => void runDiagnostics()}
                className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                {runningDiag ? 'بنفحص...' : 'ابدأ الفحص الأمني دلوقتي'}
              </button>
            </div>

            {diagResults.length > 0 && (
              <div className="space-y-2.5">
                {diagResults.map((r, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl p-4 border text-xs flex items-start justify-between gap-3 ${
                      r.ok
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="font-bold">{r.label}</div>
                      <div className="font-mono opacity-85">{r.detail}</div>
                    </div>
                    <span className="font-bold shrink-0">{r.ok ? 'تمام ✓' : 'فشل ✕'}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl bg-[#0D091A] border border-white/10 p-4 space-y-2 text-xs text-slate-300 leading-relaxed">
              <div className="font-bold text-amber-300">توضيح الصلاحيات والأمان دلوقتي:</div>
              <ul className="list-disc pr-5 space-y-1">
                <li>
                  اتصلح سبب اختفاء الزوار والبيانات اللي كان بيحصل زمان: الكود كان بيتصل بقاعدة{' '}
                  <span className="font-mono">(default)</span> الفاضية بدل قاعدة بيانات المشروع
                  المسماة، ودلوقتي كل الاستعلامات مربوطة بقاعدة المشروع الحقيقية.
                </li>
                <li>
                  صلاحيات الأدمن محمية على سيرفرات Google بقواعد{' '}
                  <span className="font-mono">firestore.rules</span> عن طريق التأكد من هوية رقم المسؤول المعتمد{' '}
                  <span className="font-mono" dir="ltr">{ADMIN_PHONE_LOCAL}</span> (مفيش أي طالب أو طالبة يقدر يعمل
                  حساب أدمن أو يدخل لصفحة البيانات).
                </li>
                <li>
                  المنصة شغالة حاليًا بباقة Firebase Starter Tier: صور الأسئلة والغلاف بتترفع على{' '}
                  Firebase Storage وفيه ضغط احتياطي ذكي بجودة عالية لو Storage لسه متفعّلش، ومؤقت الامتحان مربوط بوقت سيرفر Firestore عشان محدش يقدر يتلاعب بساعة جهازه.
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* In-UI Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="rounded-3xl bg-[#16112C] border border-rose-500/40 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-display text-lg font-black text-white">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-xs font-bold text-white cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => void handleConfirmExecute()}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
              >
                {confirmBusy ? 'بننفّذ...' : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
