import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { GROUP_CAMP_LIMITS } from '../constants/campConfig';
import { generateSafeId } from './campUtils';
import { storage } from './firebase';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface UploadedGroupImageResult {
  url: string;
  storagePath: string;
  storageProvider: 'firebase_storage' | 'inline_compressed';
}

function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    throw new Error('نوع الصورة مش مدعوم، ارفع / ارفعي صورة JPG أو PNG أو WEBP بس.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('حجم الصورة كبير أوي، أقصى حاجة مسموحة 10 ميجابايت.');
  }
}

async function compressHighClarityImage(file: File, maxChars: number): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('معرفناش نقرأ الصورة دي.'));
      el.src = objectUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) {
      throw new Error('مقاس الصورة مش مظبوط.');
    }

    const widths = [1200, 960, 760, 560, 420];
    const qualities = [0.88, 0.78, 0.68, 0.56, 0.45];

    for (const maxW of widths) {
      const scale = Math.min(1, maxW / natW);
      const targetW = Math.max(1, Math.round(natW * scale));
      const targetH = Math.max(1, Math.round(natH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('المتصفح مش بيدعم تعديل الصور للأسف.');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const preferredType = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL(preferredType, quality);
        if (dataUrl.length <= maxChars) {
          return dataUrl;
        }
        const jpegFallback = canvas.toDataURL('image/jpeg', quality);
        if (jpegFallback.length <= maxChars) {
          return jpegFallback;
        }
      }
    }

    throw new Error('حجم الصورة بعد الضغط لسه كبير، اختار / اختاري صورة أصغر وأوضح.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getFileExtension(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export async function uploadGroupCampCoverImage(params: {
  file: File;
  campId: string;
}): Promise<UploadedGroupImageResult> {
  validateImageFile(params.file);
  const ext = getFileExtension(params.file);
  const storagePath = `groupCamps/${params.campId}/cover/${generateSafeId('cov')}.${ext}`;

  try {
    const storageRef = ref(storage, storagePath);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('storage_timeout')), 8000)
    );
    await Promise.race([
      uploadBytes(storageRef, params.file, { contentType: params.file.type }),
      timeoutPromise,
    ]);
    const url = await getDownloadURL(storageRef);
    return { url, storagePath, storageProvider: 'firebase_storage' };
  } catch {
    const dataUrl = await compressHighClarityImage(params.file, GROUP_CAMP_LIMITS.COVER_URL_MAX);
    return {
      url: dataUrl,
      storagePath: '',
      storageProvider: 'inline_compressed',
    };
  }
}

export async function uploadExamQuestionImage(params: {
  file: File;
  campId: string;
  examId: string;
  questionId: string;
}): Promise<UploadedGroupImageResult> {
  validateImageFile(params.file);
  const ext = getFileExtension(params.file);
  const storagePath = `groupCamps/${params.campId}/exams/${params.examId}/questions/${params.questionId}_${Date.now()}.${ext}`;

  try {
    const storageRef = ref(storage, storagePath);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('storage_timeout')), 8000)
    );
    await Promise.race([
      uploadBytes(storageRef, params.file, { contentType: params.file.type }),
      timeoutPromise,
    ]);
    const url = await getDownloadURL(storageRef);
    return { url, storagePath, storageProvider: 'firebase_storage' };
  } catch {
    const dataUrl = await compressHighClarityImage(
      params.file,
      GROUP_CAMP_LIMITS.QUESTION_IMAGE_URL_MAX
    );
    return {
      url: dataUrl,
      storagePath: '',
      storageProvider: 'inline_compressed',
    };
  }
}

export async function deleteStoredGroupImage(storagePath?: string): Promise<void> {
  if (!storagePath || !storagePath.trim()) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // Non-fatal if already removed or Storage is not activated
  }
}
