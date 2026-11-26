import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { FIELD_LIMITS, SUBJECT_CONFIG, TASK_TYPE_CONFIG } from '../constants/campConfig';
import { trackPomodoroCompleted, trackSurpriseSent } from '../lib/analytics';
import { generateInviteCode, generateSafeId } from '../lib/campUtils';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  isValidEgyptianMobile,
  resolveStudentPhoneE164FromAuth,
  toLocalEgyptianPhone,
  toPhoneDigitsKey,
} from '../lib/phoneAuthUtils';
import { leaveCurrentGroupCamp } from './groupCampService';
import {
  Camp,
  CampNotification,
  CampTask,
  CrystalQuestionStyle,
  InviteCodeDoc,
  MessageTypeKey,
  NotificationPreferences,
  NotificationTypeKey,
  StudySubjectKey,
  SubjectKey,
  SurpriseKind,
  TaskTypeKey,
  UserProfile,
} from '../types/camp';

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `userProfiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'userProfiles', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function upsertUserProfile(params: {
  uid: string;
  displayName: string;
  avatarUrl: string;
  campId?: string;
  email?: string;
  phone?: string;
  groupCampId?: string;
  existingProfile?: UserProfile | null;
  activeCamp?: Camp | null;
}): Promise<void> {
  const { uid, displayName, avatarUrl, campId, email, phone, groupCampId, existingProfile, activeCamp } = params;
  const safeName = clampStr(displayName, FIELD_LIMITS.DISPLAY_NAME_MAX) || 'طالب / طالبة';
  const safeAvatar = clampStr(avatarUrl, FIELD_LIMITS.AVATAR_URL_MAX);
  const safeEmail = email !== undefined ? clampStr(email, 120) : existingProfile?.email || '';
  const safePhone = phone !== undefined ? clampStr(phone, 20) : existingProfile?.phone || '';
  const safeGroupCampId =
    groupCampId !== undefined ? clampStr(groupCampId, 128) : existingProfile?.groupCampId || '';
  const path = `userProfiles/${uid}`;

  try {
    const batch = writeBatch(db);
    const profileRef = doc(db, 'userProfiles', uid);

    if (existingProfile) {
      batch.update(profileRef, {
        displayName: safeName,
        avatarUrl: safeAvatar,
        campId: campId !== undefined ? clampStr(campId, 128) : existingProfile.campId,
        email: safeEmail,
        phone: safePhone,
        groupCampId: safeGroupCampId,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(profileRef, {
        uid,
        displayName: safeName,
        avatarUrl: safeAvatar,
        campId: campId ? clampStr(campId, 128) : '',
        email: safeEmail,
        phone: safePhone,
        groupCampId: safeGroupCampId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (activeCamp) {
      const campRef = doc(db, 'camps', activeCamp.id);
      if (activeCamp.member1Uid === uid) {
        batch.update(campRef, {
          member1Name: safeName,
          member1Avatar: safeAvatar,
          updatedAt: serverTimestamp(),
        });
      } else if (activeCamp.member2Uid === uid) {
        batch.update(campRef, {
          member2Name: safeName,
          member2Avatar: safeAvatar,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createCamp(params: {
  ownerProfile: UserProfile;
  campName: string;
  startDate: string;
}): Promise<{ campId: string; inviteCode: string }> {
  const { ownerProfile, campName, startDate } = params;
  const safeCampName = clampStr(campName, FIELD_LIMITS.CAMP_NAME_MAX);
  if (safeCampName.length < FIELD_LIMITS.CAMP_NAME_MIN) {
    throw new Error('اسم المعسكر لازم يكون حرفين على الأقل.');
  }

  const campId = generateSafeId('camp');
  const inviteCode = generateInviteCode();
  const path = `camps/${campId}`;

  try {
    const batch = writeBatch(db);
    const campRef = doc(db, 'camps', campId);
    const inviteRef = doc(db, 'inviteCodes', inviteCode);
    const profileRef = doc(db, 'userProfiles', ownerProfile.uid);

    batch.set(campRef, {
      id: campId,
      name: safeCampName,
      inviteCode,
      ownerUid: ownerProfile.uid,
      member1Uid: ownerProfile.uid,
      member1Name: clampStr(ownerProfile.displayName, FIELD_LIMITS.DISPLAY_NAME_MAX),
      member1Avatar: clampStr(ownerProfile.avatarUrl, FIELD_LIMITS.AVATAR_URL_MAX),
      member1LastActivity: 'عمل / عملت المعسكر وبدأ التجهيز للمهام',
      member1LastActiveAt: serverTimestamp(),
      member1StudyMinutes: 0,
      member2Uid: '',
      member2Name: '',
      member2Avatar: '',
      member2LastActivity: '',
      member2LastActiveAt: serverTimestamp(),
      member2StudyMinutes: 0,
      memberCount: 1,
      startDate,
      status: 'waiting',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(inviteRef, {
      code: inviteCode,
      campId,
      ownerUid: ownerProfile.uid,
      campName: safeCampName,
      isFull: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    // Update userProfile.campId only AFTER camp & invite exist on the server
    // to avoid onSnapshot latency-compensation permission races on the new camp.
    await updateDoc(profileRef, {
      campId,
      updatedAt: serverTimestamp(),
    });

    return { campId, inviteCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function lookupInviteCode(rawCode: string): Promise<InviteCodeDoc | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
    return null;
  }
  const path = `inviteCodes/${code}`;
  try {
    const snap = await getDoc(doc(db, 'inviteCodes', code));
    if (!snap.exists()) return null;
    return snap.data() as InviteCodeDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function joinCampByCode(params: {
  rawCode: string;
  studentProfile: UserProfile;
}): Promise<string> {
  const code = params.rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
    throw new Error('شكل كود الدعوة مش صح.');
  }

  const invite = await lookupInviteCode(code);
  if (!invite) {
    throw new Error('مفيش معسكر بالكود ده.');
  }
  if (invite.isFull) {
    throw new Error('معلش، المعسكر ده خلاص اكتمل (طالبين بس) ومش هينفع تدخل فيه.');
  }
  if (invite.ownerUid === params.studentProfile.uid) {
    throw new Error('أنت / أنتي أصلاً اللي عامل / عاملة المعسكر ده!');
  }

  const campPath = `camps/${invite.campId}`;
  try {
    let campSnap;
    try {
      campSnap = await getDoc(doc(db, 'camps', invite.campId));
    } catch (readErr) {
      const msg = readErr instanceof Error ? readErr.message : '';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
        throw new Error('معلش، المعسكر ده خلاص اكتمل (طالبين بس).');
      }
      throw readErr;
    }

    if (!campSnap.exists()) {
      throw new Error('المعسكر ده مش موجود.');
    }
    const campData = campSnap.data() as Camp;
    if (campData.memberCount >= 2 || campData.member2Uid !== '') {
      throw new Error('معلش، المعسكر ده خلاص اكتمل (طالبين بس).');
    }

    const batch = writeBatch(db);
    const campRef = doc(db, 'camps', invite.campId);
    const inviteRef = doc(db, 'inviteCodes', code);
    const profileRef = doc(db, 'userProfiles', params.studentProfile.uid);

    batch.update(campRef, {
      member2Uid: params.studentProfile.uid,
      member2Name: clampStr(params.studentProfile.displayName, FIELD_LIMITS.DISPLAY_NAME_MAX),
      member2Avatar: clampStr(params.studentProfile.avatarUrl, FIELD_LIMITS.AVATAR_URL_MAX),
      member2LastActivity: 'دخل / دخلت المعسكر بكل حماس!',
      member2LastActiveAt: serverTimestamp(),
      memberCount: 2,
      status: 'active',
      updatedAt: serverTimestamp(),
    });

    batch.update(inviteRef, {
      isFull: true,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    // Update userProfile.campId only AFTER camp membership is committed on the server
    // so subcollection listeners (tasks, messages, notifications) don't race before member2Uid is set.
    await updateDoc(profileRef, {
      campId: invite.campId,
      updatedAt: serverTimestamp(),
    });

    return invite.campId;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('اكتمل') ||
        error.message.includes('مش موجود') ||
        error.message.includes('شكل كود') ||
        error.message.includes('عامل'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, campPath);
  }
}

export async function clearUserCampId(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'userProfiles', uid), {
      campId: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Could not clear stale campId:', error);
  }
}

export async function updateCampSettings(params: {
  campId: string;
  name: string;
  startDate: string;
  status: 'waiting' | 'active' | 'completed';
}): Promise<void> {
  const path = `camps/${params.campId}`;
  try {
    await updateDoc(doc(db, 'camps', params.campId), {
      name: clampStr(params.name, FIELD_LIMITS.CAMP_NAME_MAX),
      startDate: params.startDate,
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCampHeroImage(params: {
  campId: string;
  heroImageUrl: string;
}): Promise<void> {
  const path = `camps/${params.campId}`;
  try {
    await updateDoc(doc(db, 'camps', params.campId), {
      heroImageUrl: clampStr(params.heroImageUrl, FIELD_LIMITS.CAMP_HERO_URL_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createTask(params: {
  campId: string;
  actorUid: string;
  day: number;
  subject: SubjectKey;
  taskType: TaskTypeKey;
  customTypeLabel: string;
  title: string;
  notes: string;
  bgImageUrl?: string;
}): Promise<string> {
  const taskId = generateSafeId('task');
  const path = `camps/${params.campId}/tasks/${taskId}`;
  try {
    await setDoc(doc(db, 'camps', params.campId, 'tasks', taskId), {
      id: taskId,
      campId: params.campId,
      day: Math.min(20, Math.max(1, Math.round(params.day))),
      subject: params.subject,
      taskType: params.taskType,
      customTypeLabel:
        params.taskType === 'custom'
          ? clampStr(params.customTypeLabel, FIELD_LIMITS.CUSTOM_LABEL_MAX)
          : '',
      title: clampStr(params.title, FIELD_LIMITS.TASK_TITLE_MAX),
      notes: clampStr(params.notes, FIELD_LIMITS.TASK_NOTES_MAX),
      bgImageUrl: clampStr(params.bgImageUrl || '', FIELD_LIMITS.TASK_BG_URL_MAX),
      createdBy: params.actorUid,
      member1Done: false,
      member1DoneAtMs: 0,
      member2Done: false,
      member2DoneAtMs: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return taskId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTaskDetails(params: {
  campId: string;
  taskId: string;
  day: number;
  subject: SubjectKey;
  taskType: TaskTypeKey;
  customTypeLabel: string;
  title: string;
  notes: string;
  bgImageUrl?: string;
}): Promise<void> {
  const path = `camps/${params.campId}/tasks/${params.taskId}`;
  try {
    await updateDoc(doc(db, 'camps', params.campId, 'tasks', params.taskId), {
      day: Math.min(20, Math.max(1, Math.round(params.day))),
      subject: params.subject,
      taskType: params.taskType,
      customTypeLabel:
        params.taskType === 'custom'
          ? clampStr(params.customTypeLabel, FIELD_LIMITS.CUSTOM_LABEL_MAX)
          : '',
      title: clampStr(params.title, FIELD_LIMITS.TASK_TITLE_MAX),
      notes: clampStr(params.notes, FIELD_LIMITS.TASK_NOTES_MAX),
      bgImageUrl: clampStr(params.bgImageUrl || '', FIELD_LIMITS.TASK_BG_URL_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateTaskBackground(params: {
  campId: string;
  taskId: string;
  bgImageUrl: string;
}): Promise<void> {
  const path = `camps/${params.campId}/tasks/${params.taskId}`;
  try {
    await updateDoc(doc(db, 'camps', params.campId, 'tasks', params.taskId), {
      bgImageUrl: clampStr(params.bgImageUrl, FIELD_LIMITS.TASK_BG_URL_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTask(campId: string, taskId: string): Promise<void> {
  const path = `camps/${campId}/tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'camps', campId, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleTaskCompletion(params: {
  camp: Camp;
  task: CampTask;
  actorUid: string;
  actorName: string;
}): Promise<{ becameFullyCompleted: boolean; nextDone: boolean }> {
  const { camp, task, actorUid, actorName } = params;
  const isMember1 = camp.member1Uid === actorUid;
  const isMember2 = camp.member2Uid === actorUid;
  if (!isMember1 && !isMember2) {
    throw new Error('مش مسموح لك تعدّل / تعدّلي المهمة دي.');
  }

  const nextDone = isMember1 ? !task.member1Done : !task.member2Done;
  const partnerDone = isMember1 ? task.member2Done : task.member1Done;
  const becameFullyCompleted = nextDone && partnerDone;
  const partnerUid = isMember1 ? camp.member2Uid : camp.member1Uid;

  const taskPath = `camps/${camp.id}/tasks/${task.id}`;
  try {
    const batch = writeBatch(db);
    const taskRef = doc(db, 'camps', camp.id, 'tasks', task.id);
    const campRef = doc(db, 'camps', camp.id);

    if (isMember1) {
      batch.update(taskRef, {
        member1Done: nextDone,
        member1DoneAtMs: nextDone ? Date.now() : 0,
        updatedAt: serverTimestamp(),
      });
      batch.update(campRef, {
        member1LastActivity: clampStr(
          nextDone ? `خلص / خلصت: ${task.title}` : `رجع / رجعت في: ${task.title}`,
          FIELD_LIMITS.LAST_ACTIVITY_MAX
        ),
        member1LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(taskRef, {
        member2Done: nextDone,
        member2DoneAtMs: nextDone ? Date.now() : 0,
        updatedAt: serverTimestamp(),
      });
      batch.update(campRef, {
        member2LastActivity: clampStr(
          nextDone ? `خلص / خلصت: ${task.title}` : `رجع / رجعت في: ${task.title}`,
          FIELD_LIMITS.LAST_ACTIVITY_MAX
        ),
        member2LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Dispatch notification when completing a lecture or completing a full dual task
    const isLecture = TASK_TYPE_CONFIG[task.taskType]?.isLecture ?? false;
    const subjectLabel = SUBJECT_CONFIG[task.subject]?.label || 'المادة';
    if (nextDone && (becameFullyCompleted || (isLecture && partnerUid))) {
      const notifId = generateSafeId('notif');
      const notifRef = doc(db, 'camps', camp.id, 'notifications', notifId);
      const type: NotificationTypeKey = becameFullyCompleted ? 'task_completed' : 'lecture_done';
      const title = becameFullyCompleted
        ? '🎉 أنتم الاتنين خلصتم المهمة سوا!'
        : `🔥 ${actorName} خلص / خلصت محاضرة ${subjectLabel}!`;
      const body = becameFullyCompleted
        ? `أنتم الاتنين خلصتم مهمة "${task.title}" في اليوم ${task.day}.`
        : `${actorName} خلص / خلصت "${task.title}" (اليوم ${task.day}). يلا دورك تكملها / تكمليها!`;

      batch.set(notifRef, {
        id: notifId,
        campId: camp.id,
        actorUid,
        targetUid: becameFullyCompleted ? 'all' : partnerUid || 'all',
        type,
        title: clampStr(title, FIELD_LIMITS.NOTIFICATION_TITLE_MAX),
        body: clampStr(body, FIELD_LIMITS.NOTIFICATION_BODY_MAX),
        readBy: [actorUid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return { becameFullyCompleted, nextDone };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, taskPath);
  }
}

export async function sendMessage(params: {
  camp: Camp;
  senderUid: string;
  senderName: string;
  senderAvatar: string;
  type: MessageTypeKey;
  customLabel: string;
  content: string;
  isBanner: boolean;
  parentMessageId?: string;
}): Promise<string> {
  const {
    camp,
    senderUid,
    senderName,
    senderAvatar,
    type,
    customLabel,
    content,
    isBanner,
    parentMessageId,
  } = params;
  const messageId = generateSafeId('msg');
  const path = `camps/${camp.id}/messages/${messageId}`;
  const isMember1 = camp.member1Uid === senderUid;
  const partnerUid = isMember1 ? camp.member2Uid : camp.member1Uid;
  const safeParentId = parentMessageId ? clampStr(parentMessageId, 128) : '';
  const isReply = safeParentId.length > 0;
  const effectiveType: MessageTypeKey = isReply ? 'normal' : type;
  const effectiveCustomLabel =
    !isReply && type === 'custom' ? clampStr(customLabel, FIELD_LIMITS.CUSTOM_LABEL_MAX) : '';
  const effectiveIsBanner = isReply ? false : isBanner;

  try {
    const batch = writeBatch(db);
    const msgRef = doc(db, 'camps', camp.id, 'messages', messageId);
    const campRef = doc(db, 'camps', camp.id);

    batch.set(msgRef, {
      id: messageId,
      campId: camp.id,
      senderUid,
      senderName: clampStr(senderName, FIELD_LIMITS.DISPLAY_NAME_MAX),
      senderAvatar: clampStr(senderAvatar, FIELD_LIMITS.AVATAR_URL_MAX),
      type: effectiveType,
      customLabel: effectiveCustomLabel,
      content: clampStr(content, FIELD_LIMITS.MESSAGE_CONTENT_MAX),
      isBanner: effectiveIsBanner,
      parentMessageId: safeParentId,
      partnerReaction: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const activityText = isReply
      ? 'رد / ردت على رسالة في رسايلنا'
      : 'بعت / بعتت رسالة تشجيع في رسايلنا';

    if (isMember1) {
      batch.update(campRef, {
        member1LastActivity: clampStr(activityText, FIELD_LIMITS.LAST_ACTIVITY_MAX),
        member1LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(campRef, {
        member2LastActivity: clampStr(activityText, FIELD_LIMITS.LAST_ACTIVITY_MAX),
        member2LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const notifId = generateSafeId('notif');
    const notifRef = doc(db, 'camps', camp.id, 'notifications', notifId);
    const notifTitle = isReply
      ? `💬 رد جديد من ${senderName}`
      : effectiveType === 'advice'
      ? `💡 نصيحة تشجيعية من ${senderName}`
      : effectiveType === 'quote'
      ? `✨ اقتباس وتحفيز من ${senderName}`
      : effectiveType === 'dua'
      ? `🤲 دعاء حلو من ${senderName}`
      : `💌 عندك رسالة جديدة من ${senderName}`;
    batch.set(notifRef, {
      id: notifId,
      campId: camp.id,
      actorUid: senderUid,
      targetUid: partnerUid || 'all',
      type: 'new_message',
      title: clampStr(notifTitle, FIELD_LIMITS.NOTIFICATION_TITLE_MAX),
      body: clampStr(content, FIELD_LIMITS.NOTIFICATION_BODY_MAX),
      readBy: [senderUid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return messageId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function reactToMessage(params: {
  campId: string;
  messageId: string;
  emoji: string;
}): Promise<void> {
  const path = `camps/${params.campId}/messages/${params.messageId}`;
  try {
    await updateDoc(doc(db, 'camps', params.campId, 'messages', params.messageId), {
      partnerReaction: clampStr(params.emoji, FIELD_LIMITS.REACTION_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMessage(
  campId: string,
  messageId: string,
  ownReplyIds: string[] = []
): Promise<void> {
  const path = `camps/${campId}/messages/${messageId}`;
  try {
    if (ownReplyIds.length > 0) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'camps', campId, 'messages', messageId));
      for (const replyId of ownReplyIds.slice(0, 40)) {
        batch.delete(doc(db, 'camps', campId, 'messages', replyId));
      }
      await batch.commit();
    } else {
      await deleteDoc(doc(db, 'camps', campId, 'messages', messageId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function logStudySession(params: {
  camp: Camp;
  userUid: string;
  subject: StudySubjectKey;
  durationMinutes: number;
  day: number;
}): Promise<void> {
  const { camp, userUid, subject, durationMinutes, day } = params;
  const sessionId = generateSafeId('sess');
  const path = `camps/${camp.id}/studySessions/${sessionId}`;
  const isMember1 = camp.member1Uid === userUid;
  const mins = Math.min(300, Math.max(1, Math.round(durationMinutes)));
  const clampedDay = Math.min(20, Math.max(1, Math.round(day)));

  try {
    const batch = writeBatch(db);
    const sessRef = doc(db, 'camps', camp.id, 'studySessions', sessionId);
    const campRef = doc(db, 'camps', camp.id);

    batch.set(sessRef, {
      id: sessionId,
      campId: camp.id,
      userUid,
      subject,
      durationMinutes: mins,
      day: clampedDay,
      createdAt: serverTimestamp(),
    });

    if (isMember1) {
      batch.update(campRef, {
        member1StudyMinutes: increment(mins),
        member1LastActivity: clampStr(`خلص / خلصت جلسة تركيز (${mins} دقيقة)`, FIELD_LIMITS.LAST_ACTIVITY_MAX),
        member1LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(campRef, {
        member2StudyMinutes: increment(mins),
        member2LastActivity: clampStr(`خلص / خلصت جلسة تركيز (${mins} دقيقة)`, FIELD_LIMITS.LAST_ACTIVITY_MAX),
        member2LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    trackPomodoroCompleted({ subject, durationMinutes: mins, day: clampedDay });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createMilestoneNotification(params: {
  campId: string;
  notificationId: string;
  actorUid: string;
  type: 'new_day' | 'camp_ending';
  title: string;
  body: string;
}): Promise<void> {
  const path = `camps/${params.campId}/notifications/${params.notificationId}`;
  try {
    const ref = doc(db, 'camps', params.campId, 'notifications', params.notificationId);
    const existing = await getDoc(ref);
    if (existing.exists()) return;
    await setDoc(ref, {
      id: params.notificationId,
      campId: params.campId,
      actorUid: params.actorUid,
      targetUid: 'all',
      type: params.type,
      title: clampStr(params.title, FIELD_LIMITS.NOTIFICATION_TITLE_MAX),
      body: clampStr(params.body, FIELD_LIMITS.NOTIFICATION_BODY_MAX),
      readBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Non-fatal if duplicate race occurs
    console.warn('Milestone notification check:', error);
  }
}

export async function markNotificationRead(
  campId: string,
  notification: CampNotification,
  uid: string
): Promise<void> {
  if (notification.readBy.includes(uid)) return;
  const nextReadBy = [...notification.readBy, uid].slice(0, 2);
  const path = `camps/${campId}/notifications/${notification.id}`;
  try {
    await updateDoc(doc(db, 'camps', campId, 'notifications', notification.id), {
      readBy: nextReadBy,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(
  campId: string,
  notifications: CampNotification[],
  uid: string
): Promise<void> {
  const unread = notifications.filter((n) => !n.readBy.includes(uid));
  if (unread.length === 0) return;

  const path = `camps/${campId}/notifications`;
  try {
    const batch = writeBatch(db);
    for (const n of unread.slice(0, 40)) {
      const ref = doc(db, 'camps', campId, 'notifications', n.id);
      batch.update(ref, {
        readBy: [...n.readBy, uid].slice(0, 2),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function sendLittleQuestion(params: {
  camp: Camp;
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
  const questionId = generateSafeId('lques');
  const path = `camps/${camp.id}/littleQuestions/${questionId}`;
  const isMember1 = camp.member1Uid === senderUid;
  const partnerUid = isMember1 ? camp.member2Uid : camp.member1Uid;
  const safeParentId = parentQuestionId ? clampStr(parentQuestionId, 128) : '';
  const isReply = safeParentId.length > 0;
  const safeContent = clampStr(content, FIELD_LIMITS.MESSAGE_CONTENT_MAX);
  const safeImage = clampStr(imageUrl, FIELD_LIMITS.QUESTION_IMAGE_URL_MAX);

  if (!safeContent && !safeImage) {
    throw new Error('اكتب / اكتبي سؤال أو ارفع / ارفعي صورة الأول.');
  }

  try {
    const batch = writeBatch(db);
    const qRef = doc(db, 'camps', camp.id, 'littleQuestions', questionId);
    const campRef = doc(db, 'camps', camp.id);

    batch.set(qRef, {
      id: questionId,
      campId: camp.id,
      senderUid,
      senderName: clampStr(senderName, FIELD_LIMITS.DISPLAY_NAME_MAX),
      senderAvatar: clampStr(senderAvatar, FIELD_LIMITS.AVATAR_URL_MAX),
      crystalStyle,
      content: safeContent,
      imageUrl: safeImage,
      parentQuestionId: safeParentId,
      partnerReaction: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const activityText = isReply
      ? 'رد / ردت على سؤال في سؤال صغنن 💎'
      : 'بعت / بعتت سؤال صغنن 💎';

    if (isMember1) {
      batch.update(campRef, {
        member1LastActivity: clampStr(activityText, FIELD_LIMITS.LAST_ACTIVITY_MAX),
        member1LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(campRef, {
        member2LastActivity: clampStr(activityText, FIELD_LIMITS.LAST_ACTIVITY_MAX),
        member2LastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const notifId = generateSafeId('notif');
    const notifRef = doc(db, 'camps', camp.id, 'notifications', notifId);
    batch.set(notifRef, {
      id: notifId,
      campId: camp.id,
      actorUid: senderUid,
      targetUid: partnerUid || 'all',
      type: 'new_question',
      title: clampStr(
        isReply ? `رد على سؤال صغنن من ${senderName}` : `سؤال صغنن جديد من ${senderName} 💎`,
        FIELD_LIMITS.NOTIFICATION_TITLE_MAX
      ),
      body: clampStr(
        safeContent || 'بعتلك سؤال بصورة في عالم البلورات ✨',
        FIELD_LIMITS.NOTIFICATION_BODY_MAX
      ),
      readBy: [senderUid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return questionId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function reactToLittleQuestion(params: {
  campId: string;
  questionId: string;
  emoji: string;
}): Promise<void> {
  const path = `camps/${params.campId}/littleQuestions/${params.questionId}`;
  try {
    await updateDoc(doc(db, 'camps', params.campId, 'littleQuestions', params.questionId), {
      partnerReaction: clampStr(params.emoji, FIELD_LIMITS.REACTION_MAX),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteLittleQuestion(
  campId: string,
  questionId: string,
  ownReplyIds: string[] = []
): Promise<void> {
  const path = `camps/${campId}/littleQuestions/${questionId}`;
  try {
    if (ownReplyIds.length > 0) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'camps', campId, 'littleQuestions', questionId));
      for (const replyId of ownReplyIds.slice(0, 40)) {
        batch.delete(doc(db, 'camps', campId, 'littleQuestions', replyId));
      }
      await batch.commit();
    } else {
      await deleteDoc(doc(db, 'camps', campId, 'littleQuestions', questionId));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendSurprise(params: {
  camp: Camp;
  senderUid: string;
  senderName: string;
  kind: SurpriseKind;
  note: string;
}): Promise<string> {
  const { camp, senderUid, senderName, kind, note } = params;
  const surpriseId = generateSafeId('surp');
  const path = `camps/${camp.id}/surprises/${surpriseId}`;
  const isMember1 = camp.member1Uid === senderUid;
  const partnerUid = isMember1 ? camp.member2Uid : camp.member1Uid;

  try {
    const batch = writeBatch(db);
    const surpRef = doc(db, 'camps', camp.id, 'surprises', surpriseId);
    batch.set(surpRef, {
      id: surpriseId,
      campId: camp.id,
      senderUid,
      senderName: clampStr(senderName, FIELD_LIMITS.DISPLAY_NAME_MAX),
      recipientUid: partnerUid || '',
      kind,
      note: clampStr(note, 400),
      opened: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (partnerUid) {
      const notifId = generateSafeId('notif');
      const notifRef = doc(db, 'camps', camp.id, 'notifications', notifId);
      batch.set(notifRef, {
        id: notifId,
        campId: camp.id,
        actorUid: senderUid,
        targetUid: partnerUid,
        type: 'new_surprise',
        title: clampStr(`🎁 مفاجأة حلوة من ${senderName}!`, FIELD_LIMITS.NOTIFICATION_TITLE_MAX),
        body: clampStr(note || 'جاتلك مفاجأة حلوة وتقدير من شريك / شريكة المعسكر ✨', FIELD_LIMITS.NOTIFICATION_BODY_MAX),
        readBy: [senderUid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    trackSurpriseSent({ kind });
    return surpriseId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function getDefaultNotificationPreferences(uid: string): NotificationPreferences {
  return {
    uid,
    enabled: true,
    lecture_done: true,
    task_completed: true,
    new_message: true,
    new_question: true,
    new_surprise: true,
    new_day: true,
    camp_ending: true,
  };
}

export async function fetchNotificationPreferences(uid: string): Promise<NotificationPreferences> {
  const path = `userProfiles/${uid}/preferences/notifications`;
  try {
    const snap = await getDoc(doc(db, 'userProfiles', uid, 'preferences', 'notifications'));
    if (!snap.exists()) {
      return getDefaultNotificationPreferences(uid);
    }
    return snap.data() as NotificationPreferences;
  } catch (error) {
    console.warn('Could not fetch notification preferences:', path, error);
    return getDefaultNotificationPreferences(uid);
  }
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences
): Promise<void> {
  const path = `userProfiles/${prefs.uid}/preferences/notifications`;
  try {
    await setDoc(doc(db, 'userProfiles', prefs.uid, 'preferences', 'notifications'), {
      uid: prefs.uid,
      enabled: Boolean(prefs.enabled),
      lecture_done: Boolean(prefs.lecture_done),
      task_completed: Boolean(prefs.task_completed),
      new_message: Boolean(prefs.new_message),
      new_question: Boolean(prefs.new_question),
      new_surprise: Boolean(prefs.new_surprise),
      new_day: Boolean(prefs.new_day),
      camp_ending: Boolean(prefs.camp_ending),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertFcmToken(params: {
  uid: string;
  campId: string;
  tokenId: string;
  token: string;
  deviceLabel: string;
}): Promise<void> {
  const { uid, campId, tokenId, token, deviceLabel } = params;
  const path = `userProfiles/${uid}/fcmTokens/${tokenId}`;
  try {
    const ref = doc(db, 'userProfiles', uid, 'fcmTokens', tokenId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        campId: clampStr(campId, 128),
        token: clampStr(token, 512),
        deviceLabel: clampStr(deviceLabel, 80),
        active: true,
        updatedAt: serverTimestamp(),
        lastUsedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: tokenId,
        uid,
        campId: clampStr(campId, 128),
        token: clampStr(token, 512),
        platform: 'web',
        deviceLabel: clampStr(deviceLabel, 80),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUsedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deactivateFcmToken(uid: string, tokenId: string): Promise<void> {
  const path = `userProfiles/${uid}/fcmTokens/${tokenId}`;
  try {
    const ref = doc(db, 'userProfiles', uid, 'fcmTokens', tokenId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, {
      active: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Could not deactivate FCM token:', path, error);
  }
}

export async function logSiteVisitor(userEmail?: string, userName?: string): Promise<void> {
  try {
    const identityKey = userEmail ? `user_${userEmail}` : 'anon';
    const visitedKey = `moaskar_visited_${identityKey}`;
    if (sessionStorage.getItem(visitedKey)) return;
    sessionStorage.setItem(visitedKey, '1');

    const visitId = generateSafeId('vis');
    await setDoc(doc(db, 'visitors', visitId), {
      id: visitId,
      timestamp: serverTimestamp(),
      userEmail: clampStr(userEmail || 'زائر / زائرة مش مسجل', 120),
      userName: clampStr(userName || 'زائر / زائرة مجهول', 80),
      userAgent: typeof navigator !== 'undefined' ? clampStr(navigator.userAgent, 240) : '',
      screen:
        typeof window !== 'undefined'
          ? clampStr(`${window.innerWidth}x${window.innerHeight}`, 32)
          : '',
    });
  } catch {
    // Silent fail on visitor logging
  }
}

function mapAuthAccountDeleteError(err: unknown): Error {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err || '');

  if (code === 'auth/user-mismatch' || msg.includes('user-mismatch')) {
    return new Error(
      'اخترت / اخترتي حساب جوجل تاني غير الحساب المسجل دلوقتي. اختار / اختاري نفس الإيميل عشان تمسح / تمسحي الحساب.'
    );
  }
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    msg.includes('popup-closed-by-user')
  ) {
    return new Error('قفلت / قفلتي شاشة التأكيد قبل ما تكمل / تكملي التحقق. جرب / جربي تاني.');
  }
  if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
    return new Error('المتصفح قفل نافذة التحقق من جوجل. اعمل / اعملي سماح للنوافذ المنبثقة (Popups) وجرب / جربي تاني.');
  }
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    msg.includes('wrong-password') ||
    msg.includes('invalid-credential')
  ) {
    return new Error('كلمة السر اللي كتبتها مش صح.. اتأكد منها وجرب تاني.');
  }
  if (code === 'auth/requires-recent-login' || msg.includes('requires-recent-login')) {
    return new Error('عشان الأمان، اكتب كلمة السر الحالية أو اعمل خروج وادخل تاني سريع وبعدين امسح الحساب.');
  }
  if (code === 'auth/network-request-failed' || msg.includes('network-request-failed')) {
    return new Error('مفيش نت كفاية عشان نكمل مسح الحساب. اتأكد / اتأكدي من الشبكة وجرب / جربي تاني.');
  }
  return err instanceof Error ? err : new Error('حصلت مشكلة غير متوقعة وإحنا بنمسح الحساب.');
}

async function deleteCollectionDocsInChunks(
  colRef: ReturnType<typeof collection>
): Promise<void> {
  const snap = await getDocs(colRef);
  if (snap.empty) return;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const chunk = snap.docs.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function deleteStudentAccount(params: {
  user: User;
  profile?: UserProfile | null;
  authTimeMs?: number;
  password?: string;
}): Promise<void> {
  const { user, profile, authTimeMs, password } = params;
  const uid = user.uid;
  const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
  const hasGoogleProvider = user.providerData.some((p) => p.providerId === 'google.com');

  // 1. Re-authenticate when needed (> 4m 20s since last auth) using password credential
  //    or Google popup only if this user happened to be a Google account.
  const lastSignInMs = user.metadata?.lastSignInTime
    ? Date.parse(user.metadata.lastSignInTime)
    : 0;
  const effectiveAuthMs =
    authTimeMs && !Number.isNaN(authTimeMs) ? authTimeMs : lastSignInMs;
  const needsFreshAuth =
    !effectiveAuthMs ||
    Number.isNaN(effectiveAuthMs) ||
    Date.now() - effectiveAuthMs > 260_000;

  if (needsFreshAuth) {
    if (hasPasswordProvider && user.email) {
      if (!password || !password.trim()) {
        throw new Error('اكتب / اكتبي كلمة السر الحالية لتأكيد مسح الحساب.');
      }
      try {
        const cred = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, cred);
      } catch (authErr) {
        throw mapAuthAccountDeleteError(authErr);
      }
    } else if (hasGoogleProvider) {
      try {
        const reauthProvider = new GoogleAuthProvider();
        if (user.email) {
          reauthProvider.setCustomParameters({ login_hint: user.email });
        }
        await reauthenticateWithPopup(user, reauthProvider);
      } catch (authErr) {
        throw mapAuthAccountDeleteError(authErr);
      }
    }
  }

  // 2. Fetch latest profile from server/cache to discover active camps
  let latestProfile: UserProfile | null = profile || null;
  try {
    const snap = await getDoc(doc(db, 'userProfiles', uid));
    if (snap.exists()) {
      latestProfile = snap.data() as UserProfile;
    }
  } catch {
    // Proceed cleanly even if profile doc does not exist yet
  }

  // 3. Leave Group Camp cleanly while userProfiles/{uid} still exists (required by security rules)
  const groupCampId = latestProfile?.groupCampId || '';
  if (groupCampId) {
    try {
      await leaveCurrentGroupCamp({ campId: groupCampId, uid });
    } catch (err) {
      console.warn('Could not leave group camp during account deletion:', err);
    }
  }

  // 4. Clean up or vacate Duo Camp slot if applicable
  const duoCampId = latestProfile?.campId || '';
  if (duoCampId) {
    try {
      const campRef = doc(db, 'camps', duoCampId);
      const campSnap = await getDoc(campRef);
      if (campSnap.exists()) {
        const campData = campSnap.data() as Camp;
        if (campData.ownerUid === uid && campData.memberCount === 1 && campData.member2Uid === '') {
          const batch = writeBatch(db);
          batch.delete(campRef);
          if (campData.inviteCode) {
            batch.delete(doc(db, 'inviteCodes', campData.inviteCode));
          }
          await batch.commit();
        } else if (campData.memberCount === 2 && campData.member2Uid === uid) {
          await updateDoc(campRef, {
            member2Uid: '',
            member2Name: '',
            member2Avatar: '',
            member2LastActivity: '',
            member2LastActiveAt: serverTimestamp(),
            member2StudyMinutes: 0,
            memberCount: 1,
            status: 'waiting',
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      console.warn('Could not clean up duo camp during account deletion:', err);
    }
  }

  // 5. Delete owner-scoped subcollections & profile doc
  try {
    await deleteCollectionDocsInChunks(collection(db, 'userProfiles', uid, 'fcmTokens'));
  } catch {
    // Non-fatal
  }

  try {
    await deleteCollectionDocsInChunks(collection(db, 'userProfiles', uid, 'pushSubscriptions'));
  } catch {
    // Non-fatal
  }

  try {
    await deleteDoc(doc(db, 'userProfiles', uid, 'preferences', 'notifications'));
  } catch {
    // Non-fatal
  }

  // Snapshot examHistory list before deleting profile doc, then delete profile & examHistory
  let historyDocs: Awaited<ReturnType<typeof getDocs>>['docs'] = [];
  try {
    const historySnap = await getDocs(collection(db, 'userProfiles', uid, 'examHistory'));
    historyDocs = historySnap.docs;
  } catch {
    // Non-fatal
  }

  try {
    await deleteDoc(doc(db, 'userProfiles', uid));
  } catch (error) {
    // Ignore if profile doc wasn't created yet
    const msg = error instanceof Error ? error.message : '';
    if (!msg.includes('not-found')) {
      handleFirestoreError(error, OperationType.DELETE, `userProfiles/${uid}`);
    }
  }

  if (historyDocs.length > 0) {
    try {
      for (let i = 0; i < historyDocs.length; i += 400) {
        const chunk = historyDocs.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.warn('Could not delete examHistory entries:', err);
    }
  }

  // 5b. Clean up phoneLoginAliases & phoneRecoverySecrets pointers so phone number is free again
  try {
    const phoneE164 = resolveStudentPhoneE164FromAuth({
      phoneNumber: user.phoneNumber,
      email: user.email,
      profilePhone: latestProfile?.phone,
    });
    const local01 = toLocalEgyptianPhone(phoneE164);
    if (isValidEgyptianMobile(local01)) {
      const digitsKey = toPhoneDigitsKey(local01);
      await Promise.allSettled([
        deleteDoc(doc(db, 'phoneLoginAliases', digitsKey)),
        deleteDoc(doc(db, 'phoneRecoverySecrets', digitsKey)),
      ]);
    }
  } catch {
    // Non-fatal if no alias/secret doc existed
  }

  // 6. Delete Firebase Auth account so the student can immediately sign up fresh with the same phone
  try {
    await deleteUser(user);
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    if (code === 'auth/requires-recent-login') {
      if (hasPasswordProvider && user.email && password && password.trim()) {
        try {
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
          await deleteUser(user);
        } catch (retryErr) {
          throw mapAuthAccountDeleteError(retryErr);
        }
      } else if (hasGoogleProvider) {
        try {
          const reauthProvider = new GoogleAuthProvider();
          if (user.email) {
            reauthProvider.setCustomParameters({ login_hint: user.email });
          }
          await reauthenticateWithPopup(user, reauthProvider);
          await deleteUser(user);
        } catch (retryErr) {
          throw mapAuthAccountDeleteError(retryErr);
        }
      } else {
        throw mapAuthAccountDeleteError(err);
      }
    } else {
      throw mapAuthAccountDeleteError(err);
    }
  }

  // 7. Clear session / FCM local storage keys (preserve user's chosen theme)
  //    and explicitly sign out so onAuthStateChanged transitions cleanly to Screen 1.
  try {
    localStorage.removeItem('moaskar_fcm_token_id');
    localStorage.removeItem('moaskar_fcm_raw_token');
    localStorage.removeItem('moaskar_notif_prompt_dismissed');
    if (user.email) {
      sessionStorage.removeItem(`moaskar_visited_user_${user.email}`);
    }
  } catch {
    // Ignore storage errors
  }

  try {
    await signOut(auth);
  } catch {
    // deleteUser already signs out; ignore redundant signOut errors
  }
}


