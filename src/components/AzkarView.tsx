import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Crown,
  Gem,
  Heart,
  Lightbulb,
  Moon,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  Sun,
} from 'lucide-react';
import azkarAlarmClockImg from '../assets/images/azkar_alarm_clock_1795517211758.jpg';
import azkarEveningLakeMosqueImg from '../assets/images/azkar_evening_lake_mosque_1795530279079.jpg';
import azkarHeroLanternRosesImg from '../assets/images/azkar_hero_lantern_roses_1795530278431.jpg';
import azkarMorningGazeboImg from '../assets/images/azkar_morning_gazebo_1795530277925.jpg';
import azkarMosqueMoonImg from '../assets/images/azkar_mosque_moon_1795517211886.jpg';
import azkarQuranLanternImg from '../assets/images/azkar_quran_lantern_1795517210468.jpg';
import azkarTreasuresGardenImg from '../assets/images/azkar_treasures_garden_1795530277271.jpg';
import sakuraClusterImg from '../assets/images/leaderboard_sakura_cluster_1795529042610.jpg';
import {
  AzkarPeriod,
  EVENING_AZKAR,
  getDailyIslamicTreasure,
  MORNING_AZKAR,
  selectAzkarByCount,
  ZekrItem,
} from '../constants/azkarData';
import { subscribeToActiveIslamicTreasure } from '../services/treasureService';
import { ActiveIslamicTreasureDoc } from '../types/camp';

type AzkarStep = 'choose_period' | 'choose_count' | 'reading';

/** 3D Royal Gold Crown SVG matching the screenshot hero crest */
const AzkarRoyalCrownSvg: React.FC<{ className?: string }> = ({ className = 'w-16 h-12' }) => (
  <svg viewBox="0 0 96 64" fill="none" aria-hidden="true" className={className}>
    <defs>
      <linearGradient id="azkarHeroCrownGold" x1="48" y1="6" x2="48" y2="58" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FEF9C3" />
        <stop offset="42%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
    </defs>
    <path
      d="M14 48L6 20L27 32L48 10L69 32L90 20L82 48H14Z"
      fill="url(#azkarHeroCrownGold)"
      stroke="#FEF08A"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <rect
      x="14"
      y="49"
      width="68"
      height="8"
      rx="4"
      fill="url(#azkarHeroCrownGold)"
      stroke="#FEF08A"
      strokeWidth="1.6"
    />
    <circle cx="6" cy="17" r="4.2" fill="#FEF08A" />
    <circle cx="27" cy="28" r="2.6" fill="#FFFFFF" />
    <circle cx="48" cy="7.5" r="5" fill="#FEF08A" />
    <circle cx="69" cy="28" r="2.6" fill="#FFFFFF" />
    <circle cx="90" cy="17" r="4.2" fill="#FEF08A" />
    <circle cx="48" cy="34" r="4" fill="#38BDF8" stroke="#FEF08A" strokeWidth="1.5" />
    <circle cx="28" cy="40" r="2.8" fill="#F43F5E" />
    <circle cx="68" cy="40" r="2.8" fill="#F43F5E" />
  </svg>
);

/** Glowing Golden Crescent Moon SVG */
const GlowingCrescentSvg: React.FC<{ className?: string }> = ({ className = 'w-11 h-11' }) => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
    <defs>
      <linearGradient id="azkarCrescentGold" x1="14" y1="10" x2="50" y2="54" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FEF9C3" />
        <stop offset="55%" stopColor="#FCD34D" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
    </defs>
    <path
      d="M39 10C25.5 11.5 15 23 15 37C15 51.5 26.8 61.5 41 60.5C46.8 60.1 52 57.6 55.8 53.7C44.5 55.2 34 46.5 34 34.5C34 24.4 39.6 15.8 47.6 11.4C44.9 10.3 42 9.7 39 10Z"
      fill="url(#azkarCrescentGold)"
    />
  </svg>
);

/** Faceted Glowing Amethyst Crystal Shard SVG */
const CrystalShardSvg: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
    <defs>
      <linearGradient id="azkarShardFacet" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f5d0fe" />
        <stop offset="48%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#4c1d95" />
      </linearGradient>
    </defs>
    <polygon
      points="24,4 38,16 34,38 18,44 10,24"
      fill="url(#azkarShardFacet)"
      stroke="#e9d5ff"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <polygon points="24,4 28,22 38,16" fill="#ffffff" fillOpacity="0.42" />
    <polygon points="10,24 28,22 18,44" fill="#38bdf8" fillOpacity="0.22" />
  </svg>
);

/** Faceted Cyan/Blue Diamond SVG matching "معلومة يمكن اول مرة تعرفها" crest */
const BlueGemDiamondSvg: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
    <defs>
      <linearGradient id="azkarBlueDiamond" x1="10" y1="12" x2="54" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#E0F2FE" />
        <stop offset="35%" stopColor="#38BDF8" />
        <stop offset="75%" stopColor="#0284C7" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
    </defs>
    <polygon
      points="18,14 46,14 58,28 32,56 6,28"
      fill="url(#azkarBlueDiamond)"
      stroke="#BAE6FD"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <polygon points="18,14 32,28 46,14" fill="#FFFFFF" fillOpacity="0.5" />
    <polygon points="6,28 21,28 32,56" fill="#0EA5E9" fillOpacity="0.45" />
    <polygon points="58,28 43,28 32,56" fill="#0369A1" fillOpacity="0.55" />
    <line x1="6" y1="28" x2="58" y2="28" stroke="#E0F2FE" strokeWidth="1.4" />
  </svg>
);

/** Faceted Rainbow Diamond Prism SVG for Step 2 */
const DiamondPrism3DSvg: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg viewBox="0 0 80 80" fill="none" aria-hidden="true" className={className}>
    <defs>
      <linearGradient id="azkarDiamondRainbow" x1="8" y1="10" x2="72" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="32%" stopColor="#f472b6" />
        <stop offset="64%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#a855f7" />
      </linearGradient>
      <linearGradient id="azkarGoldFrame" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="50%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#b45309" />
      </linearGradient>
    </defs>
    <polygon
      points="22,14 58,14 72,32 40,70 8,32"
      fill="url(#azkarDiamondRainbow)"
      fillOpacity="0.88"
      stroke="url(#azkarGoldFrame)"
      strokeWidth="2.8"
      strokeLinejoin="round"
    />
    <polygon
      points="22,14 40,32 58,14"
      fill="#ffffff"
      fillOpacity="0.48"
      stroke="url(#azkarGoldFrame)"
      strokeWidth="1.4"
    />
    <line x1="22" y1="14" x2="26" y2="32" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.3" />
    <line x1="58" y1="14" x2="54" y2="32" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.3" />
    <line x1="26" y1="32" x2="40" y2="70" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="1.2" />
    <line x1="54" y1="32" x2="40" y2="70" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="1.2" />
  </svg>
);

interface AzkarViewProps {
  onBack?: () => void;
}

export const AzkarView: React.FC<AzkarViewProps> = ({ onBack }) => {
  const [step, setStep] = useState<AzkarStep>('choose_period');
  const [period, setPeriod] = useState<AzkarPeriod>('morning');
  const [countInput, setCountInput] = useState('5');
  const [countError, setCountError] = useState('');
  const [chosenCount, setChosenCount] = useState(5);
  const [progressById, setProgressById] = useState<Record<string, number>>({});
  const [treasureCopied, setTreasureCopied] = useState(false);
  const [liveTreasureDoc, setLiveTreasureDoc] = useState<ActiveIslamicTreasureDoc | null>(null);
  const celebratedRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeToActiveIslamicTreasure((docData) => {
      setLiveTreasureDoc(docData);
    });
    return () => unsub();
  }, []);

  const fallbackTreasure = useMemo(() => getDailyIslamicTreasure(new Date()), []);
  const activeTreasure = useMemo(() => {
    if (liveTreasureDoc && liveTreasureDoc.factLine1.trim()) {
      return {
        questionLead: liveTreasureDoc.questionLead || 'هل كنت تعرف ؟',
        factLine1: liveTreasureDoc.factLine1,
        factLine2: liveTreasureDoc.factLine2 || '',
        evidenceText: liveTreasureDoc.evidenceText || '',
        evidenceRef: liveTreasureDoc.evidenceRef || '',
        closingNote: liveTreasureDoc.closingNote || '',
      };
    }
    return {
      questionLead: fallbackTreasure.questionLead,
      factLine1: fallbackTreasure.factLines[0],
      factLine2: fallbackTreasure.factLines[1],
      evidenceText: fallbackTreasure.evidenceText,
      evidenceRef: fallbackTreasure.evidenceRef,
      closingNote: fallbackTreasure.closingNote,
    };
  }, [liveTreasureDoc, fallbackTreasure]);

  const formattedToday = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        day: 'numeric',
        month: 'long',
      }).format(new Date());
    } catch {
      return 'اليوم';
    }
  }, []);

  const pool = period === 'morning' ? MORNING_AZKAR : EVENING_AZKAR;
  const maxAvailable = pool.length;

  const selectedAzkar = useMemo<ZekrItem[]>(
    () => (step === 'reading' ? selectAzkarByCount(period, chosenCount) : []),
    [step, period, chosenCount]
  );

  const completedCount = useMemo(
    () =>
      selectedAzkar.filter((item) => (progressById[item.id] || 0) >= item.targetCount).length,
    [selectedAzkar, progressById]
  );

  const allCompleted = selectedAzkar.length > 0 && completedCount === selectedAzkar.length;
  const progressRatio = selectedAzkar.length > 0 ? completedCount / selectedAzkar.length : 0;

  useEffect(() => {
    if (allCompleted && !celebratedRef.current) {
      celebratedRef.current = true;
      void confetti({
        particleCount: 90,
        spread: 85,
        origin: { y: 0.65 },
        colors: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'],
      });
    } else if (!allCompleted) {
      celebratedRef.current = false;
    }
  }, [allCompleted]);

  const handleSelectPeriod = (nextPeriod: AzkarPeriod) => {
    setPeriod(nextPeriod);
    setCountError('');
    const nextMax = nextPeriod === 'morning' ? MORNING_AZKAR.length : EVENING_AZKAR.length;
    setCountInput((prev) => {
      const parsed = Number(prev);
      if (!Number.isFinite(parsed) || parsed < 1) return '5';
      return String(Math.min(nextMax, Math.floor(parsed)));
    });
    setStep('choose_count');
  };

  const handleConfirmCountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(countInput.trim());
    if (!countInput.trim() || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setCountError(`اكتب / اكتبي رقم صحيح بالأرقام يا قمر (من 1 لحد ${maxAvailable}) 🎀💗`);
      return;
    }
    if (parsed < 1 || parsed > maxAvailable) {
      setCountError(`يا بطل / يا بطلة العدد المتاح دلوقتي من 1 لحد ${maxAvailable} ذكر بس 💎🧸`);
      return;
    }

    setCountError('');
    setChosenCount(parsed);
    setProgressById({});
    celebratedRef.current = false;
    setStep('reading');
  };

  const handleIncrementZekr = (item: ZekrItem) => {
    setProgressById((prev) => {
      const current = prev[item.id] || 0;
      if (current >= item.targetCount) return prev;
      return {
        ...prev,
        [item.id]: current + 1,
      };
    });
  };

  const handleCompleteZekrNow = (item: ZekrItem) => {
    setProgressById((prev) => ({
      ...prev,
      [item.id]: item.targetCount,
    }));
  };

  const handleResetProgress = () => {
    setProgressById({});
    celebratedRef.current = false;
  };

  const handleShareTreasure = async () => {
    const factBody = [activeTreasure.factLine1, activeTreasure.factLine2].filter(Boolean).join(' ');
    const evidencePart = [activeTreasure.evidenceText, activeTreasure.evidenceRef]
      .filter(Boolean)
      .join(' ');
    const shareText = [
      activeTreasure.questionLead,
      factBody,
      evidencePart ? `\n${evidencePart}` : '',
      '— معلومة يمكن اول مرة تعرفها · ركن الأذكار الملكي · معسكر مغلق',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'معلومة يمكن اول مرة تعرفها — ركن الأذكار الملكي',
          text: shareText,
        });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }
      setTreasureCopied(true);
      setTimeout(() => setTreasureCopied(false), 2600);
    } catch {
      // User cancelled share sheet or clipboard denied
    }
  };

  return (
    <div className="azkar-3d-stage azkar-royal-stage relative overflow-hidden rounded-[30px] border border-purple-400/40 px-3 py-4 sm:px-6 sm:py-6 text-white shadow-[0_28px_90px_-18px_rgba(124,58,237,0.6)]">
      {/* Ambient Cosmic Starfield Glows */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 right-1/4 h-72 w-72 rounded-full bg-purple-600/25 blur-3xl animate-aurora" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-fuchsia-600/20 blur-3xl animate-aurora-slow" />
        <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-amber-500/15 blur-3xl animate-aurora" />
      </div>

      <div className="relative z-10 space-y-7">
        {/* ============================================================
            1. ROYAL HERO BANNER ("ركن الأذكار الملكي")
            ============================================================ */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38 }}
          className="relative overflow-hidden rounded-[26px] border border-purple-400/45 bg-gradient-to-b from-[#13062c] via-[#1c0942] to-[#110527] px-4 py-6 sm:px-8 sm:py-8 shadow-[0_20px_60px_-15px_rgba(139,92,246,0.5)]"
        >
          {/* Left Visual Half: Open Quran + Glowing Lantern + Crescent + Pink Roses */}
          <div
            aria-hidden="true"
            className="hidden sm:block pointer-events-none absolute inset-y-0 left-0 w-56 md:w-72 lg:w-80 opacity-90"
          >
            <img
              src={azkarQuranLanternImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-left azkar-mask-fade-right mix-blend-lighten"
            />
            <GlowingCrescentSvg className="w-11 h-11 absolute top-5 right-6 drop-shadow-[0_0_16px_rgba(253,224,71,0.85)]" />
          </div>
          <div
            aria-hidden="true"
            className="hidden md:block pointer-events-none absolute -top-6 -left-6 w-40 h-40 opacity-85"
          >
            <img
              src={sakuraClusterImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover lb-mask-vignette mix-blend-lighten"
            />
          </div>

          {/* Right Visual Half: Illuminated Palace Mosque over Lake + Pink Roses */}
          <div
            aria-hidden="true"
            className="hidden sm:block pointer-events-none absolute inset-y-0 right-0 w-56 md:w-72 lg:w-80 opacity-90"
          >
            <img
              src={azkarEveningLakeMosqueImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-left -scale-x-100 azkar-mask-fade-right mix-blend-lighten"
            />
          </div>
          <div
            aria-hidden="true"
            className="hidden md:block pointer-events-none absolute -bottom-6 -right-6 w-44 h-44 opacity-85 -scale-x-100"
          >
            <img
              src={sakuraClusterImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover lb-mask-vignette mix-blend-lighten"
            />
          </div>

          {/* Center Crown + Gold Title + Ornate Badge */}
          <div className="relative z-10 flex flex-col items-center text-center space-y-2.5 sm:px-28 md:px-40">
            {onBack && (
              <div className="w-full flex justify-start sm:absolute sm:top-0 sm:right-0 sm:w-auto">
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-amber-300/40 text-xs font-display font-bold text-amber-100 inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 backdrop-blur-md"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>رجوع للمعسكر 🎀</span>
                </button>
              </div>
            )}

            <div className="relative flex flex-col items-center">
              <div
                aria-hidden="true"
                className="absolute -top-3 w-36 h-16 rounded-full bg-amber-300/35 blur-2xl"
              />
              <AzkarRoyalCrownSvg className="w-16 h-11 sm:w-20 sm:h-14 drop-shadow-[0_0_18px_rgba(251,191,36,0.9)] -mb-1" />
              <h2 className="font-display text-3xl sm:text-4xl lg:text-[44px] font-black azkar-gold-foil leading-tight drop-shadow-[0_4px_22px_rgba(251,191,36,0.5)]">
                ركن الأذكار الملكي
              </h2>
            </div>

            {/* Ornate Golden-Bordered Capsule Subtitle matching Screenshot */}
            <div className="relative inline-flex items-center justify-center pt-1">
              <div className="px-5 sm:px-8 py-1.5 rounded-full bg-[#15072f]/90 border border-amber-300/80 shadow-[0_0_22px_rgba(251,191,36,0.45)] text-xs sm:text-sm font-display font-bold text-amber-100 flex items-center gap-2 whitespace-nowrap">
                <span aria-hidden="true" className="text-amber-300">✨</span>
                <span>من طمأنينة في قلبك .. ونور في يومك</span>
                <span aria-hidden="true" className="text-amber-300">✨</span>
              </div>
            </div>
          </div>
        </motion.header>

        {/* ============================================================
            ANIMATED 3-STEP ROYAL FLOW
            ============================================================ */}
        <AnimatePresence mode="wait">
          {/* STEP 1: Treasures of Islam + Morning/Evening Visual Cards */}
          {step === 'choose_period' && (
            <motion.section
              key="step-period"
              initial={{ opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 230, damping: 24 }}
              className="space-y-7"
            >
              {/* ======================================================
                  2. CENTERPIECE SHOWCASE: "معلومة يمكن اول مرة تعرفها"
                  ====================================================== */}
              <div className="relative pt-6 pb-4">
                {/* Top-Center Overlapping Crest ("معلومة يمكن اول مرة تعرفها") */}
                <div className="relative z-30 flex justify-center -mb-7">
                  <div className="inline-flex items-center gap-3 px-6 sm:px-9 py-2.5 rounded-full bg-gradient-to-b from-[#2c0d59] via-[#1c083d] to-[#13052b] border-[1.5px] border-amber-300/85 shadow-[0_0_32px_rgba(251,191,36,0.45)]">
                    <div className="text-right">
                      <h3 className="font-display text-lg sm:text-2xl lg:text-[25px] font-black azkar-gold-foil leading-tight">
                        معلومة يمكن اول مرة تعرفها
                      </h3>
                      <p className="text-[11px] sm:text-xs font-display font-bold text-amber-100/95">
                        معلومة دينية مميزة كل يوم ✨
                      </p>
                    </div>
                    <BlueGemDiamondSvg className="w-9 h-9 sm:w-11 sm:h-11 drop-shadow-[0_0_16px_rgba(56,189,248,0.85)] shrink-0" />
                  </div>
                </div>

                {/* Main Showcase Frame */}
                <div className="relative overflow-hidden rounded-[28px] border-[1.5px] border-fuchsia-400/70 bg-[#140632] shadow-[0_0_50px_rgba(217,70,239,0.38)] px-4 pt-11 pb-10 sm:px-7 sm:pt-12 sm:pb-12">
                  {/* Left Paradise Waterfall & Hanging Lantern Scene */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-full md:w-[68%] opacity-85"
                  >
                    <img
                      src={azkarTreasuresGardenImg}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-left azkar-mask-fade-right"
                    />
                  </div>

                  {/* Subtle Contrast Scrim behind Center-Right Fact Box */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-l from-[#12042b]/92 via-[#150634]/75 via-55% to-transparent"
                  />

                  {/* Bottom-Right Glowing Lantern + Roses Accent */}
                  <div
                    aria-hidden="true"
                    className="hidden sm:block pointer-events-none absolute -bottom-3 -right-3 w-44 h-44 lg:w-52 lg:h-52 opacity-90"
                  >
                    <img
                      src={azkarHeroLanternRosesImg}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover lb-mask-vignette mix-blend-lighten"
                    />
                  </div>

                  {/* Top-Right Oval Date Pill ("اليوم / 24 نوفمبر") */}
                  <div className="relative z-20 flex justify-end sm:absolute sm:top-5 sm:right-5 mb-4 sm:mb-0">
                    <div className="px-4 py-2 rounded-full bg-gradient-to-br from-[#6d28d9]/95 via-[#7e22ce]/95 to-[#4c1d95]/95 border border-fuchsia-300/65 shadow-[0_0_22px_rgba(168,85,247,0.6)] flex items-center gap-2.5 text-right">
                      <Calendar className="w-5 h-5 text-amber-300 shrink-0" />
                      <div className="leading-tight">
                        <div className="text-[11px] font-bold text-amber-200">اليوم</div>
                        <div className="text-xs sm:text-sm font-display font-black text-white whitespace-nowrap">
                          {formattedToday}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Center-Right Translucent Glass Fact Card */}
                  <div className="relative z-20 max-w-2xl mx-auto md:mr-auto md:ml-24 lg:ml-36 mt-2">
                    {/* Overlapping Pointed Golden Header Pill ("هل كنت تعرف ؟") */}
                    <div className="flex justify-center -mb-4 relative z-20">
                      <div className="px-6 py-1.5 rounded-full bg-gradient-to-r from-[#581c87] via-[#78350f] to-[#581c87] border border-amber-300/85 shadow-[0_0_24px_rgba(251,191,36,0.5)] inline-flex items-center gap-2 text-sm sm:text-base font-display font-black text-amber-200">
                        <Lightbulb className="w-4 h-4 text-amber-300 fill-amber-300/40" />
                        <span>{activeTreasure.questionLead}</span>
                      </div>
                    </div>

                    {/* Glass Body */}
                    <div className="rounded-3xl bg-[#18083d]/82 backdrop-blur-md border border-purple-300/35 px-5 pt-7 pb-5 sm:px-8 text-center space-y-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                      <p className="font-display text-lg sm:text-2xl lg:text-[26px] font-black text-white leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                        {activeTreasure.factLine1}
                        {activeTreasure.factLine2 && (
                          <>
                            <br />
                            {activeTreasure.factLine2}
                          </>
                        )}
                      </p>

                      {/* Inner Evidence Box ("والدليل") */}
                      {(activeTreasure.evidenceText || activeTreasure.evidenceRef) && (
                        <div className="relative rounded-2xl bg-[#240f54]/70 border border-purple-300/30 px-4 py-3.5 space-y-1.5">
                          <div className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-display font-black text-amber-200">
                            <BookOpen className="w-4 h-4 text-amber-300" />
                            <span>والدليل</span>
                            <span aria-hidden="true">✨</span>
                          </div>
                          {activeTreasure.evidenceText && (
                            <p className="font-display text-sm sm:text-lg font-bold text-rose-100 leading-relaxed">
                              {activeTreasure.evidenceText}
                            </p>
                          )}
                          {activeTreasure.evidenceRef && (
                            <div className="text-[11px] sm:text-xs font-semibold text-purple-200/85">
                              {activeTreasure.evidenceRef}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom-Left Ornamental Praise Pill inside Showcase */}
                    {activeTreasure.closingNote && (
                      <div className="mt-4 flex justify-center sm:justify-end">
                        <div className="px-5 py-2 rounded-full bg-gradient-to-r from-[#2e1065]/95 via-[#4c1d95]/95 to-[#2e1065]/95 border border-purple-300/55 shadow-[0_0_20px_rgba(168,85,247,0.4)] inline-flex items-center gap-2 text-xs sm:text-sm font-display font-bold text-white text-center">
                          <Star className="w-4 h-4 text-amber-300 fill-amber-300 shrink-0" />
                          <span>{activeTreasure.closingNote}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom-Center Overlapping Share CTA Pill ("شارك المعلومة") */}
                <div className="relative z-30 flex justify-center -mt-5">
                  <button
                    type="button"
                    onClick={() => void handleShareTreasure()}
                    className="px-7 py-2.5 rounded-full bg-gradient-to-r from-[#6d28d9] via-[#a855f7] to-[#7e22ce] border border-fuchsia-200/85 shadow-[0_0_28px_rgba(217,70,239,0.7)] hover:brightness-110 transition-all text-xs sm:text-sm font-display font-black text-white inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{treasureCopied ? 'تم نسخ المعلومة! 💗' : 'شارك المعلومة'}</span>
                  </button>
                </div>
              </div>

              {/* ======================================================
                  3. BOTTOM 2 SCENIC ACTION CARDS (Morning & Evening)
                  ====================================================== */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                {/* Right Card (RTL Start): أذكار الصباح */}
                <motion.button
                  type="button"
                  onClick={() => handleSelectPeriod('morning')}
                  whileHover={{ y: -5, scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="group relative overflow-hidden rounded-[26px] border-[1.5px] border-amber-300/75 shadow-[0_0_34px_rgba(251,191,36,0.32)] min-h-[265px] sm:min-h-[285px] p-5 sm:p-6 text-right cursor-pointer flex flex-col justify-between bg-[#1c0c04]"
                >
                  {/* Full-Bleed Sunlit Floral Gazebo & Waterfall Background */}
                  <img
                    src={azkarMorningGazeboImg}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="pointer-events-none absolute inset-0 w-full h-full object-cover object-left group-hover:scale-105 transition-transform duration-500"
                  />
                  {/* Smooth Right-Half Warm Amber Contrast Scrim (eliminates seam & maximizes readability) */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-l from-[#1a0a03]/95 via-[#2a1204]/78 via-48% to-transparent"
                  />

                  {/* Top-Right Golden Capsule Header ("أذكار الصباح") */}
                  <div className="relative z-10 flex justify-start">
                    <div className="inline-flex items-center gap-2.5 pl-5 pr-2 py-1.5 rounded-full bg-gradient-to-r from-[#b45309] via-[#f59e0b] to-[#d97706] border border-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.6)]">
                      <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shadow-inner shrink-0">
                        <Sun className="w-5 h-5" />
                      </span>
                      <span className="font-display text-xl sm:text-2xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
                        أذكار الصباح
                      </span>
                    </div>
                  </div>

                  {/* Middle Motivational Text */}
                  <div className="relative z-10 max-w-[230px] sm:max-w-[260px] space-y-1 my-auto py-3">
                    <p className="text-xs sm:text-sm font-display font-bold text-amber-50 leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                      لأن يومك بيبدأ ببركة الله 🥰💗
                    </p>
                  </div>

                  {/* Bottom-Right Golden CTA Capsule */}
                  <div className="relative z-10 flex justify-start">
                    <div className="w-full max-w-[260px] px-4 py-2.5 rounded-full bg-gradient-to-r from-[#592b07]/95 via-[#854d0e]/95 to-[#451a03]/95 border border-amber-300/80 shadow-[0_0_22px_rgba(251,191,36,0.45)] flex items-center justify-between gap-3 group-hover:brightness-110 transition-all">
                      <div className="text-right leading-snug">
                        <div className="text-[11px] sm:text-xs font-display font-bold text-amber-200">
                          دوس / دوسي هنا عشان
                        </div>
                        <div className="text-xs sm:text-sm font-display font-black text-white">
                          تحفظ / تحفظي أذكار الصباح ✨
                        </div>
                      </div>
                      <span className="w-8 h-8 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                        <ArrowLeft className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </motion.button>

                {/* Left Card (RTL End): أذكار المساء */}
                <motion.button
                  type="button"
                  onClick={() => handleSelectPeriod('evening')}
                  whileHover={{ y: -5, scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="group relative overflow-hidden rounded-[26px] border-[1.5px] border-fuchsia-400/75 shadow-[0_0_34px_rgba(192,38,211,0.36)] min-h-[265px] sm:min-h-[285px] p-5 sm:p-6 text-right cursor-pointer flex flex-col justify-between bg-[#100426]"
                >
                  {/* Full-Bleed Moonlit Mosque Lake & Blossoms Background */}
                  <img
                    src={azkarEveningLakeMosqueImg}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="pointer-events-none absolute inset-0 w-full h-full object-cover object-left group-hover:scale-105 transition-transform duration-500"
                  />
                  {/* Right-Half Deep Royal Purple Contrast Scrim */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-l from-[#100428]/95 via-[#1c0842]/76 via-48% to-transparent"
                  />

                  {/* Top-Right Purple Capsule Header ("أذكار المساء") */}
                  <div className="relative z-10 flex justify-start">
                    <div className="inline-flex items-center gap-2.5 pl-5 pr-2 py-1.5 rounded-full bg-gradient-to-r from-[#4c1d95] via-[#7e22ce] to-[#581c87] border border-purple-300/75 shadow-[0_0_24px_rgba(168,85,247,0.6)]">
                      <span className="w-8 h-8 rounded-full bg-purple-950/80 border border-purple-200/70 text-purple-100 flex items-center justify-center shrink-0">
                        <Moon className="w-4 h-4" />
                      </span>
                      <span className="font-display text-xl sm:text-2xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
                        أذكار المساء
                      </span>
                    </div>
                  </div>

                  {/* Middle Motivational Text */}
                  <div className="relative z-10 max-w-[240px] sm:max-w-[270px] space-y-1 my-auto py-3">
                    <p className="text-xs sm:text-sm font-display font-bold text-purple-50 leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                      مساء الجمال والسكينة والهدوء يا أبطال 🎀
                      <br />
                      اختم / اختمي يومك بذكر يريح قلبك ويحفظك
                    </p>
                  </div>

                  {/* Bottom-Right Purple CTA Capsule */}
                  <div className="relative z-10 flex justify-start">
                    <div className="w-full max-w-[260px] px-4 py-2.5 rounded-full bg-gradient-to-r from-[#2e1065]/95 via-[#6b21a8]/95 to-[#1e1b4b]/95 border border-fuchsia-300/75 shadow-[0_0_22px_rgba(192,38,211,0.45)] flex items-center justify-between gap-3 group-hover:brightness-110 transition-all">
                      <div className="text-right leading-snug">
                        <div className="text-[11px] sm:text-xs font-display font-bold text-purple-200">
                          دوس / دوسي هنا عشان
                        </div>
                        <div className="text-xs sm:text-sm font-display font-black text-white">
                          تحفظ / تحفظي أذكار المساء ✨
                        </div>
                      </div>
                      <span className="w-8 h-8 rounded-full bg-purple-400/35 border border-purple-200/60 text-white flex items-center justify-center shrink-0">
                        <ArrowLeft className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </motion.button>
              </div>
            </motion.section>
          )}

          {/* STEP 2: Ask "عاوز كام ذكر؟" with numeric input */}
          {step === 'choose_count' && (
            <motion.section
              key="step-count"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 230, damping: 22 }}
              className="max-w-2xl mx-auto"
            >
              <form
                onSubmit={handleConfirmCountSubmit}
                className="azkar-royal-card-violet relative overflow-hidden rounded-[26px] p-6 sm:p-8 space-y-6 text-center"
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCountError('');
                      setStep('choose_period');
                    }}
                    className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-purple-300/25 text-xs font-bold text-rose-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                    <span>صباح / مساء 🌝🌚</span>
                  </button>

                  <span className="text-xs sm:text-sm font-bold text-amber-300">
                    {period === 'morning' ? 'أذكار الصباح 🌝🌹' : 'أذكار المساء 🌚💎'}
                  </span>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <div className="azkar-crystal-orbit-3d">
                    <DiamondPrism3DSvg className="w-16 h-16 drop-shadow-[0_0_20px_rgba(251,191,36,0.75)]" />
                  </div>
                  <h3 className="font-display text-2xl sm:text-3xl font-black azkar-gold-foil">
                    عاوز كام ذكر؟ 💗🎀🧸
                  </h3>
                  <p className="text-xs sm:text-sm text-rose-100/90 max-w-md leading-relaxed">
                    اكتب / اكتبي في الخانة دي عدد الأذكار اللي نفسك تقرأها دلوقتي من{' '}
                    <span className="font-bold text-amber-300">
                      {period === 'morning' ? 'أذكار الصباح 🌝' : 'أذكار المساء 🌚'}
                    </span>{' '}
                    (المتاح لحد {maxAvailable} ذكر) 🌹💎
                  </p>
                </div>

                <div className="max-w-xs mx-auto space-y-2">
                  <label
                    htmlFor="azkar-count-input"
                    className="block text-xs font-bold text-pink-200"
                  >
                    اكتب / اكتبي العدد هنا يا بطل / يا بطلة 👇🎀
                  </label>
                  <input
                    id="azkar-count-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxAvailable}
                    value={countInput}
                    onChange={(e) => {
                      setCountInput(e.target.value);
                      if (countError) setCountError('');
                    }}
                    placeholder={`مثال: 5 (من 1 لـ ${maxAvailable})`}
                    className="w-full rounded-2xl bg-[#0b041c]/90 border-2 border-amber-300/60 focus:border-cyan-400 focus:outline-none px-4 py-4 text-center text-2xl font-mono-num font-black text-amber-200 shadow-[inset_0_0_24px_rgba(168,85,247,0.22)]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {[3, 5, 7, 10, maxAvailable].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCountInput(String(preset));
                        setCountError('');
                      }}
                      className={`px-3.5 py-2 rounded-full text-xs font-display font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        Number(countInput) === preset
                          ? 'azkar-btn-gold-metallic text-slate-950 scale-105'
                          : 'bg-[#1a0d38]/85 hover:bg-[#261450] border border-purple-300/30 text-rose-100'
                      }`}
                    >
                      {preset === maxAvailable ? `كلهم (${preset}) 🌟` : `${preset} أذكار 💗`}
                    </button>
                  ))}
                </div>

                {countError && (
                  <div className="rounded-2xl bg-rose-950/75 border border-rose-400/50 px-4 py-3 text-xs sm:text-sm font-bold text-rose-200">
                    {countError}
                  </div>
                )}

                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-full font-display font-black text-sm sm:text-base text-white azkar-btn-rainbow-counter hover:brightness-110 transition-all cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Gem className="w-5 h-5 text-amber-200" />
                  <span>هاتلي الأذكار دلوقتي 💎🌹🎀</span>
                </motion.button>
              </form>
            </motion.section>
          )}

          {/* STEP 3: ROYAL COSMIC READING STAGE */}
          {step === 'reading' && (
            <motion.section
              key="step-reading"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
            >
              {/* Top Royal Control Bar with 3D Glowing Alarm Clock */}
              <div className="azkar-royal-card-violet relative overflow-hidden rounded-[26px] px-4 py-5 sm:px-7 sm:py-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-3 text-right flex-1">
                    <div className="space-y-1">
                      <h3 className="font-display text-xl sm:text-2xl font-black text-rose-200 drop-shadow-[0_2px_10px_rgba(244,114,182,0.45)] flex items-center gap-2 flex-wrap">
                        <span>
                          {period === 'morning'
                            ? `أذكار الصباح بتاعتك (${selectedAzkar.length})`
                            : `أذكار المساء بتاعتك (${selectedAzkar.length})`}
                        </span>
                        <span aria-hidden="true">{period === 'morning' ? '🌝🌹' : '🌚💎'}</span>
                      </h3>
                      <p className="text-xs sm:text-sm text-rose-100/90 font-mono-num tabular-nums">
                        خلصت / خلصتي <span className="font-black text-emerald-300">{completedCount}</span> من{' '}
                        <span className="font-black text-amber-300">{selectedAzkar.length}</span> ذكر يا بطل / يا بطلة 💗🎀🧸
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setStep('choose_count')}
                        className="azkar-btn-gold-metallic px-4 py-2 rounded-full text-xs sm:text-sm font-display font-black text-slate-950 inline-flex items-center gap-1.5 cursor-pointer hover:brightness-105 transition-all whitespace-nowrap shrink-0"
                      >
                        <span>تغيير العدد</span>
                        <span aria-hidden="true">🔢</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStep('choose_period')}
                        className="px-4 py-2 rounded-full bg-[#1b0f38]/95 hover:bg-[#27164e] border border-purple-300/35 text-xs sm:text-sm font-display font-bold text-rose-100 inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>صباح / مساء</span>
                        <span aria-hidden="true">🌝🌚</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResetProgress}
                        className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-700/90 to-indigo-700/90 hover:brightness-110 border border-purple-300/45 text-xs sm:text-sm font-display font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shadow-[0_0_18px_rgba(139,92,246,0.45)] transition-all whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>تصفير العدّاد</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 shrink-0 self-end md:self-center">
                    <div className="rounded-2xl bg-[#1c0e3a]/90 border border-purple-300/35 px-3.5 py-2 text-xs sm:text-sm font-display font-bold text-purple-100 shadow-[0_0_16px_rgba(168,85,247,0.35)]">
                      {period === 'morning' ? 'ابدأ / ابدأي يومك بالذكر. 💜..' : 'اختم / اختمي يومك بالذكر. 💜..'}
                    </div>
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0">
                      <img
                        src={azkarAlarmClockImg}
                        alt="منبه الأذكار"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover rounded-full azkar-mask-radial mix-blend-lighten"
                      />
                    </div>
                  </div>
                </div>

                {/* Full-Width Spectrum Progress Bar */}
                <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden p-0.5">
                  <motion.div
                    animate={{ scaleX: progressRatio }}
                    transition={{ type: 'spring', stiffness: 180, damping: 20 }}
                    className="h-full w-full origin-right rounded-full azkar-rainbow-frame"
                  />
                </div>
              </div>

              {allCompleted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="azkar-royal-card-emerald rounded-[26px] p-5 sm:p-6 text-center space-y-2"
                >
                  <div className="text-2xl sm:text-3xl">💗💎🌹🎀🧸🌝🌚</div>
                  <h4 className="font-display text-xl sm:text-2xl font-black azkar-gold-foil">
                    اللهم بارك! عاش يا أحلى بطل / بطلة في الدنيا كلها 🎉💎
                  </h4>
                  <p className="text-xs sm:text-sm text-emerald-200 font-semibold">
                    خلصت / خلصتي كل الـ {selectedAzkar.length} أذكار اللي طلبتهم! ربنا يفتحلك أبواب الفهم والتوفيق والبركة يا قمر 💗✨
                  </p>
                </motion.div>
              )}

              {/* Wide Royal Azkar Cards List */}
              <div className="space-y-6">
                {selectedAzkar.map((item, idx) => {
                  const currentCount = progressById[item.id] || 0;
                  const isDone = currentCount >= item.targetCount;
                  const isGoldVariant = idx % 2 === 0;
                  const cardVariantClass = isDone
                    ? 'azkar-royal-card-emerald'
                    : isGoldVariant
                      ? 'azkar-royal-card-gold'
                      : 'azkar-royal-card-violet';
                  const sideArtSrc = isGoldVariant ? azkarQuranLanternImg : azkarMosqueMoonImg;

                  return (
                    <motion.article
                      key={item.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.04, 0.35), type: 'spring', stiffness: 210, damping: 22 }}
                      className={`${cardVariantClass} relative overflow-hidden rounded-[26px] p-5 sm:p-7`}
                    >
                      <div aria-hidden="true" className="hidden sm:block pointer-events-none absolute top-4 left-1/3 opacity-70">
                        <CrystalShardSvg className="w-6 h-6" />
                      </div>
                      <div aria-hidden="true" className="hidden sm:block pointer-events-none absolute bottom-4 left-4 opacity-60">
                        <CrystalShardSvg className="w-6 h-6" />
                      </div>

                      <div className="relative z-10 space-y-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-3 rounded-full bg-[#1a0d38]/90 border border-amber-300/35 px-2 py-1.5 pl-5 shadow-[0_0_20px_rgba(0,0,0,0.45)]">
                            <div className="relative w-9 h-9 rounded-full azkar-gold-medallion text-slate-950 font-mono-num font-black text-base flex items-center justify-center shrink-0">
                              {idx === 0 && (
                                <Crown
                                  aria-hidden="true"
                                  className="w-4 h-4 text-amber-300 absolute -top-3.5 left-1/2 -translate-x-1/2 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]"
                                />
                              )}
                              <span>{idx + 1}</span>
                            </div>

                            <h4 className="font-display text-base sm:text-xl font-black text-amber-200 flex items-center gap-2">
                              <span>{item.title}</span>
                              <span aria-hidden="true">{isDone ? '💎✅' : isGoldVariant ? '💎' : '🌸'}</span>
                            </h4>
                          </div>

                          <span className="hidden sm:inline-block text-xs text-purple-200/80 font-mono-num tabular-nums">
                            {isDone ? 'مكتمل 💗' : `التكرار: ${item.targetCount}`}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_280px] gap-5 items-center">
                          <div className="space-y-3 text-right">
                            <p className="font-display text-lg sm:text-xl md:text-[22px] leading-[2.05] text-white font-semibold">
                              {item.text}
                            </p>

                            <p className="text-xs sm:text-sm text-pink-200/95 leading-relaxed">
                              <span className="font-bold text-amber-300">الفايدة يا قمر 💜 : </span>
                              {item.benefitEgyptian}
                            </p>
                          </div>

                          <div
                            aria-hidden="true"
                            className="relative mx-auto w-56 h-40 sm:w-64 sm:h-48 md:w-full md:h-52 rounded-2xl overflow-hidden bg-[#120624]/40 flex items-center justify-center"
                          >
                            <img
                              src={sideArtSrc}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover azkar-mask-card-art mix-blend-lighten"
                            />
                          </div>
                        </div>

                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                          <motion.button
                            type="button"
                            onClick={() => handleIncrementZekr(item)}
                            disabled={isDone}
                            whileTap={isDone ? undefined : { scale: 0.97 }}
                            className={`flex-1 min-w-[210px] py-3 px-6 rounded-full font-display font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-default whitespace-nowrap ${
                              isDone
                                ? 'bg-gradient-to-r from-emerald-500/35 to-cyan-500/35 border border-emerald-300/65 text-emerald-100'
                                : 'azkar-btn-rainbow-counter text-white hover:brightness-110'
                            }`}
                          >
                            {isDone ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                                <span>عاش! خلصت / خلصتي ({currentCount}/{item.targetCount}) 💎💗</span>
                              </>
                            ) : (
                              <>
                                <Heart className="w-4 h-4 text-pink-200 fill-pink-200/80" />
                                <span className="font-mono-num tabular-nums">
                                  سبّح هنا 💗 ({currentCount} / {item.targetCount})
                                </span>
                              </>
                            )}
                          </motion.button>

                          {!isDone && item.targetCount > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleCompleteZekrNow(item)}
                              title="خلصت كل التكرارات"
                              className="azkar-btn-gold-metallic px-5 py-3 rounded-full text-slate-950 text-xs sm:text-sm font-display font-black inline-flex items-center gap-1.5 cursor-pointer hover:brightness-105 transition-all whitespace-nowrap shrink-0"
                            >
                              <Check className="w-4 h-4" />
                              <span>خلصته كله 🎀</span>
                            </button>
                          ) : (
                            <span className="text-base sm:text-lg px-2 select-none" aria-hidden="true">
                              {isDone ? '💎🎀' : '🧸💎'}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Royal Footer */}
        <footer className="pt-2 pb-1 text-center space-y-1">
          <div className="inline-flex items-center justify-center gap-2">
            <Crown className="w-4 h-4 text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.85)]" />
            <span className="font-display text-base sm:text-lg font-black azkar-gold-foil tracking-wide">
              DUO CAMP
            </span>
          </div>
          <p className="text-xs text-amber-200/85 font-display font-bold flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>سوا .. لمستقبل أحلى — ربنا يتقبل منكم ويحفظكم دايمًا 💗🌝🌚🎀🧸</span>
          </p>
        </footer>
      </div>
    </div>
  );
};
