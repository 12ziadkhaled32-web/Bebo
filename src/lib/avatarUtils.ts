import { FIELD_LIMITS } from '../constants/campConfig';

/**
 * Center-crops and compresses an uploaded image file to a square JPEG/WebP Data URL
 * guaranteed to fit within FIELD_LIMITS.AVATAR_URL_MAX for safe Firestore storage.
 */
export async function compressAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('اختار / اختاري ملف صورة صح (JPG, PNG, WebP).');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('حجم الصورة كبير أوي، اختار / اختاري صورة أصغر من 12 ميجابايت.');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('مش عارفين نقرأ ملف الصورة، جرب / جربي صورة تانية.'));
      el.src = imageUrl;
    });

    const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!side || side <= 0) {
      throw new Error('مقاس الصورة مش مظبوط.');
    }

    const sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - side) / 2));
    const sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - side) / 2));

    const sizes = [160, 128, 96];
    const qualities = [0.82, 0.7, 0.55];

    for (const targetSize of sizes) {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('المتصفح مش بيدعم تعديل الصور للأسف.');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetSize, targetSize);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= FIELD_LIMITS.AVATAR_URL_MAX) {
          return dataUrl;
        }
      }
    }

    throw new Error('معرفناش نضغط الصورة للحجم المطلوب، اختار / اختاري صورة تانية.');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function isValidCustomAvatarInput(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > FIELD_LIMITS.AVATAR_URL_MAX) return false;
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/src/assets/') ||
    trimmed.startsWith('data:image/jpeg;base64,') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,')
  );
}

export function isPersonalAvatarUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > FIELD_LIMITS.AVATAR_URL_MAX) return false;
  if (trimmed.startsWith('/src/assets/')) return false;
  if (trimmed.includes('googleusercontent.com')) return false;
  return (
    trimmed.startsWith('data:image/jpeg;base64,') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,') ||
    trimmed.startsWith('https://')
  );
}

export function normalizeTripleName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function getValidNameParts(raw: string): string[] {
  return normalizeTripleName(raw)
    .split(' ')
    .filter((part) => part.length >= 2);
}

export function getTripleNameValidationError(raw: string): string | null {
  const normalized = normalizeTripleName(raw);
  if (!normalized) {
    return 'لازم تكتب / تكتبي اسمك ثلاثي بالكامل (3 كلمات على الأقل).';
  }
  const allParts = normalized.split(' ').filter(Boolean);
  if (allParts.length < 3) {
    return 'اكتب / اكتبي الاسم ثلاثي بالكامل (3 كلمات على الأقل، زي: محمد أحمد علي أو سارة محمود إبراهيم).';
  }
  if (allParts.some((part) => part.length < 2)) {
    return 'اتأكد / اتأكدي إن كل كلمة في الاسم الثلاثي فيها حرفين على الأقل.';
  }
  if (normalized.length > FIELD_LIMITS.DISPLAY_NAME_MAX) {
    return `الاسم طويل أوي، أقصى حد ${FIELD_LIMITS.DISPLAY_NAME_MAX} حرف.`;
  }
  return null;
}

async function compressLandscapeImageFile(file: File, maxLength: number): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('اختار / اختاري ملف صورة صح (JPG, PNG, WebP).');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('حجم الصورة كبير أوي، اختار / اختاري صورة أصغر من 12 ميجابايت.');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('مش عارفين نقرأ ملف الصورة، جرب / جربي صورة تانية.'));
      el.src = imageUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) {
      throw new Error('مقاس الصورة مش مظبوط.');
    }

    const maxWidths = [560, 420, 320];
    const qualities = [0.78, 0.65, 0.5];

    for (const maxW of maxWidths) {
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

      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= maxLength) {
          return dataUrl;
        }
      }
    }

    throw new Error('معرفناش نضغط الصورة للحجم المطلوب، اختار / اختاري صورة تانية.');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function isValidImageInputWithLimit(url: string, maxLength: number): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.length > maxLength) return false;
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/src/assets/') ||
    trimmed.startsWith('data:image/jpeg;base64,') ||
    trimmed.startsWith('data:image/png;base64,') ||
    trimmed.startsWith('data:image/webp;base64,')
  );
}

/**
 * Scales and compresses a task-card background image into a lightweight JPEG Data URL
 * guaranteed to fit within FIELD_LIMITS.TASK_BG_URL_MAX.
 */
export async function compressTaskBgFile(file: File): Promise<string> {
  return compressLandscapeImageFile(file, FIELD_LIMITS.TASK_BG_URL_MAX);
}

export function isValidTaskBgInput(url: string): boolean {
  return isValidImageInputWithLimit(url, FIELD_LIMITS.TASK_BG_URL_MAX);
}

/**
 * Scales and compresses the camp dashboard hero image into a lightweight JPEG Data URL
 * guaranteed to fit within FIELD_LIMITS.CAMP_HERO_URL_MAX.
 */
export async function compressHeroImageFile(file: File): Promise<string> {
  return compressLandscapeImageFile(file, FIELD_LIMITS.CAMP_HERO_URL_MAX);
}

export function isValidHeroImageInput(url: string): boolean {
  return isValidImageInputWithLimit(url, FIELD_LIMITS.CAMP_HERO_URL_MAX);
}

/**
 * Scales and compresses a question/reply photo into a clear JPEG Data URL
 * guaranteed to fit within FIELD_LIMITS.QUESTION_IMAGE_URL_MAX for Firestore storage.
 */
export async function compressQuestionImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('اختار / اختاري ملف صورة صح (JPG, PNG, WebP).');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('حجم الصورة كبير أوي، اختار / اختاري صورة أصغر من 12 ميجابايت.');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('مش عارفين نقرأ ملف الصورة، جرب / جربي صورة تانية.'));
      el.src = imageUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) {
      throw new Error('مقاس الصورة مش مظبوط.');
    }

    const maxWidths = [760, 600, 460, 340];
    const qualities = [0.82, 0.7, 0.56, 0.45];

    for (const maxW of maxWidths) {
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

      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= FIELD_LIMITS.QUESTION_IMAGE_URL_MAX) {
          return dataUrl;
        }
      }
    }

    throw new Error('معرفناش نضغط الصورة للحجم المطلوب، اختار / اختاري صورة تانية.');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function isValidQuestionImageInput(url: string): boolean {
  return isValidImageInputWithLimit(url, FIELD_LIMITS.QUESTION_IMAGE_URL_MAX);
}
