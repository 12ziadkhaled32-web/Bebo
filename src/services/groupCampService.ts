import {
  collection,
  deleteDoc,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { FIELD_LIMITS, GROUP_CAMP_LIMITS } from '../constants/campConfig';
import { generateSafeId } from '../lib/campUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  canStudentStartAttempt,
  computeExamDeadlineMs,
  computeMemberTotalsFromAttempts,
  generateGroupInviteCode,
  gradeObjectiveExam,
} from '../lib/groupCampUtils';
import { deleteStoredGroupImage } from '../lib/groupImageUpload';
import {
  CrystalQuestionStyle,
  GroupAttemptStatus,
  GroupCamp,
  GroupCampMember,
  GroupCampStatus,
  GroupExam,
  GroupExamAttempt,
  GroupExamPublishStatus,
  GroupExamQuestion,
  GroupInviteCodeDoc,
  StudentExamHistoryEntry,
  UserProfile,
} from '../types/camp';

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

// ============================================================
// Student Membership: Lookup, Join, Leave, Atomic Switch
// ============================================================

export async function lookupGroupInviteCode(rawCode: string): Promise<GroupInviteCodeDoc | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) return null;
  const path = `groupInviteCodes/${code}`;
  try {
    const snap = await getDoc(doc(db, 'groupInviteCodes', code));
    if (!snap.exists()) return null;
    return snap.data() as GroupInviteCodeDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchGroupCamp(campId: string): Promise<GroupCamp | null> {
  if (!campId) return null;
  const path = `groupCamps/${campId}`;
  try {
    const snap = await getDoc(doc(db, 'groupCamps', campId));
    if (!snap.exists()) return null;
    return snap.data() as GroupCamp;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function joinGroupCampByCode(params: {
  rawCode: string;
  profile: UserProfile;
}): Promise<GroupCamp> {
  const code = params.rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
    throw new Error('شكل كود الدعوة مش صح.');
  }

  const invite = await lookupGroupInviteCode(code);
  if (!invite) {
    throw new Error('كود الدعوة ده غلط أو مش موجود.');
  }

  const campPath = `groupCamps/${invite.campId}`;
  try {
    const joinedCamp = await runTransaction(db, async (tx) => {
      const profileRef = doc(db, 'userProfiles', params.profile.uid);
      const campRef = doc(db, 'groupCamps', invite.campId);
      const memberRef = doc(db, 'groupCamps', invite.campId, 'members', params.profile.uid);

      const [profileSnap, campSnap, memberSnap] = await Promise.all([
        tx.get(profileRef),
        tx.get(campRef),
        tx.get(memberRef),
      ]);

      if (!profileSnap.exists()) {
        throw new Error('كمل / كملي بيانات بروفايلك الأول.');
      }
      const latestProfile = profileSnap.data() as UserProfile;
      if (latestProfile.groupCampId && latestProfile.groupCampId !== '') {
        if (latestProfile.groupCampId === invite.campId) {
          throw new Error('أنت / أنتي موجود / موجودة بالفعل في المعسكر ده.');
        }
        throw new Error(
          'مينفعش تنضم / تنضمي لأكتر من معسكر جماعي في نفس الوقت. استخدم / استخدمي «التبديل لمعسكر تاني».'
        );
      }

      if (!campSnap.exists()) {
        throw new Error('المعسكر ده مش موجود.');
      }
      const campData = campSnap.data() as GroupCamp;
      if (campData.status !== 'open') {
        throw new Error('المعسكر ده مقفول دلوقتي ومش بيقبل أعضاء جداد.');
      }
      if (campData.memberCount >= campData.maxMembers || campData.memberCount >= 50) {
        throw new Error(`معلش، المعسكر ده خلاص اكتمل (${campData.maxMembers}/${campData.maxMembers} طالب وطالبة).`);
      }
      if (memberSnap.exists()) {
        throw new Error('أنت / أنتي موجود / موجودة بالفعل في المعسكر ده.');
      }

      const nextCount = campData.memberCount + 1;
      tx.update(campRef, {
        memberCount: nextCount,
        updatedAt: serverTimestamp(),
      });

      tx.set(memberRef, {
        uid: params.profile.uid,
        campId: campData.id,
        displayName: clampStr(params.profile.displayName, FIELD_LIMITS.DISPLAY_NAME_MAX) || 'طالب / طالبة',
        avatarUrl: clampStr(params.profile.avatarUrl, FIELD_LIMITS.AVATAR_URL_MAX),
        totalScore: 0,
        examsTakenCount: 0,
        totalCorrectAnswers: 0,
        totalQuestionsAnswered: 0,
        completionPercent: 0,
        lastExamScore: 0,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(profileRef, {
        groupCampId: campData.id,
        updatedAt: serverTimestamp(),
      });

      return { ...campData, memberCount: nextCount };
    });

    return joinedCamp;
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes('Missing or insufficient permissions') &&
      !error.message.includes('permission-denied')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, campPath);
  }
}

/**
 * Allows any signed-in verified student/user to create a brand-new Group Camp (up to 50 students)
 * and atomically join it as its creator & first member. If they are already in another Group Camp,
 * cleanly transfers them from the old camp in the same atomic transaction after validating the new code.
 */
export async function createAndJoinGroupCamp(params: {
  profile: UserProfile;
  name: string;
  description?: string;
  maxMembers?: number;
  inviteCode?: string;
  coverImageUrl?: string;
  coverStoragePath?: string;
}): Promise<GroupCamp> {
  const safeName = clampStr(params.name, GROUP_CAMP_LIMITS.CAMP_NAME_MAX);
  if (safeName.length < GROUP_CAMP_LIMITS.CAMP_NAME_MIN) {
    throw new Error('اسم المعسكر لازم يكون حرفين على الأقل.');
  }

  const code = (params.inviteCode?.trim().toUpperCase() || generateGroupInviteCode()).replace(
    /[^A-Z0-9-]/g,
    ''
  );
  if (code.length < 4 || code.length > 20) {
    throw new Error('كود الدعوة لازم يكون من 4 لـ 20 حرف (إنجليزي وأرقام بس).');
  }

  const maxMembers = Math.min(50, Math.max(2, Math.round(params.maxMembers || 50)));
  const campId = generateSafeId('gcamp');
  const campPath = `groupCamps/${campId}`;

  try {
    const createdCamp = await runTransaction(db, async (tx) => {
      const profileRef = doc(db, 'userProfiles', params.profile.uid);
      const codeRef = doc(db, 'groupInviteCodes', code);
      const campRef = doc(db, 'groupCamps', campId);
      const memberRef = doc(db, 'groupCamps', campId, 'members', params.profile.uid);

      const [profileSnap, codeSnap] = await Promise.all([tx.get(profileRef), tx.get(codeRef)]);
      if (!profileSnap.exists()) {
        throw new Error('كمل / كملي بيانات بروفايلك الأول.');
      }
      if (codeSnap.exists()) {
        throw new Error('كود الدعوة ده مستخدم في معسكر تاني. اختار / اختاري كود غيره.');
      }

      const latestProfile = profileSnap.data() as UserProfile;
      const oldCampId = latestProfile.groupCampId || '';

      let oldCampRef = oldCampId ? doc(db, 'groupCamps', oldCampId) : null;
      let oldMemberRef = oldCampId
        ? doc(db, 'groupCamps', oldCampId, 'members', params.profile.uid)
        : null;

      const [oldCampSnap, oldMemberSnap] =
        oldCampRef && oldMemberRef
          ? await Promise.all([tx.get(oldCampRef), tx.get(oldMemberRef)])
          : [null, null];

      // Perform atomic transfer out of previous Group Camp if any
      if (oldCampRef && oldMemberRef && oldCampSnap?.exists() && oldMemberSnap?.exists()) {
        const oldCampData = oldCampSnap.data() as GroupCamp;
        tx.update(oldCampRef, {
          memberCount: Math.max(0, oldCampData.memberCount - 1),
          updatedAt: serverTimestamp(),
        });
        tx.delete(oldMemberRef);
      }

      tx.set(codeRef, {
        code,
        campId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const campPayload: Omit<GroupCamp, 'createdAt' | 'updatedAt'> = {
        id: campId,
        name: safeName,
        description: clampStr(params.description || '', GROUP_CAMP_LIMITS.CAMP_DESC_MAX),
        coverImageUrl: clampStr(params.coverImageUrl || '', GROUP_CAMP_LIMITS.COVER_URL_MAX),
        coverStoragePath: clampStr(params.coverStoragePath || '', 300),
        maxMembers,
        memberCount: 1,
        inviteCode: code,
        status: 'open',
        createdByUid: params.profile.uid,
      };

      tx.set(campRef, {
        ...campPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(memberRef, {
        uid: params.profile.uid,
        campId,
        displayName: clampStr(params.profile.displayName, FIELD_LIMITS.DISPLAY_NAME_MAX) || 'طالب / طالبة',
        avatarUrl: clampStr(params.profile.avatarUrl, FIELD_LIMITS.AVATAR_URL_MAX),
        totalScore: 0,
        examsTakenCount: 0,
        totalCorrectAnswers: 0,
        totalQuestionsAnswered: 0,
        completionPercent: 0,
        lastExamScore: 0,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(profileRef, {
        groupCampId: campId,
        updatedAt: serverTimestamp(),
      });

      return {
        ...campPayload,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } as GroupCamp;
    });

    return createdCamp;
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes('Missing or insufficient permissions') &&
      !error.message.includes('permission-denied')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, campPath);
  }
}

export async function leaveCurrentGroupCamp(params: {
  campId: string;
  uid: string;
}): Promise<void> {
  const path = `groupCamps/${params.campId}/members/${params.uid}`;
  try {
    await runTransaction(db, async (tx) => {
      const profileRef = doc(db, 'userProfiles', params.uid);
      const campRef = doc(db, 'groupCamps', params.campId);
      const memberRef = doc(db, 'groupCamps', params.campId, 'members', params.uid);

      const [profileSnap, campSnap, memberSnap] = await Promise.all([
        tx.get(profileRef),
        tx.get(campRef),
        tx.get(memberRef),
      ]);

      if (campSnap.exists() && memberSnap.exists()) {
        const campData = campSnap.data() as GroupCamp;
        tx.update(campRef, {
          memberCount: Math.max(0, campData.memberCount - 1),
          updatedAt: serverTimestamp(),
        });
        tx.delete(memberRef);
      }

      if (profileSnap.exists()) {
        tx.update(profileRef, {
          groupCampId: '',
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Atomic transfer from oldGroupCamp -> newGroupCamp:
 * Verifies the target camp invite code, open status, and <50 capacity FIRST inside the transaction
 * so if the join check fails for any reason, the student NEVER loses their previous camp membership.
 * Preserves user account, personal info, and all previous exam history, while initializing the new camp
 * leaderboard entry cleanly at 0.
 */
export async function switchGroupCampByCode(params: {
  oldCampId: string;
  rawNewCode: string;
  profile: UserProfile;
}): Promise<GroupCamp> {
  const code = params.rawNewCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
    throw new Error('شكل كود المعسكر الجديد مش صح.');
  }

  const invite = await lookupGroupInviteCode(code);
  if (!invite) {
    throw new Error('مفيش معسكر بالكود ده. فضلت / فضلتي في معسكرك الحالي بأمان.');
  }
  if (invite.campId === params.oldCampId) {
    throw new Error('أنت / أنتي أصلاً عضو في نفس المعسكر ده.');
  }

  const targetPath = `groupCamps/${invite.campId}`;
  try {
    const newCamp = await runTransaction(db, async (tx) => {
      const profileRef = doc(db, 'userProfiles', params.profile.uid);
      const oldCampRef = doc(db, 'groupCamps', params.oldCampId);
      const oldMemberRef = doc(db, 'groupCamps', params.oldCampId, 'members', params.profile.uid);
      const newCampRef = doc(db, 'groupCamps', invite.campId);
      const newMemberRef = doc(db, 'groupCamps', invite.campId, 'members', params.profile.uid);

      const [profileSnap, oldCampSnap, oldMemberSnap, newCampSnap, newMemberSnap] =
        await Promise.all([
          tx.get(profileRef),
          tx.get(oldCampRef),
          tx.get(oldMemberRef),
          tx.get(newCampRef),
          tx.get(newMemberRef),
        ]);

      if (!profileSnap.exists()) {
        throw new Error('البروفايل مش موجود.');
      }
      if (!newCampSnap.exists()) {
        throw new Error('المعسكر الجديد مش موجود. فضلت / فضلتي في معسكرك الحالي بأمان.');
      }

      const newCampData = newCampSnap.data() as GroupCamp;
      if (newCampData.status !== 'open') {
        throw new Error('المعسكر الجديد مقفول دلوقتي. فضلت / فضلتي في معسكرك الحالي بأمان.');
      }
      if (newCampData.memberCount >= newCampData.maxMembers || newCampData.memberCount >= 50) {
        throw new Error(
          `معلش، المعسكر الجديد مليان (${newCampData.maxMembers}/${newCampData.maxMembers}). فضلت / فضلتي في معسكرك الحالي بأمان.`
        );
      }
      if (newMemberSnap.exists()) {
        throw new Error('عندك عضوية قديمة في المعسكر الجديد.');
      }

      // All checks passed -> perform atomic switch
      if (oldCampSnap.exists() && oldMemberSnap.exists()) {
        const oldCampData = oldCampSnap.data() as GroupCamp;
        tx.update(oldCampRef, {
          memberCount: Math.max(0, oldCampData.memberCount - 1),
          updatedAt: serverTimestamp(),
        });
        tx.delete(oldMemberRef);
      }

      const nextCount = newCampData.memberCount + 1;
      tx.update(newCampRef, {
        memberCount: nextCount,
        updatedAt: serverTimestamp(),
      });

      tx.set(newMemberRef, {
        uid: params.profile.uid,
        campId: newCampData.id,
        displayName: clampStr(params.profile.displayName, FIELD_LIMITS.DISPLAY_NAME_MAX) || 'طالب / طالبة',
        avatarUrl: clampStr(params.profile.avatarUrl, FIELD_LIMITS.AVATAR_URL_MAX),
        totalScore: 0,
        examsTakenCount: 0,
        totalCorrectAnswers: 0,
        totalQuestionsAnswered: 0,
        completionPercent: 0,
        lastExamScore: 0,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(profileRef, {
        groupCampId: newCampData.id,
        updatedAt: serverTimestamp(),
      });

      return { ...newCampData, memberCount: nextCount };
    });

    return newCamp;
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes('Missing or insufficient permissions') &&
      !error.message.includes('permission-denied')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, targetPath);
  }
}

// ============================================================
// Paginated Queries & Student History
// ============================================================

export async function fetchGroupMembersPage(params: {
  campId: string;
  pageSize?: number;
  cursor?: DocumentSnapshot | null;
}): Promise<{
  members: GroupCampMember[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
}> {
  const pageSize = params.pageSize ?? GROUP_CAMP_LIMITS.MEMBERS_PAGE_SIZE;
  const path = `groupCamps/${params.campId}/members`;
  try {
    const baseQuery = params.cursor
      ? query(
          collection(db, 'groupCamps', params.campId, 'members'),
          orderBy('totalScore', 'desc'),
          startAfter(params.cursor),
          limit(pageSize + 1)
        )
      : query(
          collection(db, 'groupCamps', params.campId, 'members'),
          orderBy('totalScore', 'desc'),
          limit(pageSize + 1)
        );
    const snap = await getDocs(baseQuery);
    const hasMore = snap.docs.length > pageSize;
    const sliced = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    return {
      members: sliced.map((d) => d.data() as GroupCampMember),
      lastDoc: sliced.length > 0 ? sliced[sliced.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAllGroupCampMembers(campId: string): Promise<GroupCampMember[]> {
  const path = `groupCamps/${campId}/members`;
  try {
    const snap = await getDocs(
      query(collection(db, 'groupCamps', campId, 'members'), orderBy('totalScore', 'desc'), limit(50))
    );
    return snap.docs.map((d) => d.data() as GroupCampMember);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchGroupCampExams(params: {
  campId: string;
  includeDrafts?: boolean;
}): Promise<GroupExam[]> {
  const path = `groupCamps/${params.campId}/exams`;
  try {
    const q = params.includeDrafts
      ? query(collection(db, 'groupCamps', params.campId, 'exams'), orderBy('startsAtMs', 'desc'), limit(60))
      : query(
          collection(db, 'groupCamps', params.campId, 'exams'),
          where('status', '==', 'published'),
          limit(60)
        );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as GroupExam);
    return list.sort((a, b) => b.startsAtMs - a.startsAtMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchExamQuestions(
  campId: string,
  examId: string
): Promise<GroupExamQuestion[]> {
  const path = `groupCamps/${campId}/exams/${examId}/questions`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'groupCamps', campId, 'exams', examId, 'questions'),
        orderBy('order', 'asc'),
        limit(GROUP_CAMP_LIMITS.MAX_QUESTIONS_PER_EXAM)
      )
    );
    return snap.docs.map((d) => d.data() as GroupExamQuestion);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchStudentExamAttempts(params: {
  campId: string;
  examId: string;
  uid: string;
}): Promise<GroupExamAttempt[]> {
  const path = `groupCamps/${params.campId}/exams/${params.examId}/attempts`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'groupCamps', params.campId, 'exams', params.examId, 'attempts'),
        where('uid', '==', params.uid),
        limit(GROUP_CAMP_LIMITS.MAX_ATTEMPTS_PER_EXAM + 2)
      )
    );
    return snap.docs
      .map((d) => d.data() as GroupExamAttempt)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchStudentExamHistory(
  uid: string,
  maxItems = 30
): Promise<StudentExamHistoryEntry[]> {
  const path = `userProfiles/${uid}/examHistory`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'userProfiles', uid, 'examHistory'),
        orderBy('submittedAtMs', 'desc'),
        limit(maxItems)
      )
    );
    return snap.docs.map((d) => d.data() as StudentExamHistoryEntry);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ============================================================
// Student Exam Runner: Server Time Sync, Start, Auto-Save, Submit
// ============================================================

/**
 * Uses Firestore serverTimestamp() + getDocFromServer() on the active attempt
 * so changing the student's device clock or reloading cannot extend exam time.
 */
export async function syncServerNowMs(params: {
  campId: string;
  examId: string;
  attemptId: string;
}): Promise<number> {
  const ref = doc(
    db,
    'groupCamps',
    params.campId,
    'exams',
    params.examId,
    'attempts',
    params.attemptId
  );
  try {
    await updateDoc(ref, { updatedAt: serverTimestamp() });
    const serverSnap = await getDocFromServer(ref);
    const ts = serverSnap.data()?.updatedAt as Timestamp | undefined;
    return ts ? ts.toMillis() : Date.now();
  } catch {
    try {
      const serverSnap = await getDocFromServer(ref);
      const data = serverSnap.data() as GroupExamAttempt | undefined;
      const startedMs = data?.startedAt?.toMillis
        ? data.startedAt.toMillis()
        : data?.startedAtMs || 0;
      const deadlineMs = data?.deadlineAtMs || 0;
      return Math.max(Date.now(), startedMs, deadlineMs > 0 ? deadlineMs + 1000 : 0);
    } catch {
      return Date.now();
    }
  }
}

export async function startOrResumeExamAttempt(params: {
  camp: GroupCamp;
  exam: GroupExam;
  questions: GroupExamQuestion[];
  profile: UserProfile;
  publishedExamsCount: number;
}): Promise<{ attempt: GroupExamAttempt; serverNowMs: number }> {
  const { camp, exam, questions, profile, publishedExamsCount } = params;
  const existingAttempts = await fetchStudentExamAttempts({
    campId: camp.id,
    examId: exam.id,
    uid: profile.uid,
  });

  // Check if there is an existing in_progress attempt whose server time might already have expired
  const pendingInProgress = existingAttempts.find((a) => a.status === 'in_progress');
  if (pendingInProgress) {
    const serverNowMs = await syncServerNowMs({
      campId: camp.id,
      examId: exam.id,
      attemptId: pendingInProgress.id,
    });
    const startedMs = pendingInProgress.startedAt?.toMillis
      ? pendingInProgress.startedAt.toMillis()
      : pendingInProgress.startedAtMs;
    const deadlineAtMs = computeExamDeadlineMs(startedMs, exam.durationMinutes, exam.endsAtMs);

    if (serverNowMs <= deadlineAtMs) {
      return {
        attempt: {
          ...pendingInProgress,
          startedAtMs: startedMs,
          deadlineAtMs,
        },
        serverNowMs,
      };
    }

    // Time ran out while student was offline/away -> auto-submit & grade preserved answers
    await submitAndGradeExamAttempt({
      camp,
      exam,
      questions,
      attempt: { ...pendingInProgress, startedAtMs: startedMs, deadlineAtMs },
      answers: pendingInProgress.answers || {},
      status: 'timed_out',
      publishedExamsCount,
    });

    const refreshed = await fetchStudentExamAttempts({
      campId: camp.id,
      examId: exam.id,
      uid: profile.uid,
    });
    const decisionAfterTimeout = canStudentStartAttempt(exam, refreshed, serverNowMs);
    if (!decisionAfterTimeout.allowed) {
      throw new Error(
        'وقت محاولتك اللي فاتت خلص والنت كان قاطع، واتسلّمت إجاباتك المحفوظة لوحدها.'
      );
    }
    return createFreshAttempt({
      camp,
      exam,
      questions,
      profile,
      attemptNumber: decisionAfterTimeout.nextAttemptNumber,
    });
  }

  const decision = canStudentStartAttempt(exam, existingAttempts, Date.now());
  if (!decision.allowed) {
    throw new Error(decision.reason || 'مش متاح تبدأ / تبدأي الامتحان دلوقتي.');
  }

  return createFreshAttempt({
    camp,
    exam,
    questions,
    profile,
    attemptNumber: decision.nextAttemptNumber,
  });
}

async function createFreshAttempt(params: {
  camp: GroupCamp;
  exam: GroupExam;
  questions: GroupExamQuestion[];
  profile: UserProfile;
  attemptNumber: number;
}): Promise<{ attempt: GroupExamAttempt; serverNowMs: number }> {
  const { camp, exam, questions, profile, attemptNumber } = params;
  const attemptId = `${profile.uid}_${attemptNumber}`;
  const attemptRef = doc(
    db,
    'groupCamps',
    camp.id,
    'exams',
    exam.id,
    'attempts',
    attemptId
  );
  const examRef = doc(db, 'groupCamps', camp.id, 'exams', exam.id);
  const nowFallback = Date.now();
  const initialDeadline = computeExamDeadlineMs(nowFallback, exam.durationMinutes, exam.endsAtMs);
  const maxScore = questions.reduce((sum, q) => sum + (q.score || 1), 0);

  const path = `groupCamps/${camp.id}/exams/${exam.id}/attempts/${attemptId}`;
  try {
    await runTransaction(db, async (tx) => {
      const [examSnap, attemptSnap] = await Promise.all([tx.get(examRef), tx.get(attemptRef)]);
      if (!examSnap.exists()) {
        throw new Error('الامتحان ده مش موجود.');
      }
      if (attemptSnap.exists()) {
        throw new Error('المحاولة دي متسجلة قبل كده.');
      }
      const examData = examSnap.data() as GroupExam;
      tx.set(attemptRef, {
        id: attemptId,
        campId: camp.id,
        examId: exam.id,
        uid: profile.uid,
        studentName: clampStr(profile.displayName, FIELD_LIMITS.DISPLAY_NAME_MAX) || 'طالب / طالبة',
        studentAvatar: clampStr(profile.avatarUrl, FIELD_LIMITS.AVATAR_URL_MAX),
        attemptNumber,
        status: 'in_progress',
        answers: {},
        startedAt: serverTimestamp(),
        startedAtMs: nowFallback,
        deadlineAtMs: initialDeadline,
        submittedAtMs: 0,
        score: 0,
        maxScore,
        percentage: 0,
        correctCount: 0,
        totalQuestions: questions.length,
        graded: false,
        adminApproved: true,
        updatedAt: serverTimestamp(),
      });
      tx.update(examRef, {
        attemptsStartedCount: (examData.attemptsStartedCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
    });

    // Anchor exact server start timestamp from Firestore
    const serverSnap = await getDocFromServer(attemptRef);
    const serverData = serverSnap.data() as GroupExamAttempt;
    const serverStartedMs = serverData.startedAt?.toMillis
      ? serverData.startedAt.toMillis()
      : Date.now();
    const exactDeadlineMs = computeExamDeadlineMs(
      serverStartedMs,
      exam.durationMinutes,
      exam.endsAtMs
    );

    await updateDoc(attemptRef, {
      startedAtMs: serverStartedMs,
      deadlineAtMs: exactDeadlineMs,
      updatedAt: serverTimestamp(),
    });

    return {
      attempt: {
        ...serverData,
        startedAtMs: serverStartedMs,
        deadlineAtMs: exactDeadlineMs,
      },
      serverNowMs: serverStartedMs,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes('Missing or insufficient permissions') &&
      !error.message.includes('permission-denied')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function autoSaveAttemptAnswers(params: {
  campId: string;
  examId: string;
  attemptId: string;
  answers: Record<string, number>;
}): Promise<void> {
  const path = `groupCamps/${params.campId}/exams/${params.examId}/attempts/${params.attemptId}`;
  try {
    await updateDoc(
      doc(db, 'groupCamps', params.campId, 'exams', params.examId, 'attempts', params.attemptId),
      {
        answers: params.answers,
        updatedAt: serverTimestamp(),
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitAndGradeExamAttempt(params: {
  camp: GroupCamp;
  exam: GroupExam;
  questions: GroupExamQuestion[];
  attempt: GroupExamAttempt;
  answers: Record<string, number>;
  status: Extract<GroupAttemptStatus, 'submitted' | 'timed_out'>;
  publishedExamsCount: number;
}): Promise<GroupExamAttempt> {
  const { camp, exam, questions, attempt, answers, status, publishedExamsCount } = params;
  const attemptRef = doc(
    db,
    'groupCamps',
    camp.id,
    'exams',
    exam.id,
    'attempts',
    attempt.id
  );
  const path = `groupCamps/${camp.id}/exams/${exam.id}/attempts/${attempt.id}`;

  try {
    // Idempotency guard: if this attempt was already submitted/timed_out (e.g. double submit or another tab),
    // return the persisted finished attempt instead of hitting a permission error on re-update.
    const currentSnap = await getDocFromServer(attemptRef);
    let effectiveAnswers = answers;
    if (currentSnap.exists()) {
      const currentData = currentSnap.data() as GroupExamAttempt;
      if (currentData.status !== 'in_progress') {
        return currentData;
      }
      if (status === 'timed_out') {
        const startedMs = currentData.startedAt?.toMillis
          ? currentData.startedAt.toMillis()
          : currentData.startedAtMs;
        const graceLimitMs = startedMs + exam.durationMinutes * 60000 + 25000;
        // If grace window is close or exceeded, align answers with Firestore's persisted answers
        // so the Firestore rule (incoming().answers == existing().answers) passes reliably.
        if (Date.now() > graceLimitMs && currentData.answers) {
          effectiveAnswers = currentData.answers;
        }
      }
    }

    const graded = gradeObjectiveExam(questions, effectiveAnswers);
    const submittedAtMs = Date.now();

    try {
      await updateDoc(attemptRef, {
        status,
        answers: effectiveAnswers,
        submittedAt: serverTimestamp(),
        submittedAtMs,
        score: graded.score,
        maxScore: graded.maxScore,
        percentage: graded.percentage,
        correctCount: Math.round(graded.correctCount),
        totalQuestions: Math.round(graded.totalQuestions),
        graded: true,
        adminApproved: true,
        updatedAt: serverTimestamp(),
      });
    } catch (updateErr) {
      // Fallback for timed_out when last-second autoSave hadn't persisted before +30s rule cutoff
      if (status === 'timed_out') {
        const retrySnap = await getDocFromServer(attemptRef);
        if (retrySnap.exists()) {
          const retryData = retrySnap.data() as GroupExamAttempt;
          if (retryData.status !== 'in_progress') {
            return retryData;
          }
          const persistedAnswers = retryData.answers || {};
          const fallbackGraded = gradeObjectiveExam(questions, persistedAnswers);
          await updateDoc(attemptRef, {
            status: 'timed_out',
            answers: persistedAnswers,
            submittedAt: serverTimestamp(),
            submittedAtMs,
            score: fallbackGraded.score,
            maxScore: fallbackGraded.maxScore,
            percentage: fallbackGraded.percentage,
            correctCount: Math.round(fallbackGraded.correctCount),
            totalQuestions: Math.round(fallbackGraded.totalQuestions),
            graded: true,
            adminApproved: true,
            updatedAt: serverTimestamp(),
          });
          effectiveAnswers = persistedAnswers;
        } else {
          throw updateErr;
        }
      } else {
        throw updateErr;
      }
    }

    const finalGraded = gradeObjectiveExam(questions, effectiveAnswers);

    // Save deterministic immutable copy to student's permanent cross-camp history
    const historyId = `${exam.id}_att_${attempt.attemptNumber}`;
    const historyRef = doc(db, 'userProfiles', attempt.uid, 'examHistory', historyId);
    const existingHistorySnap = await getDoc(historyRef);
    if (!existingHistorySnap.exists()) {
      await setDoc(historyRef, {
        id: historyId,
        uid: attempt.uid,
        campId: camp.id,
        campName: clampStr(camp.name, GROUP_CAMP_LIMITS.CAMP_NAME_MAX) || 'معسكر جماعي',
        examId: exam.id,
        examTitle: clampStr(exam.title, GROUP_CAMP_LIMITS.EXAM_TITLE_MAX) || 'امتحان',
        subject: clampStr(exam.subject, GROUP_CAMP_LIMITS.EXAM_SUBJECT_MAX) || 'عام',
        attemptNumber: attempt.attemptNumber,
        status,
        score: finalGraded.score,
        maxScore: finalGraded.maxScore,
        percentage: finalGraded.percentage,
        correctCount: Math.round(finalGraded.correctCount),
        totalQuestions: Math.round(finalGraded.totalQuestions),
        resultsReleaseAtMs: Math.round(exam.resultsReleaseAtMs || 0),
        submittedAtMs,
        createdAt: serverTimestamp(),
      });
    }

    // Recompute student's leaderboard stats strictly within THIS camp using best score per exam
    const exams = await fetchGroupCampExams({ campId: camp.id, includeDrafts: false });
    const allFinishedForCamp: GroupExamAttempt[] = [];
    for (const ex of exams) {
      const attSnap = await getDocs(
        query(
          collection(db, 'groupCamps', camp.id, 'exams', ex.id, 'attempts'),
          where('uid', '==', attempt.uid),
          limit(GROUP_CAMP_LIMITS.MAX_ATTEMPTS_PER_EXAM + 2)
        )
      );
      for (const d of attSnap.docs) {
        const a = d.data() as GroupExamAttempt;
        if (a.status !== 'in_progress') {
          allFinishedForCamp.push(a);
        }
      }
    }

    const memberTotals = computeMemberTotalsFromAttempts({
      finishedAttempts: allFinishedForCamp,
      publishedExamsCount: Math.max(publishedExamsCount, exams.length),
      latestExamScore: finalGraded.score,
    });

    const memberRef = doc(db, 'groupCamps', camp.id, 'members', attempt.uid);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) {
      const existingMember = memberSnap.data() as GroupCampMember;
      const prevExamsCount = Math.round(Number(existingMember.examsTakenCount) || 0);
      const safeExamsTakenCount = Math.min(
        prevExamsCount + 1,
        Math.max(prevExamsCount, Math.round(memberTotals.examsTakenCount))
      );
      await updateDoc(memberRef, {
        totalScore: memberTotals.totalScore,
        examsTakenCount: safeExamsTakenCount,
        totalCorrectAnswers: Math.round(memberTotals.totalCorrectAnswers),
        totalQuestionsAnswered: Math.round(memberTotals.totalQuestionsAnswered),
        completionPercent: memberTotals.completionPercent,
        lastExamScore: memberTotals.lastExamScore,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      ...attempt,
      status,
      answers: effectiveAnswers,
      submittedAtMs,
      score: finalGraded.score,
      maxScore: finalGraded.maxScore,
      percentage: finalGraded.percentage,
      correctCount: finalGraded.correctCount,
      totalQuestions: finalGraded.totalQuestions,
      graded: true,
      adminApproved: true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================
// Admin Management Functions (Protected by isAdmin() in Rules)
// ============================================================

export async function adminFetchAllGroupCamps(): Promise<GroupCamp[]> {
  const path = 'groupCamps';
  try {
    const snap = await getDocs(
      query(collection(db, 'groupCamps'), orderBy('createdAt', 'desc'), limit(50))
    );
    return snap.docs.map((d) => d.data() as GroupCamp);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminCreateGroupCamp(params: {
  adminUid: string;
  name: string;
  description: string;
  coverImageUrl: string;
  coverStoragePath: string;
  maxMembers: number;
  inviteCode?: string;
  status?: GroupCampStatus;
}): Promise<GroupCamp> {
  const campId = generateSafeId('gcamp');
  const code = (params.inviteCode?.trim().toUpperCase() || generateGroupInviteCode()).replace(
    /[^A-Z0-9-]/g,
    ''
  );
  if (code.length < 4 || code.length > 20) {
    throw new Error('كود الدعوة لازم يكون من 4 لـ 20 حرف (إنجليزي وأرقام بس).');
  }
  const safeName = clampStr(params.name, GROUP_CAMP_LIMITS.CAMP_NAME_MAX);
  if (safeName.length < GROUP_CAMP_LIMITS.CAMP_NAME_MIN) {
    throw new Error('اسم المعسكر لازم يكون حرفين على الأقل.');
  }
  const maxMembers = Math.min(50, Math.max(1, Math.round(params.maxMembers || 50)));

  const existingCode = await getDoc(doc(db, 'groupInviteCodes', code));
  if (existingCode.exists()) {
    throw new Error('كود الدعوة ده مستخدم في معسكر تاني. اختار كود غيره.');
  }

  const path = `groupCamps/${campId}`;
  try {
    const batch = writeBatch(db);
    const campRef = doc(db, 'groupCamps', campId);
    const codeRef = doc(db, 'groupInviteCodes', code);

    const campDocPayload = {
      id: campId,
      name: safeName,
      description: clampStr(params.description, GROUP_CAMP_LIMITS.CAMP_DESC_MAX),
      coverImageUrl: clampStr(params.coverImageUrl, GROUP_CAMP_LIMITS.COVER_URL_MAX),
      coverStoragePath: clampStr(params.coverStoragePath, 300),
      maxMembers,
      memberCount: 0,
      inviteCode: code,
      status: params.status || 'open',
      createdByUid: params.adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(campRef, campDocPayload);
    batch.set(codeRef, {
      code,
      campId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    const saved = await getDoc(campRef);
    return saved.data() as GroupCamp;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminUpdateGroupCamp(params: {
  campId: string;
  name: string;
  description: string;
  coverImageUrl: string;
  coverStoragePath: string;
  maxMembers: number;
  status: GroupCampStatus;
  currentMemberCount: number;
}): Promise<void> {
  const path = `groupCamps/${params.campId}`;
  const safeMax = Math.min(
    50,
    Math.max(Math.max(1, params.currentMemberCount), Math.round(params.maxMembers))
  );
  try {
    await updateDoc(doc(db, 'groupCamps', params.campId), {
      name: clampStr(params.name, GROUP_CAMP_LIMITS.CAMP_NAME_MAX),
      description: clampStr(params.description, GROUP_CAMP_LIMITS.CAMP_DESC_MAX),
      coverImageUrl: clampStr(params.coverImageUrl, GROUP_CAMP_LIMITS.COVER_URL_MAX),
      coverStoragePath: clampStr(params.coverStoragePath, 300),
      maxMembers: safeMax,
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminDeleteGroupCamp(camp: GroupCamp): Promise<void> {
  const path = `groupCamps/${camp.id}`;
  try {
    // Enforce safe deletion controls: do not delete an occupied camp without closing/removing members or handle cleanly
    if (camp.memberCount > 0) {
      throw new Error(
        'مينفعش تمسح معسكر لسه فيه شباب وبنات نشطين. اقفله الأول أو استنى لحد ما يسيبوه.'
      );
    }
    const exams = await fetchGroupCampExams({ campId: camp.id, includeDrafts: true });
    if (exams.some((e) => e.attemptsStartedCount > 0)) {
      throw new Error(
        'مينفعش تمسح معسكر فيه امتحانات الطلاب بدأوا يحلوا فيها عشان نحفظ سجلاتهم. تقدر تقفله بدل المسح.'
      );
    }

    const batch = writeBatch(db);
    for (const ex of exams) {
      const qs = await fetchExamQuestions(camp.id, ex.id);
      for (const q of qs) {
        if (q.imageStoragePath) {
          await deleteStoredGroupImage(q.imageStoragePath);
        }
        batch.delete(doc(db, 'groupCamps', camp.id, 'exams', ex.id, 'questions', q.id));
      }
      batch.delete(doc(db, 'groupCamps', camp.id, 'exams', ex.id));
    }

    if (camp.coverStoragePath) {
      await deleteStoredGroupImage(camp.coverStoragePath);
    }
    batch.delete(doc(db, 'groupInviteCodes', camp.inviteCode));
    batch.delete(doc(db, 'groupCamps', camp.id));
    await batch.commit();
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.includes('Missing or insufficient permissions') &&
      !error.message.includes('permission-denied')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface GroupExamSaveInput {
  examId?: string;
  campId: string;
  adminUid: string;
  title: string;
  subject: string;
  unit: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  startsAtMs: number;
  endsAtMs: number;
  maxAttempts: number;
  resultsReleaseAtMs: number;
  allowReviewAfterSubmit: boolean;
  status: GroupExamPublishStatus;
  questions: Omit<GroupExamQuestion, 'examId' | 'campId' | 'createdAt' | 'updatedAt'>[];
}

export async function adminSaveGroupExam(input: GroupExamSaveInput): Promise<GroupExam> {
  const safeTitle = clampStr(input.title, GROUP_CAMP_LIMITS.EXAM_TITLE_MAX);
  if (safeTitle.length < GROUP_CAMP_LIMITS.EXAM_TITLE_MIN) {
    throw new Error('اكتب اسم واضح للامتحان.');
  }
  if (input.endsAtMs <= input.startsAtMs) {
    throw new Error('ميعاد نهاية الامتحان لازم يكون بعد ميعاد البداية.');
  }
  if (input.questions.length === 0) {
    throw new Error('لازم تضيف سؤال واحد على الأقل قبل ما تحفظ الامتحان.');
  }

  const examId = input.examId || generateSafeId('gexam');
  const totalScore = input.questions.reduce((acc, q) => acc + Math.max(0.25, Number(q.score) || 1), 0);
  const path = `groupCamps/${input.campId}/exams/${examId}`;

  try {
    const examRef = doc(db, 'groupCamps', input.campId, 'exams', examId);
    const existingExamSnap = input.examId ? await getDoc(examRef) : null;
    const existingQuestions = input.examId ? await fetchExamQuestions(input.campId, examId) : [];

    const batch = writeBatch(db);
    if (existingExamSnap && existingExamSnap.exists()) {
      batch.update(examRef, {
        title: safeTitle,
        subject: clampStr(input.subject || 'عام', GROUP_CAMP_LIMITS.EXAM_SUBJECT_MAX),
        unit: clampStr(input.unit || '', GROUP_CAMP_LIMITS.EXAM_UNIT_MAX),
        description: clampStr(input.description || '', GROUP_CAMP_LIMITS.EXAM_DESC_MAX),
        instructions: clampStr(input.instructions || '', GROUP_CAMP_LIMITS.EXAM_INSTRUCTIONS_MAX),
        durationMinutes: Math.min(
          GROUP_CAMP_LIMITS.MAX_DURATION_MINUTES,
          Math.max(1, Math.round(input.durationMinutes))
        ),
        totalScore: Math.round(totalScore * 100) / 100,
        questionsCount: input.questions.length,
        startsAtMs: Math.round(input.startsAtMs),
        endsAtMs: Math.round(input.endsAtMs),
        maxAttempts: Math.min(
          GROUP_CAMP_LIMITS.MAX_ATTEMPTS_PER_EXAM,
          Math.max(1, Math.round(input.maxAttempts))
        ),
        resultsReleaseAtMs: Math.round(input.resultsReleaseAtMs),
        allowReviewAfterSubmit: Boolean(input.allowReviewAfterSubmit),
        status: input.status,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(examRef, {
        id: examId,
        campId: input.campId,
        title: safeTitle,
        subject: clampStr(input.subject || 'عام', GROUP_CAMP_LIMITS.EXAM_SUBJECT_MAX),
        unit: clampStr(input.unit || '', GROUP_CAMP_LIMITS.EXAM_UNIT_MAX),
        description: clampStr(input.description || '', GROUP_CAMP_LIMITS.EXAM_DESC_MAX),
        instructions: clampStr(input.instructions || '', GROUP_CAMP_LIMITS.EXAM_INSTRUCTIONS_MAX),
        durationMinutes: Math.min(
          GROUP_CAMP_LIMITS.MAX_DURATION_MINUTES,
          Math.max(1, Math.round(input.durationMinutes))
        ),
        totalScore: Math.round(totalScore * 100) / 100,
        questionsCount: input.questions.length,
        startsAtMs: Math.round(input.startsAtMs),
        endsAtMs: Math.round(input.endsAtMs),
        maxAttempts: Math.min(
          GROUP_CAMP_LIMITS.MAX_ATTEMPTS_PER_EXAM,
          Math.max(1, Math.round(input.maxAttempts))
        ),
        resultsReleaseAtMs: Math.round(input.resultsReleaseAtMs),
        allowReviewAfterSubmit: Boolean(input.allowReviewAfterSubmit),
        status: input.status,
        attemptsStartedCount: 0,
        createdByUid: input.adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const incomingIds = new Set(input.questions.map((q) => q.id));
    for (const oldQ of existingQuestions) {
      if (!incomingIds.has(oldQ.id)) {
        if (oldQ.imageStoragePath) {
          await deleteStoredGroupImage(oldQ.imageStoragePath);
        }
        batch.delete(doc(db, 'groupCamps', input.campId, 'exams', examId, 'questions', oldQ.id));
      }
    }

    input.questions.forEach((q, idx) => {
      const qRef = doc(db, 'groupCamps', input.campId, 'exams', examId, 'questions', q.id);
      const existsAlready = existingQuestions.some((eq) => eq.id === q.id);
      const safeOptions = q.options.slice(0, 6).map((o) => clampStr(o, GROUP_CAMP_LIMITS.QUESTION_OPTION_MAX) || 'اختيار');
      const payload = {
        id: q.id,
        examId,
        campId: input.campId,
        order: idx,
        type: q.type,
        promptText: clampStr(q.promptText, GROUP_CAMP_LIMITS.QUESTION_PROMPT_MAX),
        imageUrl: clampStr(q.imageUrl || '', GROUP_CAMP_LIMITS.QUESTION_IMAGE_URL_MAX),
        imageStoragePath: clampStr(q.imageStoragePath || '', 300),
        options: safeOptions,
        correctOptionIndex: Math.min(
          safeOptions.length - 1,
          Math.max(0, Math.round(q.correctOptionIndex))
        ),
        score: Math.max(0.25, Math.min(1000, Number(q.score) || 1)),
        explanation: clampStr(q.explanation || '', GROUP_CAMP_LIMITS.QUESTION_EXPLANATION_MAX),
        updatedAt: serverTimestamp(),
      };
      if (existsAlready) {
        const old = existingQuestions.find((eq) => eq.id === q.id)!;
        batch.set(qRef, {
          ...payload,
          createdAt: old.createdAt || serverTimestamp(),
        });
      } else {
        batch.set(qRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
    });

    await batch.commit();
    const saved = await getDoc(examRef);
    return saved.data() as GroupExam;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminDeleteGroupExam(exam: GroupExam): Promise<void> {
  if (exam.attemptsStartedCount > 0) {
    throw new Error('مينفعش تمسح امتحان الطلاب بدأوا يحلوا فيه بالفعل.');
  }
  const path = `groupCamps/${exam.campId}/exams/${exam.id}`;
  try {
    const qs = await fetchExamQuestions(exam.campId, exam.id);
    const batch = writeBatch(db);
    for (const q of qs) {
      if (q.imageStoragePath) {
        await deleteStoredGroupImage(q.imageStoragePath);
      }
      batch.delete(doc(db, 'groupCamps', exam.campId, 'exams', exam.id, 'questions', q.id));
    }
    batch.delete(doc(db, 'groupCamps', exam.campId, 'exams', exam.id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminFetchExamAttempts(
  campId: string,
  examId: string
): Promise<GroupExamAttempt[]> {
  const path = `groupCamps/${campId}/exams/${examId}/attempts`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'groupCamps', campId, 'exams', examId, 'attempts'),
        orderBy('updatedAt', 'desc'),
        limit(120)
      )
    );
    return snap.docs.map((d) => d.data() as GroupExamAttempt);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminToggleAttemptApproval(params: {
  campId: string;
  examId: string;
  attemptId: string;
  approved: boolean;
}): Promise<void> {
  const path = `groupCamps/${params.campId}/exams/${params.examId}/attempts/${params.attemptId}`;
  try {
    await updateDoc(
      doc(db, 'groupCamps', params.campId, 'exams', params.examId, 'attempts', params.attemptId),
      {
        adminApproved: params.approved,
        updatedAt: serverTimestamp(),
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================
// Group Camp Little Questions (سؤال صغنن — shared inside Group Camp)
// ============================================================

export async function sendGroupLittleQuestion(params: {
  camp: GroupCamp;
  senderUid: string;
  senderName: string;
  senderAvatar: string;
  crystalStyle: CrystalQuestionStyle;
  content: string;
  imageUrl: string;
  parentQuestionId?: string;
}): Promise<string> {
  const {
    camp,
    senderUid,
    senderName,
    senderAvatar,
    crystalStyle,
    content,
    imageUrl,
    parentQuestionId,
  } = params;
  const questionId = generateSafeId('glq');
  const path = `groupCamps/${camp.id}/littleQuestions/${questionId}`;
  const safeParentId = parentQuestionId ? clampStr(parentQuestionId, 128) : '';
  const safeContent = clampStr(content, FIELD_LIMITS.MESSAGE_CONTENT_MAX);
  const safeImage = clampStr(imageUrl, FIELD_LIMITS.QUESTION_IMAGE_URL_MAX);

  if (!safeContent && !safeImage) {
    throw new Error('اكتب / اكتبي سؤال أو ارفع / ارفعي صورة الأول.');
  }

  try {
    await setDoc(doc(db, 'groupCamps', camp.id, 'littleQuestions', questionId), {
      id: questionId,
      campId: camp.id,
      senderUid,
      senderName: clampStr(senderName, FIELD_LIMITS.DISPLAY_NAME_MAX) || 'طالب / طالبة',
      senderAvatar: clampStr(senderAvatar, FIELD_LIMITS.AVATAR_URL_MAX),
      crystalStyle,
      content: safeContent,
      imageUrl: safeImage,
      parentQuestionId: safeParentId,
      partnerReaction: '',
      reactions: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return questionId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleGroupLittleQuestionReaction(params: {
  campId: string;
  questionId: string;
  uid: string;
  emoji: string;
}): Promise<void> {
  const path = `groupCamps/${params.campId}/littleQuestions/${params.questionId}`;
  const qRef = doc(db, 'groupCamps', params.campId, 'littleQuestions', params.questionId);
  const cleanedEmoji = clampStr(params.emoji, FIELD_LIMITS.REACTION_MAX);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(qRef);
      if (!snap.exists()) return;
      const current = (snap.data().reactions || {}) as Record<string, string>;
      const next: Record<string, string> = { ...current };
      if (!cleanedEmoji || next[params.uid] === cleanedEmoji) {
        delete next[params.uid];
      } else {
        next[params.uid] = cleanedEmoji;
      }
      tx.update(qRef, {
        reactions: next,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteGroupLittleQuestion(
  campId: string,
  questionId: string,
  replyIdsToDelete: string[] = []
): Promise<void> {
  const path = `groupCamps/${campId}/littleQuestions/${questionId}`;
  try {
    if (replyIdsToDelete.length > 0) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'groupCamps', campId, 'littleQuestions', questionId));
      for (const replyId of replyIdsToDelete.slice(0, 40)) {
        batch.delete(doc(db, 'groupCamps', campId, 'littleQuestions', replyId));
      }
      await batch.commit();
    } else {
      await deleteDoc(doc(db, 'groupCamps', campId, 'littleQuestions', questionId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function registerGroupExamPublisher(params: {
  campId: string;
  uid: string;
  accessProof: string;
}): Promise<void> {
  const path = `groupCamps/${params.campId}/examPublishers/${params.uid}`;
  const ref = doc(db, 'groupCamps', params.campId, 'examPublishers', params.uid);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        accessProof: params.accessProof,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid: params.uid,
        campId: params.campId,
        accessProof: params.accessProof,
        grantedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
