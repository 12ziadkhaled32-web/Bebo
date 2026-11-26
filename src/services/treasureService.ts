import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { generateSafeId } from '../lib/campUtils';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ActiveIslamicTreasureDoc, IslamicTreasureDoc } from '../types/camp';

export const TREASURE_FIELD_LIMITS = {
  QUESTION_LEAD_MAX: 120,
  FACT_LINE_MAX: 300,
  EVIDENCE_TEXT_MAX: 500,
  EVIDENCE_REF_MAX: 120,
  CLOSING_NOTE_MAX: 200,
} as const;

export const ACTIVE_TREASURE_DOC_ID = 'activeIslamicTreasure' as const;

function clampStr(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function subscribeToActiveIslamicTreasure(
  onData: (docData: ActiveIslamicTreasureDoc | null) => void
): () => void {
  if (!auth.currentUser) {
    onData(null);
    return () => {};
  }

  const path = `platformContent/${ACTIVE_TREASURE_DOC_ID}`;
  return onSnapshot(
    doc(db, 'platformContent', ACTIVE_TREASURE_DOC_ID),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as ActiveIslamicTreasureDoc);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function adminFetchAllIslamicTreasures(): Promise<IslamicTreasureDoc[]> {
  const path = 'islamicTreasures';
  try {
    const snap = await getDocs(
      query(collection(db, 'islamicTreasures'), orderBy('updatedAt', 'desc'), limit(100))
    );
    return snap.docs.map((d) => d.data() as IslamicTreasureDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminFetchActiveIslamicTreasure(): Promise<ActiveIslamicTreasureDoc | null> {
  const path = `platformContent/${ACTIVE_TREASURE_DOC_ID}`;
  try {
    const snap = await getDoc(doc(db, 'platformContent', ACTIVE_TREASURE_DOC_ID));
    if (!snap.exists()) return null;
    return snap.data() as ActiveIslamicTreasureDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export interface SaveIslamicTreasureInput {
  treasureId?: string;
  adminUid: string;
  questionLead: string;
  factLine1: string;
  factLine2: string;
  evidenceText: string;
  evidenceRef: string;
  closingNote: string;
  publishNow: boolean;
}

export async function adminSaveIslamicTreasure(
  input: SaveIslamicTreasureInput
): Promise<IslamicTreasureDoc> {
  const id = input.treasureId?.trim() || generateSafeId('tr');
  const questionLead =
    clampStr(input.questionLead, TREASURE_FIELD_LIMITS.QUESTION_LEAD_MAX) || 'هل كنت تعرف ؟';
  const factLine1 = clampStr(input.factLine1, TREASURE_FIELD_LIMITS.FACT_LINE_MAX);
  const factLine2 = clampStr(input.factLine2, TREASURE_FIELD_LIMITS.FACT_LINE_MAX);
  const evidenceText = clampStr(input.evidenceText, TREASURE_FIELD_LIMITS.EVIDENCE_TEXT_MAX);
  const evidenceRef = clampStr(input.evidenceRef, TREASURE_FIELD_LIMITS.EVIDENCE_REF_MAX);
  const closingNote = clampStr(input.closingNote, TREASURE_FIELD_LIMITS.CLOSING_NOTE_MAX);

  if (!factLine1) {
    throw new Error('اكتب نص المعلومة الدينية الأول قبل الحفظ.');
  }

  const path = `islamicTreasures/${id}`;
  try {
    const treasureRef = doc(db, 'islamicTreasures', id);
    const activeRef = doc(db, 'platformContent', ACTIVE_TREASURE_DOC_ID);
    const existingSnap = await getDoc(treasureRef);
    const existingActiveDocs = await getDocs(
      query(collection(db, 'islamicTreasures'), where('isActive', '==', true))
    );

    const batch = writeBatch(db);

    if (input.publishNow) {
      for (const activeDoc of existingActiveDocs.docs) {
        if (activeDoc.id !== id) {
          batch.update(activeDoc.ref, {
            isActive: false,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    if (existingSnap.exists()) {
      batch.update(treasureRef, {
        questionLead,
        factLine1,
        factLine2,
        evidenceText,
        evidenceRef,
        closingNote,
        isActive: input.publishNow,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(treasureRef, {
        id,
        questionLead,
        factLine1,
        factLine2,
        evidenceText,
        evidenceRef,
        closingNote,
        isActive: input.publishNow,
        createdByUid: input.adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (input.publishNow) {
      batch.set(activeRef, {
        id: ACTIVE_TREASURE_DOC_ID,
        treasureId: id,
        questionLead,
        factLine1,
        factLine2,
        evidenceText,
        evidenceRef,
        closingNote,
        updatedByUid: input.adminUid,
        updatedAt: serverTimestamp(),
      });
    } else if (existingSnap.exists() && (existingSnap.data() as IslamicTreasureDoc).isActive) {
      batch.delete(activeRef);
    }

    await batch.commit();

    const savedSnap = await getDoc(treasureRef);
    return savedSnap.data() as IslamicTreasureDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminActivateIslamicTreasure(params: {
  treasure: IslamicTreasureDoc;
  adminUid: string;
}): Promise<void> {
  const { treasure, adminUid } = params;
  const path = `platformContent/${ACTIVE_TREASURE_DOC_ID}`;
  try {
    const existingActiveDocs = await getDocs(
      query(collection(db, 'islamicTreasures'), where('isActive', '==', true))
    );
    const batch = writeBatch(db);

    for (const activeDoc of existingActiveDocs.docs) {
      if (activeDoc.id !== treasure.id) {
        batch.update(activeDoc.ref, {
          isActive: false,
          updatedAt: serverTimestamp(),
        });
      }
    }

    batch.update(doc(db, 'islamicTreasures', treasure.id), {
      isActive: true,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'platformContent', ACTIVE_TREASURE_DOC_ID), {
      id: ACTIVE_TREASURE_DOC_ID,
      treasureId: treasure.id,
      questionLead: clampStr(treasure.questionLead, TREASURE_FIELD_LIMITS.QUESTION_LEAD_MAX) || 'هل كنت تعرف ؟',
      factLine1: clampStr(treasure.factLine1, TREASURE_FIELD_LIMITS.FACT_LINE_MAX),
      factLine2: clampStr(treasure.factLine2, TREASURE_FIELD_LIMITS.FACT_LINE_MAX),
      evidenceText: clampStr(treasure.evidenceText, TREASURE_FIELD_LIMITS.EVIDENCE_TEXT_MAX),
      evidenceRef: clampStr(treasure.evidenceRef, TREASURE_FIELD_LIMITS.EVIDENCE_REF_MAX),
      closingNote: clampStr(treasure.closingNote, TREASURE_FIELD_LIMITS.CLOSING_NOTE_MAX),
      updatedByUid: adminUid,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminDeactivateIslamicTreasure(): Promise<void> {
  const path = `platformContent/${ACTIVE_TREASURE_DOC_ID}`;
  try {
    const existingActiveDocs = await getDocs(
      query(collection(db, 'islamicTreasures'), where('isActive', '==', true))
    );
    const batch = writeBatch(db);

    for (const activeDoc of existingActiveDocs.docs) {
      batch.update(activeDoc.ref, {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    }

    batch.delete(doc(db, 'platformContent', ACTIVE_TREASURE_DOC_ID));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function adminDeleteIslamicTreasure(treasure: IslamicTreasureDoc): Promise<void> {
  const path = `islamicTreasures/${treasure.id}`;
  try {
    const activeSnap = await getDoc(doc(db, 'platformContent', ACTIVE_TREASURE_DOC_ID));
    const batch = writeBatch(db);
    batch.delete(doc(db, 'islamicTreasures', treasure.id));

    if (
      treasure.isActive ||
      (activeSnap.exists() &&
        (activeSnap.data() as ActiveIslamicTreasureDoc).treasureId === treasure.id)
    ) {
      batch.delete(doc(db, 'platformContent', ACTIVE_TREASURE_DOC_ID));
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
