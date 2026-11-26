import { CrystalQuestionStyle, MessageTypeKey, StudyTrackKey, SubjectKey, TaskTypeKey } from '../types/camp';

export const HERO_ARTWORK_URL = '/src/assets/images/hero_study_camp_1795114444849.jpg';
export const FLORAL_SANCTUARY_HERO_URL = '/src/assets/images/floral_sanctuary_hero_1795120240498.jpg';
export const FLORAL_VIGNETTE_URL = '/src/assets/images/floral_garden_vignette_1795120240813.jpg';

export interface AvatarOption {
  id: string;
  label: string;
  url: string;
  accent: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: 'botanical',
    label: 'زهرة الأحياء',
    url: '/src/assets/images/avatar_botanical_scholar_1795114445805.jpg',
    accent: 'from-pink-500 via-rose-400 to-purple-500',
  },
  {
    id: 'cosmic',
    label: 'نجمة الفضاء',
    url: '/src/assets/images/avatar_cosmic_scholar_1795114448000.jpg',
    accent: 'from-cyan-500 via-sky-500 to-violet-500',
  },
  {
    id: 'alchemist',
    label: 'بلورة الكيمياء',
    url: '/src/assets/images/avatar_emerald_alchemist_1795114444860.jpg',
    accent: 'from-emerald-500 via-teal-400 to-amber-400',
  },
  {
    id: 'physicist',
    label: 'سحابة الفيزياء',
    url: '/src/assets/images/avatar_sky_physicist_1795114445313.jpg',
    accent: 'from-sky-400 via-fuchsia-400 to-pink-500',
  },
];

// Validation lengths synchronized verbatim with firebase-blueprint.json & firestore.rules
export const FIELD_LIMITS = {
  DISPLAY_NAME_MAX: 50,
  AVATAR_URL_MAX: 40000,
  CAMP_NAME_MIN: 2,
  CAMP_NAME_MAX: 80,
  CAMP_HERO_URL_MAX: 60000,
  TASK_TITLE_MAX: 140,
  TASK_NOTES_MAX: 400,
  TASK_BG_URL_MAX: 60000,
  CUSTOM_LABEL_MAX: 40,
  MESSAGE_CONTENT_MAX: 1000,
  QUESTION_IMAGE_URL_MAX: 90000,
  LAST_ACTIVITY_MAX: 160,
  NOTIFICATION_TITLE_MAX: 120,
  NOTIFICATION_BODY_MAX: 240,
  REACTION_MAX: 32,
} as const;

export const GROUP_CAMP_LIMITS = {
  MAX_MEMBERS_HARD_CAP: 50,
  CAMP_NAME_MIN: 2,
  CAMP_NAME_MAX: 80,
  CAMP_DESC_MAX: 500,
  COVER_URL_MAX: 180000,
  EXAM_TITLE_MIN: 2,
  EXAM_TITLE_MAX: 120,
  EXAM_SUBJECT_MAX: 60,
  EXAM_UNIT_MAX: 80,
  EXAM_DESC_MAX: 1000,
  EXAM_INSTRUCTIONS_MAX: 2000,
  QUESTION_PROMPT_MAX: 2000,
  QUESTION_IMAGE_URL_MAX: 220000,
  QUESTION_OPTION_MAX: 400,
  QUESTION_EXPLANATION_MAX: 1000,
  MAX_QUESTIONS_PER_EXAM: 150,
  MAX_ATTEMPTS_PER_EXAM: 10,
  MAX_DURATION_MINUTES: 360,
  MEMBERS_PAGE_SIZE: 15,
  EXAMS_PAGE_SIZE: 12,
  VISITORS_PAGE_SIZE: 30,
} as const;

export const ARABIC_OPTION_LETTERS = ['أ', 'ب', 'ج', 'د'] as const;

export const SCIENTIFIC_SYMBOL_SNIPPETS = [
  '×',
  '÷',
  '±',
  '√',
  '∑',
  'π',
  '∞',
  '≈',
  '≠',
  '≤',
  '≥',
  '→',
  '⇌',
  'Δ',
  '°',
  '²',
  '³',
  '⁻¹',
  'α',
  'β',
  'γ',
  'θ',
  'λ',
  'Ω',
] as const;

export const TRACK_ORDER: StudyTrackKey[] = ['literary', 'science_bio', 'science_math'];

export const TRACK_CONFIG: Record<
  StudyTrackKey,
  {
    label: string;
    emoji: string;
    subjects: SubjectKey[];
    gradient: string;
  }
> = {
  literary: {
    label: 'أدبي',
    emoji: '📚',
    subjects: ['arabic', 'english', 'history', 'geography', 'statistics'],
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
  },
  science_bio: {
    label: 'علمي علوم',
    emoji: '🧬',
    subjects: ['arabic', 'english', 'biology', 'chemistry', 'physics'],
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
  },
  science_math: {
    label: 'علمي رياضة',
    emoji: '📐',
    subjects: ['arabic', 'english', 'math', 'chemistry', 'physics'],
    gradient: 'from-violet-500 via-purple-500 to-indigo-500',
  },
};

export const SUBJECT_ORDER: SubjectKey[] = [
  'arabic',
  'english',
  'biology',
  'chemistry',
  'physics',
  'math',
  'history',
  'geography',
  'statistics',
];

export const SUBJECT_CONFIG: Record<
  SubjectKey,
  {
    label: string;
    gradient: string;
    softBg: string;
    border: string;
    text: string;
    barColor: string;
    ringHex: string;
  }
> = {
  arabic: {
    label: 'اللغة العربية',
    gradient: 'from-rose-500 via-pink-500 to-fuchsia-500',
    softBg: 'bg-rose-50/90 dark:bg-rose-950/45',
    border: 'border-rose-200 dark:border-rose-500/30',
    text: 'text-rose-800 dark:text-rose-300',
    barColor: 'bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500',
    ringHex: '#f43f5e',
  },
  english: {
    label: 'اللغة الأجنبية الأولى',
    gradient: 'from-blue-500 via-indigo-500 to-violet-500',
    softBg: 'bg-indigo-50/90 dark:bg-indigo-950/45',
    border: 'border-indigo-200 dark:border-indigo-500/30',
    text: 'text-indigo-800 dark:text-indigo-300',
    barColor: 'bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500',
    ringHex: '#6366f1',
  },
  biology: {
    label: 'الأحياء',
    gradient: 'from-emerald-500 via-teal-500 to-lime-500',
    softBg: 'bg-emerald-50/90 dark:bg-emerald-950/45',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    text: 'text-emerald-800 dark:text-emerald-300',
    barColor: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-lime-400',
    ringHex: '#10b981',
  },
  chemistry: {
    label: 'الكيمياء',
    gradient: 'from-cyan-500 via-sky-500 to-teal-400',
    softBg: 'bg-cyan-50/90 dark:bg-cyan-950/45',
    border: 'border-cyan-200 dark:border-cyan-500/30',
    text: 'text-cyan-800 dark:text-cyan-300',
    barColor: 'bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500',
    ringHex: '#06b6d4',
  },
  physics: {
    label: 'الفيزياء',
    gradient: 'from-purple-500 via-fuchsia-500 to-pink-500',
    softBg: 'bg-purple-50/90 dark:bg-purple-950/45',
    border: 'border-purple-200 dark:border-purple-500/30',
    text: 'text-purple-800 dark:text-purple-300',
    barColor: 'bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500',
    ringHex: '#a855f7',
  },
  math: {
    label: 'الرياضيات',
    gradient: 'from-violet-500 via-indigo-500 to-sky-500',
    softBg: 'bg-violet-50/90 dark:bg-violet-950/45',
    border: 'border-violet-200 dark:border-violet-500/30',
    text: 'text-violet-800 dark:text-violet-300',
    barColor: 'bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500',
    ringHex: '#8b5cf6',
  },
  history: {
    label: 'التاريخ',
    gradient: 'from-amber-500 via-orange-500 to-red-500',
    softBg: 'bg-amber-50/90 dark:bg-amber-950/45',
    border: 'border-amber-200 dark:border-amber-500/30',
    text: 'text-amber-800 dark:text-amber-300',
    barColor: 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500',
    ringHex: '#f59e0b',
  },
  geography: {
    label: 'الجغرافيا',
    gradient: 'from-teal-500 via-emerald-500 to-sky-500',
    softBg: 'bg-teal-50/90 dark:bg-teal-950/45',
    border: 'border-teal-200 dark:border-teal-500/30',
    text: 'text-teal-800 dark:text-teal-300',
    barColor: 'bg-gradient-to-r from-teal-500 via-emerald-500 to-sky-500',
    ringHex: '#14b8a6',
  },
  statistics: {
    label: 'الإحصاء',
    gradient: 'from-fuchsia-500 via-pink-500 to-orange-400',
    softBg: 'bg-fuchsia-50/90 dark:bg-fuchsia-950/45',
    border: 'border-fuchsia-200 dark:border-fuchsia-500/30',
    text: 'text-fuchsia-800 dark:text-fuchsia-300',
    barColor: 'bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400',
    ringHex: '#d946ef',
  },
  geology: {
    label: 'الجيولوجيا',
    gradient: 'from-amber-500 via-orange-500 to-yellow-500',
    softBg: 'bg-amber-50/90 dark:bg-amber-950/45',
    border: 'border-amber-200 dark:border-amber-500/30',
    text: 'text-amber-800 dark:text-amber-300',
    barColor: 'bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500',
    ringHex: '#f59e0b',
  },
};

export const TASK_TYPE_CONFIG: Record<
  TaskTypeKey,
  { label: string; isLecture: boolean; accentText: string }
> = {
  watch_lecture: { label: 'مشاهدة محاضرة', isLecture: true, accentText: 'text-pink-700 dark:text-pink-300' },
  study_lecture: { label: 'مذاكرة محاضرة', isLecture: true, accentText: 'text-violet-700 dark:text-violet-300' },
  solve_homework: { label: 'حل واجب', isLecture: false, accentText: 'text-cyan-700 dark:text-cyan-300' },
  solve_questions: { label: 'حل أسئلة', isLecture: false, accentText: 'text-emerald-700 dark:text-emerald-300' },
  revision: { label: 'مراجعة', isLecture: false, accentText: 'text-amber-700 dark:text-amber-300' },
  comprehensive_exam: { label: 'امتحان شامل', isLecture: false, accentText: 'text-rose-700 dark:text-rose-300' },
  custom: { label: 'مهمة مخصصة', isLecture: false, accentText: 'text-indigo-700 dark:text-indigo-300' },
};

export const MESSAGE_TYPE_CONFIG: Record<
  MessageTypeKey,
  {
    label: string;
    emoji: string;
    cardGradient: string;
    borderClass: string;
    accentColor: string;
  }
> = {
  normal: {
    label: 'رسالة عادية',
    emoji: '💬',
    cardGradient: 'from-sky-50/95 via-white to-cyan-50/90 dark:from-sky-950/70 dark:via-slate-900/90 dark:to-cyan-950/60',
    borderClass: 'border-sky-200/80 dark:border-sky-500/30',
    accentColor: 'text-sky-700 dark:text-sky-300',
  },
  advice: {
    label: 'نصيحة',
    emoji: '💡',
    cardGradient: 'from-amber-50/95 via-orange-50/70 to-yellow-50/90 dark:from-amber-950/65 dark:via-slate-900/90 dark:to-orange-950/55',
    borderClass: 'border-amber-200/80 dark:border-amber-500/30',
    accentColor: 'text-amber-800 dark:text-amber-300',
  },
  dua: {
    label: 'دعاء',
    emoji: '🤲',
    cardGradient: 'from-emerald-50/95 via-white to-teal-50/90 dark:from-emerald-950/65 dark:via-slate-900/90 dark:to-teal-950/60',
    borderClass: 'border-emerald-200/80 dark:border-emerald-500/30',
    accentColor: 'text-emerald-800 dark:text-emerald-300',
  },
  quote: {
    label: 'اقتباس تحفيزي',
    emoji: '✨',
    cardGradient: 'from-violet-50/95 via-white to-purple-50/90 dark:from-violet-950/70 dark:via-slate-900/90 dark:to-purple-950/65',
    borderClass: 'border-violet-200/80 dark:border-violet-500/30',
    accentColor: 'text-violet-800 dark:text-violet-300',
  },
  love: {
    label: 'دعم وصداقة للنجاح',
    emoji: '💖',
    cardGradient: 'from-pink-50/95 via-rose-50/80 to-fuchsia-50/90 dark:from-pink-950/70 dark:via-slate-900/90 dark:to-fuchsia-950/60',
    borderClass: 'border-pink-200/90 dark:border-pink-500/35',
    accentColor: 'text-pink-700 dark:text-pink-300',
  },
  custom: {
    label: 'رسالة مخصصة',
    emoji: '🎀',
    cardGradient: 'from-orange-50/95 via-rose-50/70 to-purple-50/90 dark:from-rose-950/65 dark:via-slate-900/90 dark:to-purple-950/60',
    borderClass: 'border-rose-200/80 dark:border-rose-500/30',
    accentColor: 'text-rose-700 dark:text-rose-300',
  },
};

export const MESSAGE_REACTION_EMOJIS = [
  '❤️',
  '🔥',
  '👏',
  '🤲',
  '🌟',
  '🥰',
  '💪',
  '🎉',
] as const;

export const QUESTION_REACTION_EMOJIS = [
  '🌹',
  '🌸',
  '💖',
  '🥹',
  '🌿',
  '🥰',
  '✨',
  '👏',
] as const;

export const CRYSTAL_QUESTION_STYLES: Record<
  CrystalQuestionStyle,
  {
    label: string;
    emoji: string;
    cardBg: string;
    borderClass: string;
    petalPrimary: string;
    petalSecondary: string;
    glowClass: string;
    accentText: string;
  }
> = {
  rose_quartz: {
    label: 'ورد جوري دمشقي',
    emoji: '🌹',
    cardBg:
      'from-[#FFF7F5] via-[#FFFDFC] to-[#FDF0F3] dark:from-[#2B141D]/95 dark:via-[#22121A]/95 dark:to-[#1B131E]/95',
    borderClass: 'border-rose-200/85 dark:border-rose-400/25',
    petalPrimary: '#fb7185',
    petalSecondary: '#fda4af',
    glowClass:
      'shadow-[0_14px_34px_-14px_rgba(225,29,72,0.18)] dark:shadow-[0_18px_42px_-16px_rgba(244,63,94,0.28)]',
    accentText: 'text-rose-700 dark:text-rose-300',
  },
  starlight_gold: {
    label: 'ياسمين شمس الغروب',
    emoji: '🌼',
    cardBg:
      'from-[#FFFBF2] via-[#FFFEFA] to-[#FFF4E6] dark:from-[#281E12]/95 dark:via-[#211813]/95 dark:to-[#1E151B]/95',
    borderClass: 'border-amber-200/85 dark:border-amber-400/25',
    petalPrimary: '#f59e0b',
    petalSecondary: '#fbcfe8',
    glowClass:
      'shadow-[0_14px_34px_-14px_rgba(217,119,6,0.16)] dark:shadow-[0_18px_42px_-16px_rgba(245,158,11,0.24)]',
    accentText: 'text-amber-800 dark:text-amber-300',
  },
  aurora_amethyst: {
    label: 'ندى المروج الخضراء',
    emoji: '🌿',
    cardBg:
      'from-[#F3FAF5] via-[#FCFEFD] to-[#EEF7F1] dark:from-[#12241C]/95 dark:via-[#141F1B]/95 dark:to-[#161D24]/95',
    borderClass: 'border-emerald-200/85 dark:border-emerald-400/25',
    petalPrimary: '#34d399',
    petalSecondary: '#a7f3d0',
    glowClass:
      'shadow-[0_14px_34px_-14px_rgba(16,185,129,0.16)] dark:shadow-[0_18px_42px_-16px_rgba(52,211,153,0.22)]',
    accentText: 'text-emerald-800 dark:text-emerald-300',
  },
  toty_sapphire: {
    label: 'زهر الكرز والبحيرة',
    emoji: '🌸',
    cardBg:
      'from-[#FDF6FA] via-[#FFFCFE] to-[#F2F7FD] dark:from-[#22162A]/95 dark:via-[#1A1626]/95 dark:to-[#121D2D]/95',
    borderClass: 'border-pink-200/85 dark:border-pink-400/25',
    petalPrimary: '#ec4899',
    petalSecondary: '#93c5fd',
    glowClass:
      'shadow-[0_14px_34px_-14px_rgba(236,72,153,0.16)] dark:shadow-[0_18px_42px_-16px_rgba(244,114,182,0.24)]',
    accentText: 'text-pink-700 dark:text-pink-300',
  },
};
