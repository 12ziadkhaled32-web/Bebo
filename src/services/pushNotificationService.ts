import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { generateSafeId } from '../lib/campUtils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AdminBroadcastNotification,
  BroadcastDeliveryReceipt,
  BroadcastTargetRoute,
  NotificationPreferences,
  PushSubscriptionDoc,
  UserProfile,
} from '../types/camp';

export interface StudentPushDirectoryRow {
  uid: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  groupCampId: string;
  consentState: 'granted' | 'opt_out' | 'unset';
  subscriptions: PushSubscriptionDoc[];
  readyDevicesCount: number;
}

export interface BroadcastHistoryItem {
  notification: AdminBroadcastNotification;
  firestoreConfirmedCount: number;
  serverDeliveredCount: number;
  serverOpenedCount: number;
}

export interface SendBroadcastResult {
  notificationId: string;
  totalUniqueDevices: number;
  acceptedCount: number;
  failedCount: number;
  staleRemovedCount: number;
  persistentVapid: boolean;
}

export async function fetchStudentPushConsent(uid: string): Promise<{
  hasDoc: boolean;
  enabled: boolean;
}> {
  try {
    const snap = await getDoc(doc(db, 'userProfiles', uid, 'preferences', 'notifications'));
    if (!snap.exists()) {
      return { hasDoc: false, enabled: false };
    }
    const data = snap.data() as NotificationPreferences;
    return { hasDoc: true, enabled: Boolean(data.enabled) };
  } catch {
    return { hasDoc: false, enabled: false };
  }
}

export async function setStudentBroadcastConsent(params: {
  uid: string;
  enabled: boolean;
}): Promise<void> {
  const { uid, enabled } = params;
  const path = `userProfiles/${uid}/preferences/notifications`;
  try {
    const prefRef = doc(db, 'userProfiles', uid, 'preferences', 'notifications');
    const existing = await getDoc(prefRef);
    const existingData = existing.exists()
      ? (existing.data() as NotificationPreferences)
      : null;

    await setDoc(prefRef, {
      uid,
      enabled: Boolean(enabled),
      lecture_done: existingData ? Boolean(existingData.lecture_done) : true,
      task_completed: existingData ? Boolean(existingData.task_completed) : true,
      new_message: existingData ? Boolean(existingData.new_message) : true,
      new_question: existingData ? Boolean(existingData.new_question) : true,
      new_surprise: existingData ? Boolean(existingData.new_surprise) : true,
      new_day: existingData ? Boolean(existingData.new_day) : true,
      camp_ending: existingData ? Boolean(existingData.camp_ending) : true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveStudentPushSubscription(params: {
  uid: string;
  subId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: 'android' | 'ios' | 'desktop' | 'web';
  installMode: 'pwa' | 'browser';
  deviceLabel: string;
}): Promise<void> {
  const { uid, subId, endpoint, p256dh, auth, platform, installMode, deviceLabel } = params;
  const path = `userProfiles/${uid}/pushSubscriptions/${subId}`;
  try {
    const ref = doc(db, 'userProfiles', uid, 'pushSubscriptions', subId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        endpoint: endpoint.slice(0, 1500),
        p256dh: p256dh.slice(0, 256),
        auth: auth.slice(0, 128),
        platform,
        installMode,
        deviceLabel: deviceLabel.slice(0, 80),
        active: true,
        updatedAt: serverTimestamp(),
        lastUsedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: subId,
        uid,
        endpoint: endpoint.slice(0, 1500),
        p256dh: p256dh.slice(0, 256),
        auth: auth.slice(0, 128),
        platform,
        installMode,
        deviceLabel: deviceLabel.slice(0, 80),
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

export async function deleteStudentPushSubscription(uid: string, subId: string): Promise<void> {
  if (!uid || !subId) return;
  try {
    await deleteDoc(doc(db, 'userProfiles', uid, 'pushSubscriptions', subId));
  } catch {
    // Non-fatal if doc already deleted
  }
}

export async function fetchAdminStudentsPushDirectory(
  profiles: UserProfile[]
): Promise<StudentPushDirectoryRow[]> {
  const rows: StudentPushDirectoryRow[] = [];
  const CONCURRENCY = 12;

  for (let i = 0; i < profiles.length; i += CONCURRENCY) {
    const chunk = profiles.slice(i, i + CONCURRENCY);
    const chunkRows = await Promise.all(
      chunk.map(async (p): Promise<StudentPushDirectoryRow> => {
        let consentState: 'granted' | 'opt_out' | 'unset' = 'unset';
        let subscriptions: PushSubscriptionDoc[] = [];

        try {
          const [prefSnap, subsSnap] = await Promise.all([
            getDoc(doc(db, 'userProfiles', p.uid, 'preferences', 'notifications')),
            getDocs(collection(db, 'userProfiles', p.uid, 'pushSubscriptions')),
          ]);

          if (prefSnap.exists()) {
            const pref = prefSnap.data() as NotificationPreferences;
            consentState = pref.enabled ? 'granted' : 'opt_out';
          }

          if (!subsSnap.empty) {
            const seenEndpoints = new Set<string>();
            subscriptions = subsSnap.docs
              .map((d) => d.data() as PushSubscriptionDoc)
              .filter((s) => {
                if (!s.active || !s.endpoint || seenEndpoints.has(s.endpoint)) return false;
                seenEndpoints.add(s.endpoint);
                return true;
              });
          }

          // If student opted out, do not count or expose ready devices for delivery
          if (consentState === 'opt_out') {
            subscriptions = [];
          } else if (consentState === 'unset' && subscriptions.length > 0) {
            consentState = 'granted';
          }
        } catch {
          // Graceful fallback if subcollection read fails for a row
        }

        return {
          uid: p.uid,
          displayName: p.displayName || 'طالب / طالبة',
          email: p.email || '',
          avatarUrl: p.avatarUrl || '',
          groupCampId: p.groupCampId || '',
          consentState,
          subscriptions,
          readyDevicesCount: consentState === 'opt_out' ? 0 : subscriptions.length,
        };
      })
    );
    rows.push(...chunkRows);
  }

  return rows.sort((a, b) => {
    if (b.readyDevicesCount !== a.readyDevicesCount) {
      return b.readyDevicesCount - a.readyDevicesCount;
    }
    return a.displayName.localeCompare(b.displayName, 'ar');
  });
}

export async function sendAdminGroupBroadcast(params: {
  adminUid: string;
  idToken: string;
  gateToken: string;
  title: string;
  body: string;
  imageDataUrl: string;
  targetRoute: BroadcastTargetRoute;
  selectedStudents: StudentPushDirectoryRow[];
}): Promise<SendBroadcastResult> {
  const { adminUid, idToken, gateToken, title, body, imageDataUrl, targetRoute, selectedStudents } =
    params;

  const eligibleStudents = selectedStudents.filter(
    (s) => s.consentState !== 'opt_out' && s.subscriptions.length > 0
  );

  const uniqueEndpointMap = new Map<
    string,
    { uid: string; subId: string; endpoint: string; p256dh: string; auth: string }
  >();
  for (const student of eligibleStudents) {
    for (const sub of student.subscriptions) {
      if (!sub.active || !sub.endpoint) continue;
      if (!uniqueEndpointMap.has(sub.endpoint)) {
        uniqueEndpointMap.set(sub.endpoint, {
          uid: student.uid,
          subId: sub.id,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        });
      }
    }
  }

  const targets = Array.from(uniqueEndpointMap.values());
  if (targets.length === 0) {
    throw new Error('مفيش ولا جهاز من الشباب والبنات اللي اخترتهم مفعّل الإشعارات أو عامل سماح ليها.');
  }

  const notifId = generateSafeId('bcast');
  const notifRef = doc(db, 'adminBroadcastNotifications', notifId);
  const trimmedTitle = title.trim().slice(0, 120);
  const trimmedBody = body.trim().slice(0, 500);
  const trimmedImage = imageDataUrl.trim().slice(0, 180000);

  // 1. Create permanent record in Firestore first so any delivery/open ack references a valid doc
  await setDoc(notifRef, {
    id: notifId,
    createdByUid: adminUid,
    title: trimmedTitle,
    body: trimmedBody,
    imageUrl: trimmedImage,
    targetRoute,
    recipientCount: eligibleStudents.length,
    targetedDevicesCount: targets.length,
    acceptedCount: 0,
    failedCount: 0,
    staleRemovedCount: 0,
    openedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Dispatch through trusted Express server (holds VAPID private key)
  const resp = await fetch('/api/admin/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
      'X-Admin-Gate-Token': gateToken,
    },
    body: JSON.stringify({
      notificationId: notifId,
      title: trimmedTitle,
      body: trimmedBody,
      imageDataUrl: trimmedImage,
      targetRoute,
      targets,
    }),
  });

  const result = (await resp.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        totalUniqueDevices?: number;
        acceptedCount?: number;
        failedCount?: number;
        staleTargets?: { uid: string; subId: string }[];
        persistentVapid?: boolean;
      }
    | null;

  if (!resp.ok || !result?.ok) {
    await updateDoc(notifRef, {
      failedCount: targets.length,
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
    throw new Error(result?.error || 'معرفناش نبعت الإشعار من السيرفر دلوقتي.');
  }

  const staleTargets = Array.isArray(result.staleTargets) ? result.staleTargets : [];

  // 3. Remove stale/expired (404/410) device subscriptions cleanly from Firestore
  if (staleTargets.length > 0) {
    await Promise.all(
      staleTargets.map((t) => deleteStudentPushSubscription(t.uid, t.subId))
    );
  }

  const acceptedCount = Number(result.acceptedCount) || 0;
  const failedCount = Number(result.failedCount) || 0;
  const staleRemovedCount = staleTargets.length;

  await updateDoc(notifRef, {
    acceptedCount,
    failedCount,
    staleRemovedCount,
    updatedAt: serverTimestamp(),
  });

  return {
    notificationId: notifId,
    totalUniqueDevices: Number(result.totalUniqueDevices) || targets.length,
    acceptedCount,
    failedCount,
    staleRemovedCount,
    persistentVapid: Boolean(result.persistentVapid),
  };
}

export async function fetchAdminBroadcastHistory(params: {
  idToken: string;
  gateToken: string;
}): Promise<{ items: BroadcastHistoryItem[]; persistentVapid: boolean }> {
  const { idToken, gateToken } = params;
  const snap = await getDocs(
    query(
      collection(db, 'adminBroadcastNotifications'),
      orderBy('createdAt', 'desc'),
      limit(30)
    )
  );

  const notifications = snap.docs.map((d) => d.data() as AdminBroadcastNotification);
  if (notifications.length === 0) {
    try {
      const pubRes = await fetch('/api/push/public-key');
      const pubData = (await pubRes.json()) as { persistent?: boolean };
      return { items: [], persistentVapid: Boolean(pubData.persistent) };
    } catch {
      return { items: [], persistentVapid: false };
    }
  }

  // Fetch server-side SW ack stats & Firestore deliveries subcollection counts in parallel
  const idsQuery = encodeURIComponent(notifications.map((n) => n.id).join(','));
  const [serverStatsResult, deliveriesCounts] = await Promise.all([
    fetch(`/api/admin/push/stats?ids=${idsQuery}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
        'X-Admin-Gate-Token': gateToken,
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{
      stats?: Record<string, { deliveredCount: number; openedCount: number }>;
      persistent?: boolean;
    } | null>,
    Promise.all(
      notifications.map(async (n) => {
        try {
          const delSnap = await getDocs(
            collection(db, 'adminBroadcastNotifications', n.id, 'deliveries')
          );
          return delSnap.size;
        } catch {
          return 0;
        }
      })
    ),
  ]);

  const statsMap = serverStatsResult?.stats || {};
  const items: BroadcastHistoryItem[] = notifications.map((n, idx) => {
    const s = statsMap[n.id];
    const firestoreConfirmedCount = deliveriesCounts[idx] || 0;
    const serverDeliveredCount = Math.max(s?.deliveredCount || 0, firestoreConfirmedCount);
    const serverOpenedCount = Math.max(s?.openedCount || 0, firestoreConfirmedCount);
    return {
      notification: n,
      firestoreConfirmedCount,
      serverDeliveredCount,
      serverOpenedCount,
    };
  });

  return {
    items,
    persistentVapid: Boolean(serverStatsResult?.persistent),
  };
}

export async function fetchSingleBroadcastNotification(
  notifId: string
): Promise<AdminBroadcastNotification | null> {
  if (!notifId || !/^[a-zA-Z0-9_-]{3,128}$/.test(notifId)) return null;
  try {
    const snap = await getDoc(doc(db, 'adminBroadcastNotifications', notifId));
    if (!snap.exists()) return null;
    return snap.data() as AdminBroadcastNotification;
  } catch {
    return null;
  }
}

export async function recordBroadcastDeliveryReceipt(params: {
  notificationId: string;
  uid: string;
  subscriptionId: string;
  status: 'delivered' | 'opened';
}): Promise<void> {
  const { notificationId, uid, subscriptionId, status } = params;
  if (!notificationId || !uid || !subscriptionId) return;
  if (
    !/^[a-zA-Z0-9_-]{3,128}$/.test(notificationId) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(subscriptionId)
  ) {
    return;
  }
  const deliveryId = `${uid}_${subscriptionId}`.slice(0, 128);
  const ref = doc(db, 'adminBroadcastNotifications', notificationId, 'deliveries', deliveryId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data() as BroadcastDeliveryReceipt;
      if (data.status === 'opened' || status === 'delivered') return;
      await updateDoc(ref, {
        status: 'opened',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: deliveryId,
        notificationId,
        uid,
        subscriptionId,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Non-fatal receipt write
  }
}
