import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

const FIRESTORE_DATABASE_ID = 'ai-studio-3e6b8295-0f8f-4937-a340-0b364e82f518';
const FUNCTION_REGION = 'europe-west1';

const adminApp = initializeApp();
const db = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
const messaging = getMessaging(adminApp);

type NotificationTypeKey =
  | 'lecture_done'
  | 'task_completed'
  | 'new_message'
  | 'new_question'
  | 'new_surprise'
  | 'new_day'
  | 'camp_ending';

const VALID_TYPES = new Set<NotificationTypeKey>([
  'lecture_done',
  'task_completed',
  'new_message',
  'new_question',
  'new_surprise',
  'new_day',
  'camp_ending',
]);

const TARGET_TAB_BY_TYPE: Record<NotificationTypeKey, string> = {
  lecture_done: 'schedule',
  task_completed: 'schedule',
  new_message: 'messages',
  new_question: 'little_question',
  new_surprise: 'dashboard',
  new_day: 'dashboard',
  camp_ending: 'dashboard',
};

const COLOR_BY_TYPE: Record<NotificationTypeKey, string> = {
  lecture_done: '#ec4899',
  task_completed: '#10b981',
  new_message: '#f43f5e',
  new_question: '#fb7185',
  new_surprise: '#f59e0b',
  new_day: '#06b6d4',
  camp_ending: '#ef4444',
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);

interface CampRecord {
  member1Uid?: string;
  member2Uid?: string;
}

interface CampNotificationRecord {
  id?: string;
  campId?: string;
  actorUid?: string;
  targetUid?: string;
  type?: NotificationTypeKey;
  title?: string;
  body?: string;
}

interface NotificationPrefsRecord {
  enabled?: boolean;
  [key: string]: unknown;
}

async function isCategoryAllowedForUser(
  uid: string,
  type: NotificationTypeKey
): Promise<boolean> {
  const prefSnap = await db
    .doc(`userProfiles/${uid}/preferences/notifications`)
    .get();
  if (!prefSnap.exists) {
    return true;
  }
  const prefs = prefSnap.data() as NotificationPrefsRecord;
  if (prefs.enabled === false) {
    return false;
  }
  if (prefs[type] === false) {
    return false;
  }
  return true;
}

export const onCampNotificationCreated = onDocumentCreated(
  {
    document: 'camps/{campId}/notifications/{notificationId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const { campId, notificationId } = event.params;
    const notif = event.data?.data() as CampNotificationRecord | undefined;

    if (!notif || !notif.type || !VALID_TYPES.has(notif.type)) {
      logger.warn('Ignoring invalid notification payload', { campId, notificationId });
      return;
    }

    const actorUid = typeof notif.actorUid === 'string' ? notif.actorUid : '';
    const targetUid = typeof notif.targetUid === 'string' ? notif.targetUid : '';
    const title = typeof notif.title === 'string' ? notif.title.slice(0, 120) : 'معسكر مغلق';
    const body = typeof notif.body === 'string' ? notif.body.slice(0, 240) : '';

    if (!actorUid || !targetUid || !title) {
      logger.warn('Notification missing required routing fields', { campId, notificationId });
      return;
    }

    // 1. Server-side verification: verify camp exists & actor is a legitimate camp member
    const campSnap = await db.doc(`camps/${campId}`).get();
    if (!campSnap.exists) {
      logger.warn('Blocked push: camp not found', { campId });
      return;
    }

    const camp = campSnap.data() as CampRecord;
    const campMembers = [camp.member1Uid, camp.member2Uid].filter(
      (u): u is string => typeof u === 'string' && u.length > 0
    );

    if (!campMembers.includes(actorUid)) {
      logger.warn('Blocked push: actor is not a camp member', { campId, actorUid });
      return;
    }

    // 2. Resolve strictly verified recipients (cannot target non-members, never self-notify on user actions)
    const isSystemMilestone = notif.type === 'new_day' || notif.type === 'camp_ending';
    let candidateRecipients: string[];

    if (targetUid === 'all') {
      candidateRecipients = isSystemMilestone
        ? campMembers
        : campMembers.filter((uid) => uid !== actorUid);
    } else {
      if (!campMembers.includes(targetUid)) {
        logger.warn('Blocked push: targetUid is not a camp member', { campId, targetUid });
        return;
      }
      if (!isSystemMilestone && targetUid === actorUid) {
        return;
      }
      candidateRecipients = [targetUid];
    }

    if (candidateRecipients.length === 0) {
      return;
    }

    // 3. Atomic deduplication lock so retries never send duplicate push notifications
    const dispatchLogRef = db.doc(`fcmDispatchLog/${campId}_${notificationId}`);
    const acquired = await db.runTransaction(async (tx) => {
      const existing = await tx.get(dispatchLogRef);
      if (existing.exists) {
        return false;
      }
      tx.set(dispatchLogRef, {
        campId,
        notificationId,
        type: notif.type,
        dispatchedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      return true;
    });

    if (!acquired) {
      logger.info('Skipped duplicate notification dispatch', { campId, notificationId });
      return;
    }

    // 4. Filter recipients by saved NotificationPreferences and gather active device tokens
    const tokenRecords: { uid: string; tokenId: string; token: string }[] = [];

    for (const recipientUid of candidateRecipients) {
      const allowed = await isCategoryAllowedForUser(recipientUid, notif.type);
      if (!allowed) continue;

      const tokensSnap = await db
        .collection(`userProfiles/${recipientUid}/fcmTokens`)
        .where('active', '==', true)
        .get();

      for (const docSnap of tokensSnap.docs) {
        const data = docSnap.data() as { token?: string; campId?: string };
        if (typeof data.token === 'string' && data.token.length >= 20) {
          tokenRecords.push({
            uid: recipientUid,
            tokenId: docSnap.id,
            token: data.token,
          });
        }
      }
    }

    if (tokenRecords.length === 0) {
      return;
    }

    const targetTab = TARGET_TAB_BY_TYPE[notif.type];
    const color = COLOR_BY_TYPE[notif.type];

    // 5. Multicast Web Push delivery using data payload handled consistently by firebase-messaging-sw.js
    const response = await messaging.sendEachForMulticast({
      tokens: tokenRecords.map((t) => t.token),
      data: {
        notificationId,
        campId,
        type: notif.type,
        title,
        body,
        targetTab,
        color,
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400',
        },
        fcmOptions: {
          link: `/?tab=${encodeURIComponent(targetTab)}`,
        },
      },
    });

    // 6. Clean up expired or revoked device tokens automatically
    const cleanupPromises: Promise<unknown>[] = [];
    response.responses.forEach((res, index) => {
      if (!res.success && res.error && INVALID_TOKEN_CODES.has(res.error.code)) {
        const stale = tokenRecords[index];
        cleanupPromises.push(
          db.doc(`userProfiles/${stale.uid}/fcmTokens/${stale.tokenId}`).delete()
        );
      }
    });

    if (cleanupPromises.length > 0) {
      await Promise.allSettled(cleanupPromises);
    }

    logger.info('FCM multicast completed', {
      campId,
      notificationId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  }
);

export const onCampSurpriseCreated = onDocumentCreated(
  {
    document: 'camps/{campId}/surprises/{surpriseId}',
    database: FIRESTORE_DATABASE_ID,
    region: FUNCTION_REGION,
  },
  async (event) => {
    const { campId, surpriseId } = event.params;
    const surprise = event.data?.data() as
      | { senderUid?: string; senderName?: string; recipientUid?: string; note?: string }
      | undefined;

    if (!surprise || !surprise.senderUid || !surprise.recipientUid) return;
    if (surprise.senderUid === surprise.recipientUid) return;

    const notifId = `notif_surp_${surpriseId}`;
    const notifRef = db.doc(`camps/${campId}/notifications/${notifId}`);
    const existing = await notifRef.get();
    if (existing.exists) return;

    await notifRef.set({
      id: notifId,
      campId,
      actorUid: surprise.senderUid,
      targetUid: surprise.recipientUid,
      type: 'new_surprise',
      title: `🎁 مفاجأة جديدة من ${surprise.senderName || 'شريكك'}!`,
      body: (surprise.note || 'وصلك تقدير خاص في المعسكر ✨').slice(0, 240),
      readBy: [surprise.senderUid],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
);
