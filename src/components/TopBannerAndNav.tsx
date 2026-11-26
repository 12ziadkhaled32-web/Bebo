import React from 'react';
import {
  Gem,
  GraduationCap,
  HeartHandshake,
  LogOut,
  Moon,
  Settings2,
  Sun,
} from 'lucide-react';
import { UserProfile } from '../types/camp';
import { AvatarImage } from './Decorations';

interface TopBannerAndNavProps {
  profile: UserProfile;
  isLittleQuestionActive?: boolean;
  isAzkarActive?: boolean;
  onToggleAzkar: () => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const TopBannerAndNav: React.FC<TopBannerAndNavProps> = ({
  profile,
  isLittleQuestionActive = false,
  isAzkarActive = false,
  onToggleAzkar,
  onGoHome,
  onOpenSettings,
  onSignOut,
  theme,
  onToggleTheme,
}) => {
  const isLq = isLittleQuestionActive;

  return (
    <header
      className={`sticky top-0 z-30 transition-colors duration-300 ${
        isAzkarActive
          ? 'bg-[#17092a]/95 backdrop-blur-xl border-b border-amber-300/40 shadow-[0_10px_35px_rgba(168,85,247,0.35)]'
          : isLq
            ? 'bg-[#150621]/95 backdrop-blur-xl border-b border-fuchsia-400/25 shadow-[0_10px_35px_rgba(0,0,0,0.65)]'
            : 'glass-surface border-b border-pink-100/80 dark:border-fuchsia-500/20'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand Zone */}
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2 sm:gap-2.5 shrink-0 cursor-pointer group"
        >
          <div
            className={`w-9 h-9 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform ${
              isLq || isAzkarActive
                ? 'rounded-full bg-gradient-to-br from-[#e11d8a] via-[#a855f7] to-[#fbbf24] text-white ring-2 ring-amber-300/60 shadow-[0_0_16px_rgba(225,29,138,0.55)]'
                : 'rounded-xl bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 text-white'
            }`}
          >
            <HeartHandshake className="w-5 h-5" />
          </div>
          {isLq ? (
            <div className="flex flex-col items-start leading-tight">
              <span className="font-display font-black text-sm sm:text-base text-rose-50 tracking-wide whitespace-nowrap shrink-0">
                معسكر مغلق
              </span>
              <span className="text-[10px] font-bold text-amber-300/90 whitespace-nowrap">
                سؤال صغنن 🌸 · داخل المعسكر الجماعي ✨
              </span>
            </div>
          ) : (
            <span
              className={`font-display font-black text-base sm:text-xl whitespace-nowrap shrink-0 ${
                isAzkarActive
                  ? 'azkar-gold-foil'
                  : 'bg-gradient-to-l from-pink-600 via-purple-600 to-cyan-600 dark:from-pink-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent'
              }`}
            >
              معسكر مغلق
            </span>
          )}
        </button>

        {/* Center Group Camps Identity Label + Prominent Top Azkar Button */}
        <div className="flex items-center gap-2">
          <div
            className={`hidden lg:flex items-center gap-2 px-4 py-1.5 text-xs font-display font-bold whitespace-nowrap ${
              isLq || isAzkarActive
                ? 'rounded-full bg-[#220d34]/85 border border-fuchsia-300/25 text-amber-200'
                : 'rounded-xl bg-white/70 dark:bg-slate-800/75 border border-purple-200/80 dark:border-fuchsia-500/25 text-purple-700 dark:text-purple-200'
            }`}
          >
            <GraduationCap className="w-4 h-4 shrink-0" />
            <span>المعسكرات الجماعية التنافسية</span>
          </div>

          <button
            type="button"
            onClick={onToggleAzkar}
            aria-pressed={isAzkarActive}
            className={`group relative rounded-2xl p-[1.5px] azkar-rainbow-frame cursor-pointer transition-transform hover:scale-105 active:scale-95 ${
              isAzkarActive
                ? 'shadow-[0_0_24px_rgba(251,191,36,0.75)] scale-105'
                : 'shadow-[0_6px_18px_-4px_rgba(236,72,153,0.45)]'
            }`}
          >
            <span
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-[14px] text-xs sm:text-sm font-display font-black whitespace-nowrap transition-colors ${
                isAzkarActive
                  ? 'bg-gradient-to-r from-[#4c1d95] via-[#9d174d] to-[#b45309] text-amber-200'
                  : 'bg-[#1a0b2e]/95 text-amber-100 hover:bg-[#261144]'
              }`}
            >
              <Gem className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 shrink-0" />
              <span>الأذكار 💗</span>
              <span className="hidden sm:inline" aria-hidden="true">
                🎀
              </span>
            </span>
          </button>
        </div>

        {/* Action Zone */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'حوّل للوضع النهاري' : 'حوّل للوضع الليلي'}
            aria-label={theme === 'dark' ? 'حوّل للوضع النهاري' : 'حوّل للوضع الليلي'}
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-colors cursor-pointer ${
              isLq || isAzkarActive
                ? 'rounded-full bg-[#240e36]/90 border border-amber-300/35 text-amber-300 hover:border-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.18)]'
                : 'rounded-xl bg-white/80 dark:bg-slate-800/80 border border-pink-100 dark:border-fuchsia-500/30 hover:border-amber-300 dark:hover:border-amber-400/60 text-slate-700 dark:text-amber-300'
            }`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="إعدادات حسابك الشخصي"
            className={`flex items-center gap-2 pl-2 pr-1.5 py-1 transition-colors cursor-pointer ${
              isLq || isAzkarActive
                ? 'rounded-full bg-[#240e36]/90 border border-fuchsia-300/30 hover:border-fuchsia-300/60'
                : 'rounded-xl bg-white/80 dark:bg-slate-800/80 border border-pink-100 dark:border-fuchsia-500/30 hover:border-purple-300 dark:hover:border-purple-400'
            }`}
          >
            <AvatarImage
              src={profile.avatarUrl}
              name={profile.displayName}
              sizeClass="w-8 h-8"
              ringClass="ring-1 ring-pink-300 dark:ring-pink-500/60"
            />
            <span
              className={`hidden sm:inline text-xs font-semibold max-w-[110px] truncate ${
                isLq || isAzkarActive ? 'text-rose-50' : 'text-slate-800 dark:text-slate-100'
              }`}
            >
              {profile.displayName}
            </span>
            <Settings2 className={`w-3.5 h-3.5 ${isLq || isAzkarActive ? 'text-rose-200/80' : 'text-slate-400'}`} />
          </button>

          <button
            type="button"
            onClick={onSignOut}
            title="خروج من الحساب"
            aria-label="خروج من الحساب"
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-colors cursor-pointer ${
              isLq || isAzkarActive
                ? 'rounded-full bg-[#240e36]/90 border border-fuchsia-300/25 hover:border-rose-400/60 text-rose-200 hover:text-rose-300'
                : 'rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400 text-slate-500 dark:text-slate-300'
            }`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
