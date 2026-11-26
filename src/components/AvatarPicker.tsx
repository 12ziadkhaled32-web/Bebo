import React, { useRef, useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, Upload } from 'lucide-react';
import { compressAvatarFile, isPersonalAvatarUrl } from '../lib/avatarUtils';
import { AvatarImage } from './Decorations';

interface AvatarPickerProps {
  value: string;
  displayName: string;
  onChange: (nextUrl: string) => void;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  value,
  displayName,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const hasValidPhoto = isPersonalAvatarUrl(value);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setProcessing(true);
    try {
      const compressed = await compressAvatarFile(file);
      onChange(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'مقدرناش نرفع الصورة دلوقتي.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileSelected}
        className="hidden"
      />

      <div
        className={`rounded-2xl p-4 border transition-all flex flex-wrap items-center justify-between gap-3 ${
          hasValidPhoto
            ? 'bg-gradient-to-br from-emerald-50/85 via-teal-50/60 to-cyan-50/75 dark:from-emerald-950/35 dark:via-slate-900/90 dark:to-cyan-950/35 border-emerald-300/80 dark:border-emerald-500/40'
            : 'bg-gradient-to-br from-pink-50/90 via-purple-50/70 to-amber-50/75 dark:from-slate-900/90 dark:via-purple-950/45 dark:to-rose-950/35 border-rose-300/80 dark:border-fuchsia-500/35'
        }`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {hasValidPhoto ? (
            <div className="relative shrink-0">
              <AvatarImage
                src={value}
                name={displayName || 'صورتك الشخصية'}
                sizeClass="w-16 h-16"
                ringClass="ring-2 ring-emerald-400 dark:ring-emerald-500/80"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
                title="غيّر / غيّري صورتك الشخصية"
                className="absolute -bottom-1 -left-1 w-7 h-7 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform cursor-pointer disabled:opacity-60"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              title="دوس / دوسي علشان ترفع صورتك الشخصية"
              className="w-16 h-16 rounded-2xl border-2 border-dashed border-rose-400/80 dark:border-pink-400/60 bg-white/80 dark:bg-slate-900/75 text-rose-500 dark:text-pink-300 flex flex-col items-center justify-center gap-1 shrink-0 hover:bg-rose-50 dark:hover:bg-pink-950/40 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Camera className="w-6 h-6" />
              <span className="text-[10px] font-bold">ارفع صورة</span>
            </button>
          )}

          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
              <span>صورتك الشخصية</span>
              {hasValidPhoto ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/75 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  الصورة اترفعت
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/75 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                  <Upload className="w-2.5 h-2.5" />
                  مطلوبة إجباري
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
              {hasValidPhoto
                ? 'تقدر أو تقدري تغيّروا الصورة في أي وقت بصورة جديدة من جهازك.'
                : 'ارفع / ارفعي صورتك الشخصية الواضحة من جهازك علشان نعرفك في الامتحانات.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:brightness-105 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
        >
          <ImagePlus className="w-4 h-4" />
          <span>
            {processing
              ? 'بنجهّز الصورة...'
              : hasValidPhoto
              ? 'غيّر الصورة'
              : 'ارفع / ارفعي صورة من جهازك'}
          </span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
};
