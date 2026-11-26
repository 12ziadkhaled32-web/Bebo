const ALLOWED_PUSH_MIME = new Set(['image/jpeg', 'image/png']);
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 150_000;

export async function compressBroadcastNotificationImage(file: File): Promise<string> {
  if (!ALLOWED_PUSH_MIME.has(file.type)) {
    throw new Error('نوع الصورة مش مدعوم، اختار / اختاري صورة JPG أو PNG بس.');
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error('حجم الصورة كبير أوي، أقصى حاجة مسموحة 10 ميجابايت.');
  }

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

    const widths = [1024, 800, 640, 480];
    const qualities = [0.86, 0.76, 0.66, 0.54, 0.42];

    for (const maxW of widths) {
      const scale = Math.min(1, maxW / natW);
      const targetW = Math.max(1, Math.round(natW * scale));
      const targetH = Math.max(1, Math.round(natH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('المتصفح مش بيدعم ضغط الصور للأسف.');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const preferredType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      if (preferredType === 'image/png') {
        const pngData = canvas.toDataURL('image/png');
        if (pngData.length <= MAX_DATA_URL_CHARS) {
          return pngData;
        }
      }

      for (const quality of qualities) {
        const jpegData = canvas.toDataURL('image/jpeg', quality);
        if (jpegData.length <= MAX_DATA_URL_CHARS) {
          return jpegData;
        }
      }
    }

    throw new Error('الصورة لسه كبيرة حتى بعد الضغط، جرب / جربي صورة أصغر.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
