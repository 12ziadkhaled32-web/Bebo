import React, { useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Home,
  RefreshCw,
  Star,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import gradBooksLeftImg from '../assets/images/leaderboard_grad_books_left_1795529043128.jpg';
import sakuraClusterImg from '../assets/images/leaderboard_sakura_cluster_1795529042610.jpg';
import starBooksRightImg from '../assets/images/leaderboard_star_books_right_1795529043575.jpg';
import giantTrophyImg from '../assets/images/leaderboard_giant_trophy_1795529041587.jpg';
import { rankGroupMembers, roundScore } from '../lib/groupCampUtils';
import { GroupCamp, GroupCampMember, GroupExam, LeaderboardEntry } from '../types/camp';
import { AvatarImage } from './Decorations';

interface GroupLeaderboardViewProps {
  camp: GroupCamp;
  members: GroupCampMember[];
  currentUid: string;
  exams?: GroupExam[];
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  onBackToExams?: () => void;
  onOpenMembers?: () => void;
}

interface PodiumTheme {
  crownTop: string;
  crownMid: string;
  crownStroke: string;
  laurelColor: string;
  ringClass: string;
  badgeClass: string;
  topCapClass: string;
  bodyClass: string;
  step1Class: string;
  step2Class: string;
  glowAuraClass: string;
  percentClass: string;
}

function getPodiumTheme(rank: 1 | 2 | 3): PodiumTheme {
  if (rank === 1) {
    return {
      crownTop: '#FEF08A',
      crownMid: '#F59E0B',
      crownStroke: '#B45309',
      laurelColor: '#FBBF24',
      ringClass:
        'ring-[3.5px] ring-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.75)]',
      badgeClass:
        'bg-[radial-gradient(circle_at_30%_25%,#fef9c3_0%,#fbbf24_45%,#b45309_100%)] text-[#2a1202] border-2 border-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.85)]',
      topCapClass:
        'bg-gradient-to-r from-amber-500/80 via-yellow-200 to-amber-500/80 shadow-[0_0_24px_rgba(253,224,71,0.7)]',
      bodyClass:
        'bg-gradient-to-b from-[#9c640c]/85 via-[#4e2a06]/92 to-[#1f0d08]/95 border-x border-b border-amber-300/65 shadow-[0_18px_45px_rgba(245,158,11,0.35)]',
      step1Class:
        'bg-gradient-to-r from-[#653a07] via-[#eab308] to-[#653a07] border-t border-amber-100/90 shadow-[0_0_18px_rgba(251,191,36,0.45)]',
      step2Class:
        'bg-gradient-to-r from-[#3a1f05] via-[#ca8a04] to-[#3a1f05] border-t border-amber-200/75 shadow-[0_6px_26px_rgba(245,158,11,0.5)]',
      glowAuraClass: 'bg-amber-400/35',
      percentClass: 'text-amber-300',
    };
  }
  if (rank === 2) {
    return {
      crownTop: '#F8FAFC',
      crownMid: '#CBD5E1',
      crownStroke: '#64748B',
      laurelColor: '#E2E8F0',
      ringClass:
        'ring-[3px] ring-slate-200 shadow-[0_0_24px_rgba(226,232,240,0.6)]',
      badgeClass:
        'bg-[radial-gradient(circle_at_30%_25%,#ffffff_0%,#cbd5e1_50%,#475569_100%)] text-slate-950 border-2 border-white shadow-[0_0_14px_rgba(226,232,240,0.75)]',
      topCapClass:
        'bg-gradient-to-r from-indigo-400/70 via-slate-100 to-indigo-400/70 shadow-[0_0_20px_rgba(226,232,240,0.55)]',
      bodyClass:
        'bg-gradient-to-b from-[#3f4b9c]/75 via-[#1c1b59]/92 to-[#100933]/95 border-x border-b border-slate-200/50 shadow-[0_14px_38px_rgba(99,102,241,0.3)]',
      step1Class:
        'bg-gradient-to-r from-[#282b6e] via-[#cbd5e1] to-[#282b6e] border-t border-white/80 shadow-[0_0_16px_rgba(199,210,254,0.35)]',
      step2Class:
        'bg-gradient-to-r from-[#181747] via-[#94a3b8] to-[#181747] border-t border-slate-200/65 shadow-[0_6px_22px_rgba(129,140,248,0.4)]',
      glowAuraClass: 'bg-indigo-400/28',
      percentClass: 'text-amber-200',
    };
  }
  return {
    crownTop: '#FED7AA',
    crownMid: '#EA580C',
    crownStroke: '#9A3412',
    laurelColor: '#FB923C',
    ringClass:
      'ring-[3px] ring-orange-300 shadow-[0_0_24px_rgba(251,146,60,0.6)]',
    badgeClass:
      'bg-[radial-gradient(circle_at_30%_25%,#ffedd5_0%,#fb923c_48%,#9a3412_100%)] text-white border-2 border-orange-100 shadow-[0_0_14px_rgba(251,146,60,0.75)]',
    topCapClass:
      'bg-gradient-to-r from-orange-500/75 via-orange-200 to-orange-500/75 shadow-[0_0_20px_rgba(251,146,60,0.55)]',
    bodyClass:
      'bg-gradient-to-b from-[#8b3822]/78 via-[#44151e]/92 to-[#1b0824]/95 border-x border-b border-orange-300/50 shadow-[0_14px_38px_rgba(234,88,12,0.28)]',
    step1Class:
      'bg-gradient-to-r from-[#582214] via-[#fb923c] to-[#582214] border-t border-orange-100/80 shadow-[0_0_16px_rgba(251,146,60,0.35)]',
    step2Class:
      'bg-gradient-to-r from-[#311114] via-[#c2410c] to-[#311114] border-t border-orange-200/65 shadow-[0_6px_22px_rgba(234,88,12,0.38)]',
    glowAuraClass: 'bg-orange-500/26',
    percentClass: 'text-amber-200',
  };
}

const RoyalCrownSvg: React.FC<{
  topColor: string;
  midColor: string;
  strokeColor: string;
  uid: string;
  className?: string;
}> = ({ topColor, midColor, strokeColor, uid, className = 'w-10 h-8' }) => (
  <svg viewBox="0 0 80 54" fill="none" className={className} aria-hidden="true">
    <defs>
      <linearGradient id={`crownGrad-${uid}`} x1="40" y1="6" x2="40" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={topColor} />
        <stop offset="55%" stopColor={midColor} />
        <stop offset="100%" stopColor={strokeColor} />
      </linearGradient>
    </defs>
    <path
      d="M11 41L5 17L23 27L40 9L57 27L75 17L69 41H11Z"
      fill={`url(#crownGrad-${uid})`}
      stroke={topColor}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <rect x="11" y="42" width="58" height="6.5" rx="3.2" fill={`url(#crownGrad-${uid})`} stroke={topColor} strokeWidth="1.4" />
    <circle cx="5" cy="14" r="3.6" fill={topColor} />
    <circle cx="23" cy="23" r="2.2" fill="#FFFBEB" />
    <circle cx="40" cy="6.5" r="4.2" fill={topColor} />
    <circle cx="57" cy="23" r="2.2" fill="#FFFBEB" />
    <circle cx="75" cy="14" r="3.6" fill={topColor} />
    <circle cx="40" cy="28" r="3.2" fill="#FFFBEB" opacity="0.85" />
  </svg>
);

const CurvedLaurelSvg: React.FC<{
  color: string;
  flip?: boolean;
  className?: string;
}> = ({ color, flip = false, className = 'w-8 h-14' }) => (
  <svg
    viewBox="0 0 46 72"
    fill="none"
    className={`${className} ${flip ? '-scale-x-100' : ''}`}
    aria-hidden="true"
  >
    <path
      d="M39 65C19 54 11 32 18 7"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      opacity="0.95"
    />
    <ellipse cx="16" cy="14" rx="5.6" ry="2.8" transform="rotate(-38 16 14)" fill={color} />
    <ellipse cx="22" cy="19" rx="5" ry="2.5" transform="rotate(24 22 19)" fill={color} opacity="0.88" />
    <ellipse cx="12" cy="26" rx="6" ry="3" transform="rotate(-26 12 26)" fill={color} />
    <ellipse cx="20" cy="31" rx="5.2" ry="2.6" transform="rotate(28 20 31)" fill={color} opacity="0.88" />
    <ellipse cx="13" cy="39" rx="6.2" ry="3" transform="rotate(-12 13 39)" fill={color} />
    <ellipse cx="22" cy="43" rx="5.2" ry="2.6" transform="rotate(34 22 43)" fill={color} opacity="0.88" />
    <ellipse cx="18" cy="52" rx="5.8" ry="2.8" transform="rotate(8 18 52)" fill={color} />
    <ellipse cx="28" cy="60" rx="5.2" ry="2.6" transform="rotate(24 28 60)" fill={color} />
  </svg>
);

const SpikedRankCrest: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank === 1 || rank === 2 || rank === 3) {
    const palette =
      rank === 1
        ? {
            top: '#FEF08A',
            mid: '#F59E0B',
            bottom: '#92400E',
            text: '#2B1002',
            glow: 'drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]',
          }
        : rank === 2
          ? {
              top: '#FFFFFF',
              mid: '#CBD5E1',
              bottom: '#475569',
              text: '#0F172A',
              glow: 'drop-shadow-[0_0_10px_rgba(226,232,240,0.65)]',
            }
          : {
              top: '#FED7AA',
              mid: '#EA580C',
              bottom: '#7C2D12',
              text: '#FFFBEB',
              glow: 'drop-shadow-[0_0_10px_rgba(251,146,60,0.65)]',
            };

    return (
      <div className={`relative inline-flex items-center justify-center w-11 h-11 ${palette.glow}`}>
        <svg viewBox="0 0 64 64" fill="none" className="w-full h-full" aria-hidden="true">
          <defs>
            <linearGradient id={`crest-${rank}`} x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={palette.top} />
              <stop offset="52%" stopColor={palette.mid} />
              <stop offset="100%" stopColor={palette.bottom} />
            </linearGradient>
          </defs>
          {/* Crown Top Points + Winged Wreath Crest */}
          <path
            d="M32 6L38 15L49 11L47 23L58 29L49 38L52 49L40 48L32 58L24 48L12 49L15 38L6 29L17 23L15 11L26 15L32 6Z"
            fill={`url(#crest-${rank})`}
            stroke={palette.top}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle
            cx="32"
            cy="33"
            r="12.5"
            fill={`url(#crest-${rank})`}
            stroke={palette.top}
            strokeWidth="1.8"
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center pt-0.5 font-mono-num tabular-nums text-sm font-black"
          style={{ color: palette.text }}
        >
          {rank}
        </span>
      </div>
    );
  }

  return (
    <span className="font-mono-num tabular-nums text-sm sm:text-base font-black text-white">
      {rank}
    </span>
  );
};

const GlowingOutlineHeartSvg: React.FC<{ color?: string; className?: string }> = ({
  color = '#F9A8D4',
  className = 'w-7 h-7',
}) => (
  <svg viewBox="0 0 48 44" fill="none" className={className} aria-hidden="true">
    <path
      d="M24 39.5C24 39.5 6.5 28.4 6.5 15.2C6.5 9.8 10.7 5.5 16 5.5C19.6 5.5 22.6 7.5 24 10.5C25.4 7.5 28.4 5.5 32 5.5C37.3 5.5 41.5 9.8 41.5 15.2C41.5 28.4 24 39.5 24 39.5Z"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const GroupLeaderboardView: React.FC<GroupLeaderboardViewProps> = ({
  camp,
  members,
  currentUid,
  exams = [],
  refreshing = false,
  onRefresh,
  onBackToExams,
  onOpenMembers,
}) => {
  const [localRefreshing, setLocalRefreshing] = useState(false);

  const ranked: LeaderboardEntry[] = rankGroupMembers(members);
  const topThree = ranked.slice(0, 3);
  const champion = ranked[0] || null;

  const campTotalMaxScore = roundScore(
    exams.reduce((sum, ex) => sum + (Number(ex.totalScore) > 0 ? Number(ex.totalScore) : 0), 0)
  );

  const computePercent = (member: GroupCampMember): number => {
    if (campTotalMaxScore > 0) {
      return Math.min(100, Math.max(0, Math.round((member.totalScore / campTotalMaxScore) * 100)));
    }
    return Math.min(100, Math.max(0, Math.round(member.completionPercent || 0)));
  };

  const completedCount = ranked.filter((r) => r.member.examsTakenCount > 0).length;
  const excellentCount = ranked.filter((r) => {
    const pct = computePercent(r.member);
    return r.member.examsTakenCount > 0 && (campTotalMaxScore > 0 ? pct >= 85 : r.member.totalScore > 0);
  }).length;

  const activeScorers = ranked.filter((r) => r.member.examsTakenCount > 0);
  const avgPercent =
    activeScorers.length > 0
      ? roundScore(
          activeScorers.reduce((sum, r) => sum + computePercent(r.member), 0) /
            activeScorers.length
        )
      : 0;

  const highestScoreLabel = champion
    ? campTotalMaxScore > 0
      ? `${champion.member.totalScore} / ${campTotalMaxScore}`
      : `${champion.member.totalScore}`
    : '0';

  const handleRefreshClick = async () => {
    if (!onRefresh || refreshing || localRefreshing) return;
    setLocalRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setLocalRefreshing(false);
    }
  };

  const isSpinning = refreshing || localRefreshing;

  if (ranked.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#0b031f] via-[#1a093c] to-[#0f0427] border border-purple-400/40 p-10 text-center space-y-4 text-white shadow-2xl">
        <Trophy className="w-12 h-12 text-amber-300 mx-auto drop-shadow-[0_0_16px_rgba(251,191,36,0.65)]" />
        <h3 className="font-display text-xl font-black text-white">
          لوحة أبطال «{camp.name}» مستنية أول النتائج
        </h3>
        <p className="text-sm text-purple-200/80 max-w-md mx-auto">
          أول ما الشباب والبنات يدخلوا ويمتحنوا الامتحانات التنافسية، منصة التلاتة الأوائل والترتيب العام هيظهروا هنا لوحدهم.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#0a021c] via-[#170736] to-[#0e0324] border border-fuchsia-400/45 shadow-[0_28px_90px_rgba(126,34,206,0.5)] px-3 sm:px-6 lg:px-9 pt-6 pb-8 sm:pb-10 text-white">
      {/* ================================================================
          COSMIC NEBULA, STARLIGHT & 3D ILLUSTRATED SCENE BACKDROP
          ================================================================ */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Radial Aura Glows */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[560px] h-[300px] rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute top-14 -right-24 w-96 h-96 rounded-full bg-fuchsia-600/25 blur-3xl" />
        <div className="absolute top-24 -left-20 w-96 h-96 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[680px] h-72 rounded-full bg-purple-600/25 blur-3xl" />

        {/* Flowing Cosmic Ribbon Waves & Sparkling Stars */}
        <svg viewBox="0 0 1200 520" fill="none" className="absolute inset-x-0 top-0 w-full opacity-55">
          <path
            d="M-40 160C220 75 430 220 650 110C870 0 1040 130 1240 60"
            stroke="url(#lbAuroraTop)"
            strokeWidth="3"
          />
          <path
            d="M-20 310C260 220 460 360 680 250C900 140 1050 280 1230 190"
            stroke="url(#lbAuroraMid)"
            strokeWidth="2"
            opacity="0.55"
          />
          {/* 4-Point Sparkling Stars */}
          <path d="M320 65L323 73L331 76L323 79L320 87L317 79L309 76L317 73Z" fill="#FDE047" />
          <path d="M895 72L898 81L907 84L898 87L895 96L892 87L883 84L892 81Z" fill="#FDE047" />
          <path d="M432 232L435 239L442 242L435 245L432 252L429 245L422 242L429 239Z" fill="#FBBF24" />
          <path d="M115 390L119 400L129 404L119 408L115 418L111 408L101 404L111 400Z" fill="#FEF08A" />
          <path d="M1070 365L1074 374L1083 378L1074 382L1070 391L1066 382L1057 378L1066 374Z" fill="#FDE047" />
          <circle cx="195" cy="112" r="2.2" fill="#E9D5FF" />
          <circle cx="775" cy="48" r="2" fill="#FEF08A" />
          <circle cx="990" cy="165" r="2" fill="#F5D0FE" />
          <circle cx="520" cy="95" r="1.8" fill="#BAE6FD" />
          <defs>
            <linearGradient id="lbAuroraTop" x1="0" y1="0" x2="1200" y2="0">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0" />
              <stop offset="35%" stopColor="#EC4899" stopOpacity="0.65" />
              <stop offset="65%" stopColor="#FBBF24" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lbAuroraMid" x1="0" y1="0" x2="1200" y2="0">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0" />
              <stop offset="50%" stopColor="#D946EF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Top-Left Giant Glowing Golden Trophy (Visual Left in Screenshot) */}
        <div className="hidden md:block absolute -top-2 -left-4 lg:left-2 w-56 h-56 lg:w-72 lg:h-72 opacity-90 -rotate-6">
          <img
            src={giantTrophyImg}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover lb-mask-vignette mix-blend-lighten"
          />
        </div>

        {/* Mid-Left Cherry Blossom Cluster Framing Podium & Card */}
        <div className="hidden sm:block absolute top-64 -left-10 w-52 h-52 lg:w-64 lg:h-64 opacity-85">
          <img
            src={sakuraClusterImg}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover lb-mask-vignette mix-blend-lighten"
          />
        </div>

        {/* Mid-Right Cherry Blossom Cluster Framing Podium & Card */}
        <div className="hidden sm:block absolute top-64 -right-10 w-52 h-52 lg:w-64 lg:h-64 opacity-85 -scale-x-100">
          <img
            src={sakuraClusterImg}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover lb-mask-vignette mix-blend-lighten"
          />
        </div>

        {/* Bottom-Left Graduation Cap & Stacked Books Scene */}
        <div className="hidden sm:block absolute -bottom-4 -left-6 w-56 h-44 lg:w-72 lg:h-56 opacity-90">
          <img
            src={gradBooksLeftImg}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover lb-mask-bottom-corner mix-blend-lighten"
          />
        </div>

        {/* Bottom-Right Golden Star & Stacked Books Scene */}
        <div className="hidden sm:block absolute -bottom-4 -right-6 w-56 h-44 lg:w-72 lg:h-56 opacity-90">
          <img
            src={starBooksRightImg}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover lb-mask-bottom-corner mix-blend-lighten"
          />
        </div>

        {/* Bottom Golden Stardust Horizon Arc */}
        <svg viewBox="0 0 1200 110" fill="none" className="absolute inset-x-0 bottom-0 w-full opacity-80">
          <path
            d="M0 95C340 42 860 42 1200 95"
            stroke="url(#lbBottomHorizon)"
            strokeWidth="2.5"
          />
          <defs>
            <linearGradient id="lbBottomHorizon" x1="0" y1="0" x2="1200" y2="0">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0" />
              <stop offset="50%" stopColor="#FDE047" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* ================================================================
          1. TOP HEADER CREST ("أبطال المعسكر / Top 3") + CALLIGRAPHY SCRIPT
          ================================================================ */}
      <div className="relative z-10 flex flex-col items-center pt-1">
        {/* Top-Right Tilted Motivational Script + Hand-Drawn Glowing Heart */}
        <div className="hidden md:flex flex-col items-center gap-1.5 absolute top-5 right-4 lg:right-8 -rotate-6 select-none">
          <span className="font-display text-sm lg:text-base font-black text-pink-200/95 drop-shadow-[0_0_14px_rgba(244,114,182,0.75)] leading-snug text-center">
            سوا .. بنوصل
            <br />
            لأعلى نجاح
          </span>
          <GlowingOutlineHeartSvg
            color="#F472B6"
            className="w-8 h-8 drop-shadow-[0_0_12px_rgba(244,114,182,0.85)]"
          />
        </div>

        {/* Center Crown + Ornate Purple/Gold Ribbon + "Top 3" Badge */}
        <div className="relative flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="absolute -top-6 w-48 h-24 rounded-full bg-amber-300/35 blur-2xl"
          />
          <RoyalCrownSvg
            topColor="#FEF08A"
            midColor="#F59E0B"
            strokeColor="#B45309"
            uid="header"
            className="w-14 h-10 sm:w-16 sm:h-12 drop-shadow-[0_0_18px_rgba(251,191,36,0.9)] -mb-2 z-20"
          />

          <div className="relative flex items-center justify-center gap-1.5 sm:gap-2.5 z-10">
            <CurvedLaurelSvg
              color="#FBBF24"
              className="w-7 h-12 sm:w-9 sm:h-14 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]"
            />

            <div className="flex flex-col items-center">
              <div className="relative px-7 sm:px-11 py-2.5 rounded-2xl bg-gradient-to-b from-[#5d1a94] via-[#3d0a6b] to-[#260448] border-2 border-amber-300 shadow-[0_0_32px_rgba(251,191,36,0.45),inset_0_1px_0_rgba(254,240,138,0.65)]">
                <h2 className="font-display text-2xl sm:text-3xl font-black text-amber-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] whitespace-nowrap">
                  أبطال المعسكر
                </h2>
              </div>
              <div className="-mt-2.5 px-7 py-0.5 rounded-full bg-gradient-to-b from-[#fef08a] via-[#f59e0b] to-[#d97706] border border-amber-100 text-[#2a0c02] font-display font-black text-xs sm:text-sm tracking-wide shadow-[0_4px_16px_rgba(245,158,11,0.6)]">
                Top 3
              </div>
            </div>

            <CurvedLaurelSvg
              color="#FBBF24"
              flip
              className="w-7 h-12 sm:w-9 sm:h-14 drop-shadow-[0_0_10px_rgba(251,191,36,0.65)]"
            />
          </div>
        </div>
      </div>

      {/* ================================================================
          2. TOP 3 3D METALLIC PODIUMS (#2 Left, #1 Tallest Center, #3 Right)
          ================================================================ */}
      <section className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-end max-w-4xl mx-auto mt-6 mb-7 px-1 sm:px-4">
        {topThree.map((entry) => {
          const rank = entry.rank as 1 | 2 | 3;
          const theme = getPodiumTheme(rank);
          const isMe = entry.member.uid === currentUid;
          const pct = computePercent(entry.member);

          // RTL Grid Order: col1 (Right) = #3, col2 (Center) = #1, col3 (Left) = #2
          const orderClass =
            rank === 1
              ? 'order-1 md:order-2'
              : rank === 2
                ? 'order-2 md:order-3'
                : 'order-3 md:order-1';

          const bodyMinHeight =
            rank === 1
              ? 'min-h-[160px] sm:min-h-[188px]'
              : rank === 2
                ? 'min-h-[138px] sm:min-h-[158px]'
                : 'min-h-[126px] sm:min-h-[144px]';

          return (
            <div key={entry.member.uid} className={`relative flex flex-col items-center ${orderClass}`}>
              {/* Subtle Ambient Backlight Glow behind Rank Avatar */}
              <div
                aria-hidden="true"
                className={`absolute top-6 w-36 h-36 rounded-full blur-2xl pointer-events-none ${theme.glowAuraClass}`}
              />

              {/* Crown + Laurels + Circular Portrait + 3D Rank Medallion */}
              <div className="relative flex flex-col items-center z-20 -mb-6">
                <RoyalCrownSvg
                  topColor={theme.crownTop}
                  midColor={theme.crownMid}
                  strokeColor={theme.crownStroke}
                  uid={`podium-${rank}`}
                  className={`${
                    rank === 1 ? 'w-12 h-9 sm:w-14 sm:h-10' : 'w-10 h-8'
                  } drop-shadow-[0_0_12px_rgba(251,191,36,0.65)] -mb-2 z-20`}
                />

                <div className="relative flex items-center justify-center">
                  <CurvedLaurelSvg
                    color={theme.laurelColor}
                    className="w-6 h-12 sm:w-7 sm:h-14 -ml-2 opacity-95 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                  />

                  <div className="relative z-10">
                    <AvatarImage
                      src={entry.member.avatarUrl}
                      name={entry.member.displayName}
                      sizeClass={
                        rank === 1
                          ? 'w-22 h-22 sm:w-28 sm:h-28'
                          : 'w-18 h-18 sm:w-22 sm:h-22'
                      }
                      ringClass={theme.ringClass}
                    />
                    <div
                      className={`absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full font-mono-num tabular-nums font-black text-base sm:text-lg flex items-center justify-center ${theme.badgeClass}`}
                    >
                      {rank}
                    </div>
                  </div>

                  <CurvedLaurelSvg
                    color={theme.laurelColor}
                    flip
                    className="w-6 h-12 sm:w-7 sm:h-14 -mr-2 opacity-95 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                  />
                </div>
              </div>

              {/* 3D Metallic Pedestal Cylinder */}
              <div className="relative w-full flex flex-col items-center">
                {/* Bright Metallic Top Rim Cap */}
                <div className={`w-[98%] h-2.5 rounded-t-2xl ${theme.topCapClass}`} />

                {/* Translucent Metallic Pedestal Face */}
                <div
                  className={`w-[96%] rounded-b-xl pt-9 pb-4 px-3.5 flex flex-col items-center justify-center text-center backdrop-blur-md ${theme.bodyClass} ${bodyMinHeight} ${
                    isMe ? 'ring-2 ring-cyan-300/70' : ''
                  }`}
                >
                  <h3 className="font-display font-black text-base sm:text-lg text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] truncate max-w-full">
                    {entry.member.displayName}
                    {isMe ? ' (أنت / أنتي)' : ''}
                  </h3>

                  <div className="mt-2 flex items-center justify-center gap-1.5 font-mono-num tabular-nums">
                    <Star className={`w-4 h-4 fill-current ${theme.percentClass}`} />
                    <span className={`text-lg sm:text-xl font-black ${theme.percentClass}`}>
                      {pct}%
                    </span>
                  </div>

                  <div className="mt-1 font-mono-num tabular-nums text-xs sm:text-sm font-bold text-slate-100/95">
                    {campTotalMaxScore > 0
                      ? `( ${entry.member.totalScore} / ${campTotalMaxScore} )`
                      : `( ${entry.member.totalScore} نقطة )`}
                  </div>
                </div>

                {/* 2-Step Wide Metallic Glowing Pedestal Base */}
                <div aria-hidden="true" className={`w-[104%] h-3 rounded-full -mt-0.5 ${theme.step1Class}`} />
                <div aria-hidden="true" className={`w-[112%] h-3.5 rounded-full mt-0.5 ${theme.step2Class}`} />
              </div>
            </div>
          );
        })}
      </section>

      {/* ================================================================
          3. MAIN LEADERBOARD GLASS CARD ("قائمة التصنيف العام" + KPIs)
          ================================================================ */}
      <section className="relative z-10 rounded-[28px] bg-[#140632]/90 border-[1.5px] border-fuchsia-400/55 shadow-[0_0_52px_rgba(192,38,211,0.34),inset_0_1px_0_rgba(240,171,252,0.3)] backdrop-blur-xl p-4 sm:p-6 space-y-4 overflow-hidden">
        {/* Top Subtle Purple Aurora Wave inside Card */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-fuchsia-500/18 via-purple-600/10 to-transparent"
        />

        {/* Card Header Bar */}
        <div className="relative flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-purple-300/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/25 to-amber-600/15 border border-amber-300/55 flex items-center justify-center shadow-[0_0_16px_rgba(251,191,36,0.3)]">
              <Trophy className="w-5 h-5 text-amber-300" />
            </div>
            <h3 className="font-display text-lg sm:text-xl font-black text-white">
              قائمة التصنيف العام
            </h3>
          </div>

          <div className="px-4 py-1.5 rounded-full bg-[#1a0a3d] border border-purple-300/45 shadow-[0_0_20px_rgba(168,85,247,0.28)] text-xs font-bold text-white flex items-center gap-2 font-mono-num tabular-nums">
            <Users className="w-4 h-4 text-purple-300 shrink-0" />
            <span>إجمالي المشاركين: {ranked.length} طالب وطالبة</span>
          </div>
        </div>

        {/* Desktop 6-Column Table Header Row (RTL: Right -> Left) */}
        <div className="relative hidden md:grid grid-cols-12 gap-3 px-5 py-1 text-xs font-bold text-purple-100/85 text-center">
          <div className="col-span-1">المركز</div>
          <div className="col-span-1">الصورة</div>
          <div className="col-span-4 text-right pr-2">اسم الطالب / الطالبة</div>
          <div className="col-span-2">مجموع الدرجات</div>
          <div className="col-span-2">النسبة المئوية</div>
          <div className="col-span-2">الفارق عن السابق</div>
        </div>

        {/* Ranked Capsule Rows (#1 .. #N) */}
        <div className="relative space-y-2.5">
          {ranked.map((entry) => {
            const isMe = entry.member.uid === currentUid;
            const isFirst = entry.rank === 1;
            const isSecond = entry.rank === 2;
            const isThird = entry.rank === 3;
            const pct = computePercent(entry.member);

            const rowClass = isFirst
              ? 'bg-gradient-to-l from-[#b47614]/80 via-[#784909]/75 to-[#3d2105]/85 border-amber-300/80 shadow-[0_0_24px_rgba(251,191,36,0.28)]'
              : isSecond
                ? 'bg-gradient-to-l from-[#262b73]/80 via-[#1d1c58]/80 to-[#14123c]/90 border-sky-300/50 shadow-[0_0_20px_rgba(56,189,248,0.18)]'
                : isThird
                  ? 'bg-gradient-to-l from-[#4a1c47]/80 via-[#2a1247]/80 to-[#1b0b38]/90 border-orange-300/45 shadow-[0_0_18px_rgba(251,146,60,0.15)]'
                  : 'bg-[#1c0c40]/85 border-purple-400/25 hover:border-purple-300/45';

            const renderDiffBadge = () => {
              if (isFirst) {
                return (
                  <span className="inline-flex items-center justify-center gap-1.5 font-mono-num tabular-nums font-black text-amber-200">
                    <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span>-</span>
                  </span>
                );
              }
              if (entry.scoreDiffFromPrev === 0) {
                return (
                  <span className="inline-flex items-center justify-center gap-1.5 font-mono-num tabular-nums font-black text-emerald-400">
                    {isSecond ? (
                      <Star className="w-4 h-4 text-slate-200 fill-slate-200" />
                    ) : (
                      <span className="text-emerald-400 text-xs">▲</span>
                    )}
                    <span>0</span>
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center justify-center gap-1.5 font-mono-num tabular-nums font-black text-rose-400">
                  <span className="text-xs">▼</span>
                  <span>{entry.scoreDiffFromPrev}</span>
                </span>
              );
            };

            return (
              <div
                key={entry.member.uid}
                className={`rounded-2xl md:rounded-full border px-3.5 sm:px-5 py-2 transition-all ${rowClass} ${
                  isMe && !isFirst ? 'ring-1 ring-cyan-300/65' : ''
                }`}
              >
                {/* Desktop Row */}
                <div className="hidden md:grid grid-cols-12 gap-3 items-center text-center">
                  <div className="col-span-1 flex items-center justify-center">
                    <SpikedRankCrest rank={entry.rank} />
                  </div>

                  <div className="col-span-1 flex items-center justify-center">
                    <AvatarImage
                      src={entry.member.avatarUrl}
                      name={entry.member.displayName}
                      sizeClass="w-10 h-10"
                      ringClass={
                        isFirst
                          ? 'ring-2 ring-amber-300'
                          : isSecond
                            ? 'ring-2 ring-slate-200'
                            : isThird
                              ? 'ring-2 ring-orange-300'
                              : isMe
                                ? 'ring-2 ring-cyan-300'
                                : 'ring-2 ring-purple-300/45'
                      }
                    />
                  </div>

                  <div className="col-span-4 text-right pr-2 min-w-0">
                    <div
                      className={`font-display font-bold text-sm sm:text-base truncate ${
                        isFirst ? 'text-amber-200' : 'text-white'
                      }`}
                    >
                      {entry.member.displayName}
                      {isMe ? ' (أنت / أنتي)' : ''}
                    </div>
                  </div>

                  <div
                    className={`col-span-2 font-mono-num tabular-nums text-sm font-bold ${
                      isFirst ? 'text-amber-100' : 'text-white'
                    }`}
                  >
                    {campTotalMaxScore > 0
                      ? `${entry.member.totalScore} / ${campTotalMaxScore}`
                      : `${entry.member.totalScore} نقطة`}
                  </div>

                  <div
                    className={`col-span-2 font-mono-num tabular-nums text-sm font-extrabold ${
                      isFirst ? 'text-amber-200' : 'text-white'
                    }`}
                  >
                    {pct}%
                  </div>

                  <div className="col-span-2 flex items-center justify-center text-sm">
                    {renderDiffBadge()}
                  </div>
                </div>

                {/* Mobile Compact Row */}
                <div className="flex md:hidden items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 flex items-center justify-center shrink-0">
                      <SpikedRankCrest rank={entry.rank} />
                    </div>
                    <AvatarImage
                      src={entry.member.avatarUrl}
                      name={entry.member.displayName}
                      sizeClass="w-10 h-10"
                      ringClass={
                        isFirst
                          ? 'ring-2 ring-amber-300'
                          : isMe
                            ? 'ring-2 ring-cyan-300'
                            : 'ring-1 ring-purple-300/45'
                      }
                    />
                    <div className="min-w-0">
                      <div
                        className={`font-display font-bold text-sm truncate ${
                          isFirst ? 'text-amber-200' : 'text-white'
                        }`}
                      >
                        {entry.member.displayName}
                        {isMe ? ' (أنت / أنتي)' : ''}
                      </div>
                      <div className="text-[11px] font-mono-num tabular-nums text-purple-200/85">
                        {campTotalMaxScore > 0
                          ? `${entry.member.totalScore} / ${campTotalMaxScore}`
                          : `${entry.member.totalScore} نقطة`}{' '}
                        · {pct}%
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs">{renderDiffBadge()}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4 Bottom KPI Summary Cards Inside Container (RTL Order matching Screenshot) */}
        <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Card 1 (Right): Gold Glow - Excellent Count */}
          <div className="rounded-2xl bg-gradient-to-br from-[#4f3208]/75 via-[#220e3d]/90 to-[#14072b]/95 border border-amber-300/60 shadow-[0_0_24px_rgba(251,191,36,0.18)] px-4 py-3 flex items-center justify-between gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-400/20 border border-amber-300/60 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(251,191,36,0.4)]">
              <Star className="w-6 h-6 text-amber-300 fill-amber-300" />
            </div>
            <div className="text-right flex-1">
              <div className="text-[11px] font-bold text-amber-100/90">عدد المتميزين</div>
              <div className="font-display font-black text-base sm:text-lg text-white font-mono-num tabular-nums mt-0.5">
                {excellentCount} طالب وطالبة
              </div>
            </div>
          </div>

          {/* Card 2: Magenta Glow - Completed Exam Count */}
          <div className="rounded-2xl bg-gradient-to-br from-[#4f105e]/75 via-[#220e3d]/90 to-[#14072b]/95 border border-fuchsia-400/60 shadow-[0_0_24px_rgba(217,70,239,0.2)] px-4 py-3 flex items-center justify-between gap-3">
            <div className="w-11 h-11 rounded-full bg-fuchsia-400/20 border border-fuchsia-300/60 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(217,70,239,0.4)]">
              <Users className="w-5 h-5 text-fuchsia-300" />
            </div>
            <div className="text-right flex-1">
              <div className="text-[11px] font-bold text-fuchsia-100/90">عدد اللي خلصوا الامتحان</div>
              <div className="font-display font-black text-base sm:text-lg text-white font-mono-num tabular-nums mt-0.5">
                {completedCount} / {ranked.length}
              </div>
            </div>
          </div>

          {/* Card 3: Electric Blue Glow - Average Score */}
          <div className="rounded-2xl bg-gradient-to-br from-[#122f78]/75 via-[#18124a]/90 to-[#12072b]/95 border border-sky-400/60 shadow-[0_0_24px_rgba(56,189,248,0.2)] px-4 py-3 flex items-center justify-between gap-3">
            <div className="w-11 h-11 rounded-full bg-sky-400/20 border border-sky-300/60 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(56,189,248,0.4)]">
              <BarChart3 className="w-5 h-5 text-sky-300" />
            </div>
            <div className="text-right flex-1">
              <div className="text-[11px] font-bold text-sky-100/90">متوسط الدرجات</div>
              <div className="font-display font-black text-base sm:text-lg text-white font-mono-num tabular-nums mt-0.5">
                {avgPercent}%
              </div>
            </div>
          </div>

          {/* Card 4 (Left): Warm Amber Glow - Highest Score */}
          <div className="rounded-2xl bg-gradient-to-br from-[#522f08]/75 via-[#220e3d]/90 to-[#14072b]/95 border border-amber-300/60 shadow-[0_0_24px_rgba(245,158,11,0.18)] px-4 py-3 flex items-center justify-between gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-400/20 border border-amber-300/60 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(245,158,11,0.4)]">
              <Zap className="w-5 h-5 text-amber-300 fill-amber-300" />
            </div>
            <div className="text-right flex-1">
              <div className="text-[11px] font-bold text-amber-100/90">أعلى درجة</div>
              <div className="font-display font-black text-base sm:text-lg text-white font-mono-num tabular-nums mt-0.5">
                {highestScoreLabel}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          4. BOTTOM 3 NEON PILL ACTION BUTTONS
          ================================================================ */}
      <div className="relative z-10 flex flex-wrap items-center justify-center sm:justify-around gap-3 sm:gap-5 pt-6 max-w-4xl mx-auto">
        {onBackToExams && (
          <button
            type="button"
            onClick={onBackToExams}
            className="min-w-[185px] px-7 py-3 rounded-full bg-gradient-to-r from-[#170b3a] via-[#271060] to-[#170b3a] border border-purple-400/75 hover:border-purple-200 text-white font-display font-black text-xs sm:text-sm shadow-[0_0_26px_rgba(139,92,246,0.45)] hover:brightness-110 transition-all flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Home className="w-4 h-4 text-white" />
            <span>العودة للرئيسية</span>
          </button>
        )}

        {onOpenMembers && (
          <button
            type="button"
            onClick={onOpenMembers}
            className="min-w-[195px] px-7 py-3 rounded-full bg-gradient-to-r from-[#4c1d95] via-[#7e22ce] to-[#3b0764] border border-fuchsia-300/80 hover:border-white text-white font-display font-black text-xs sm:text-sm shadow-[0_0_30px_rgba(217,70,239,0.55)] hover:brightness-110 transition-all flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
            <span>تفاصيل المعسكر</span>
            <Trophy className="w-4 h-4 text-amber-300" />
          </button>
        )}

        {onRefresh && (
          <button
            type="button"
            disabled={isSpinning}
            onClick={() => void handleRefreshClick()}
            className="min-w-[185px] px-7 py-3 rounded-full bg-gradient-to-r from-[#854d0e] via-[#d97706] to-[#92400e] border border-amber-300/85 text-white font-display font-black text-xs sm:text-sm shadow-[0_0_28px_rgba(251,191,36,0.5)] hover:brightness-110 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-65 whitespace-nowrap shrink-0"
          >
            <span>{isSpinning ? 'بنحدّث...' : 'تحديث التصنيف'}</span>
            <RefreshCw className={`w-4 h-4 text-amber-200 ${isSpinning ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* ================================================================
          5. BOTTOM MOTIVATIONAL SCRIPT WITH GOLDEN OUTLINE HEART
          ================================================================ */}
      <div className="relative z-10 flex items-center justify-center gap-2 pt-7 pb-2 text-sm sm:text-base font-display font-bold text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.65)]">
        <span className="-rotate-1">أنت وأنتي قدها وقدود — يلا نكمل</span>
        <GlowingOutlineHeartSvg
          color="#FDE047"
          className="w-6 h-6 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]"
        />
      </div>
    </div>
  );
};
