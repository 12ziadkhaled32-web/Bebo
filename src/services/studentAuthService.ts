import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  buildPrimarySyntheticEmail,
  buildRecoveryAliasEmail,
  computeRecoverySecretHash,
  mapStudentAuthError,
  SECURITY_QUESTIONS,
  toE164EgyptianPhone,
  toPhoneDigitsKey,
} from '../lib/phoneAuthUtils';
import { GroupCampMember, StudentExamHistoryEntry, UserProfile } from '../types/camp';

export async function resolveLoginAuthEmail(local01: string): Promise<string> {
  const phoneDigits = toPhoneDigitsKey(local01);
  try {
    const aliasSnap = await getDoc(doc(db, 'phoneLoginAliases', phoneDigits));
    if (aliasSnap.exists()) {
      const data = aliasSnap.data() as { authEmail?: string };
      if (typeof data.authEmail === 'string' && data.authEmail.includes('@phone.moaskar.app')) {
        return data.authEmail;
      }
    }
  } catch {
    // Fallback cleanly to primary deterministic phone email
  }
  return buildPrimarySyntheticEmail(local01);
}

export async function fetchSecurityQuestionForPhone(local01: string): Promise<{
  exists: boolean;
  question: string;
}> {
  const phoneDigits = toPhoneDigitsKey(local01);
  const aliasSnap = await getDoc(doc(db, 'phoneLoginAliases', phoneDigits));
  if (!aliasSnap.exists()) {
    return { exists: false, question: '' };
  }
  const data = aliasSnap.data() as { securityQuestion?: string };
  const question = typeof data.securityQuestion === 'string' ? data.securityQuestion.trim() : '';
  return {
    exists: Boolean(question),
    question,
  };
}

export async function signUpStudentWithPhonePassword(params: {
  local01: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
}): Promise<User> {
  const { local01, password, securityQuestion, securityAnswer } = params;
  const phoneDigits = toPhoneDigitsKey(local01);
  const safeQuestion = securityQuestion.trim() || SECURITY_QUESTIONS[0];

  try {
    const aliasSnap = await getDoc(doc(db, 'phoneLoginAliases', phoneDigits));
    if (aliasSnap.exists()) {
      throw new Error('رقم الموبايل ده متسجل قبل كده بالفعل. سجّل / سجّلي دخولك أو اضغط نسيت كلمة السر.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('متسجل قبل كده')) {
      throw err;
    }
  }

  const secretHash = await computeRecoverySecretHash(phoneDigits, securityAnswer);
  const primaryEmail = buildPrimarySyntheticEmail(local01);

  let createdUser: User;
  try {
    const cred = await createUserWithEmailAndPassword(auth, primaryEmail, password);
    createdUser = cred.user;
  } catch (err) {
    throw new Error(mapStudentAuthError(err));
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'phoneRecoverySecrets', phoneDigits), {
      phoneDigits,
      ownerUid: createdUser.uid,
      secretHash,
      proofHash: secretHash,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'phoneLoginAliases', phoneDigits), {
      phoneDigits,
      authEmail: primaryEmail,
      ownerUid: createdUser.uid,
      securityQuestion: safeQuestion.slice(0, 160),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return createdUser;
  } catch (err) {
    try {
      await deleteUser(createdUser);
    } catch {
      // Ignore cleanup failures
    }
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut failures
    }
    throw new Error(mapStudentAuthError(err));
  }
}

export async function signInStudentWithPhonePassword(
  local01: string,
  password: string
): Promise<User> {
  try {
    const authEmail = await resolveLoginAuthEmail(local01);
    const cred = await signInWithEmailAndPassword(auth, authEmail, password);
    return cred.user;
  } catch (err) {
    throw new Error(mapStudentAuthError(err));
  }
}

export async function saveStudentSecurityQuestion(params: {
  user: User;
  local01: string;
  securityQuestion: string;
  securityAnswer: string;
}): Promise<void> {
  const { user, local01, securityQuestion, securityAnswer } = params;
  const phoneDigits = toPhoneDigitsKey(local01);
  const safeQuestion = (securityQuestion.trim() || SECURITY_QUESTIONS[0]).slice(0, 160);
  const secretHash = await computeRecoverySecretHash(phoneDigits, securityAnswer);

  const aliasRef = doc(db, 'phoneLoginAliases', phoneDigits);
  const secretRef = doc(db, 'phoneRecoverySecrets', phoneDigits);
  const aliasSnap = await getDoc(aliasRef);

  const batch = writeBatch(db);
  if (!aliasSnap.exists()) {
    batch.set(secretRef, {
      phoneDigits,
      ownerUid: user.uid,
      secretHash,
      proofHash: secretHash,
      updatedAt: serverTimestamp(),
    });
    batch.set(aliasRef, {
      phoneDigits,
      authEmail: user.email || buildPrimarySyntheticEmail(local01),
      ownerUid: user.uid,
      securityQuestion: safeQuestion,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(secretRef, {
      phoneDigits,
      ownerUid: user.uid,
      secretHash,
      proofHash: secretHash,
      updatedAt: serverTimestamp(),
    });
    batch.update(aliasRef, {
      securityQuestion: safeQuestion,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function resetPasswordWithSecurityAnswer(params: {
  local01: string;
  securityAnswer: string;
  newPassword: string;
}): Promise<{ migratedProfile: UserProfile | null }> {
  const { local01, securityAnswer, newPassword } = params;
  const phoneDigits = toPhoneDigitsKey(local01);
  const phoneE164 = toE164EgyptianPhone(local01);

  const aliasRef = doc(db, 'phoneLoginAliases', phoneDigits);
  const aliasSnap = await getDoc(aliasRef);
  if (!aliasSnap.exists()) {
    throw new Error('رقم الموبايل ده مش مسجل معاه سؤال أمان. اتأكد من الرقم أو اتواصل مع أدمن المعسكر.');
  }

  const aliasData = aliasSnap.data() as {
    ownerUid?: string;
    securityQuestion?: string;
  };
  const oldUid = (aliasData.ownerUid || '').trim();
  const safeQuestion = (aliasData.securityQuestion || SECURITY_QUESTIONS[0]).trim();
  const candidateHash = await computeRecoverySecretHash(phoneDigits, securityAnswer);
  const aliasEmail = buildRecoveryAliasEmail(local01);

  let recoveryUser: User;
  try {
    const cred = await createUserWithEmailAndPassword(auth, aliasEmail, newPassword);
    recoveryUser = cred.user;
  } catch (err) {
    throw new Error(mapStudentAuthError(err));
  }

  // Step A: Prove knowledge of the secretHash against the non-readable vault doc
  try {
    await updateDoc(doc(db, 'phoneRecoverySecrets', phoneDigits), {
      ownerUid: recoveryUser.uid,
      proofHash: candidateHash,
      secretHash: candidateHash,
      updatedAt: serverTimestamp(),
    });
  } catch {
    try {
      await deleteUser(recoveryUser);
    } catch {
      // Ignore cleanup failures
    }
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut failures
    }
    throw new Error('إجابة سؤال الأمان غلط.. راجعها واتأكد منها وجرب تاني.');
  }

  // Step B: Migrate examHistory while userProfiles/{oldUid} still exists
  if (oldUid && oldUid !== recoveryUser.uid) {
    try {
      const oldHistorySnap = await getDocs(
        collection(db, 'userProfiles', oldUid, 'examHistory')
      );
      if (!oldHistorySnap.empty) {
        const docs = oldHistorySnap.docs;
        for (let i = 0; i < docs.length; i += 200) {
          const chunk = docs.slice(i, i + 200);
          const batch = writeBatch(db);
          chunk.forEach((histDoc) => {
            const data = histDoc.data() as StudentExamHistoryEntry;
            batch.set(doc(db, 'userProfiles', recoveryUser.uid, 'examHistory', histDoc.id), {
              ...data,
              uid: recoveryUser.uid,
              createdAt: serverTimestamp(),
            });
            batch.delete(histDoc.ref);
          });
          await batch.commit();
        }
      }
    } catch (err) {
      console.warn('Could not migrate examHistory during recovery:', err);
    }
  }

  // Step C: Atomically migrate userProfile + groupCamp member slot & update phoneLoginAliases
  await runTransaction(db, async (tx) => {
    const newProfileRef = doc(db, 'userProfiles', recoveryUser.uid);

    if (oldUid && oldUid !== recoveryUser.uid) {
      const oldProfileRef = doc(db, 'userProfiles', oldUid);
      const oldProfileSnap = await tx.get(oldProfileRef);

      if (oldProfileSnap.exists()) {
        const oldProfile = oldProfileSnap.data() as UserProfile;
        const targetGroupCampId = (oldProfile.groupCampId || '').trim();
        let restoredGroupCampId = '';

        let oldMemberData: GroupCampMember | null = null;
        let oldMemberRef: ReturnType<typeof doc> | null = null;
        let newMemberRef: ReturnType<typeof doc> | null = null;

        if (targetGroupCampId) {
          const campRef = doc(db, 'groupCamps', targetGroupCampId);
          oldMemberRef = doc(db, 'groupCamps', targetGroupCampId, 'members', oldUid);
          newMemberRef = doc(db, 'groupCamps', targetGroupCampId, 'members', recoveryUser.uid);
          const [campSnap, oldMemberSnap] = await Promise.all([
            tx.get(campRef),
            tx.get(oldMemberRef),
          ]);
          if (campSnap.exists() && oldMemberSnap.exists()) {
            restoredGroupCampId = targetGroupCampId;
            oldMemberData = oldMemberSnap.data() as GroupCampMember;
          }
        }

        tx.set(newProfileRef, {
          uid: recoveryUser.uid,
          displayName: oldProfile.displayName,
          avatarUrl: oldProfile.avatarUrl,
          campId: '',
          email: aliasEmail,
          phone: phoneE164,
          groupCampId: restoredGroupCampId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (restoredGroupCampId && oldMemberData && oldMemberRef && newMemberRef) {
          tx.set(newMemberRef, {
            ...oldMemberData,
            uid: recoveryUser.uid,
            campId: restoredGroupCampId,
            joinedAt: oldMemberData.joinedAt,
            updatedAt: serverTimestamp(),
          });
          tx.delete(oldMemberRef);
        }

        tx.delete(oldProfileRef);
      }
    }

    tx.update(aliasRef, {
      authEmail: aliasEmail,
      ownerUid: recoveryUser.uid,
      securityQuestion: safeQuestion.slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  });

  const refreshedSnap = await getDoc(doc(db, 'userProfiles', recoveryUser.uid));
  return {
    migratedProfile: refreshedSnap.exists() ? (refreshedSnap.data() as UserProfile) : null,
  };
}
