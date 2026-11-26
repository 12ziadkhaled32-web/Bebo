import React, { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Link2,
  Reply,
  Send,
  SmilePlus,
  Sprout,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import bouquetImg from '../assets/images/little_question/bouquet.png';
import composerRoseImg from '../assets/images/little_question/composer_rose.png';
import envelopeRosesImg from '../assets/images/little_question/envelope_roses.png';
import footerCatsLeftImg from '../assets/images/little_question/footer_cats_left.jpg';
import footerRightLanternImg from '../assets/images/little_question/footer_right_clean.jpg';
import heartGlowImg from '../assets/images/little_question/heart_glow_clean.png';
import heroLeftSceneImg from '../assets/images/little_question/hero_left_scene.jpg';
import heroSwirlBrImg from '../assets/images/little_question/hero_swirl_br.png';
import {
  CRYSTAL_QUESTION_STYLES,
  FIELD_LIMITS,
  QUESTION_REACTION_EMOJIS,
} from '../constants/campConfig';
import { trackMessageSent } from '../lib/analytics';
import { compressQuestionImageFile, isValidQuestionImageInput } from '../lib/avatarUtils';
import { formatRelativeArabicTime } from '../lib/campUtils';
import {
  deleteGroupLittleQuestion,
  sendGroupLittleQuestion,
  toggleGroupLittleQuestionReaction,
} from '../services/groupCampService';
import { GroupCamp, LittleQuestion, UserProfile } from '../types/camp';
import { AvatarImage } from './Decorations';

interface LittleQuestionViewProps {
  camp: GroupCamp;
  profile: UserProfile;
  questions: LittleQuestion[];
}

const EMOJI_CHAR_REGEX =
  /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]{2}|\u20e3/u;

function splitGraphemes(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const SegmenterCtor = (
      Intl as unknown as {
        Segmenter: new (
          locale: string,
          opts: { granularity: 'grapheme' }
        ) => { segment: (input: string) => Iterable<{ segment: string }> };
      }
    ).Segmenter;
    const segmenter = new SegmenterCtor('ar', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(trimmed), (s) => s.segment);
  }
  return Array.from(trimmed);
}

function extractEmojiGrapheme(input: string): string {
  const graphemes = splitGraphemes(input);
  for (let i = graphemes.length - 1; i >= 0; i--) {
    const g = graphemes[i].trim();
    if (g && EMOJI_CHAR_REGEX.test(g) && g.length <= FIELD_LIMITS.REACTION_MAX) {
      return g;
    }
  }
  return '';
}

interface AggregatedReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

function summarizeReactions(
  target: LittleQuestion,
  myUid: string
): { myReaction: string; entries: AggregatedReaction[] } {
  const map = target.reactions || {};
  const counts = new Map<string, number>();
  const keys = Object.keys(map);
  if (keys.length === 0 && target.partnerReaction) {
    counts.set(target.partnerReaction, 1);
  } else {
    for (const uid of keys) {
      const emoji = map[uid];
      if (!emoji) continue;
      counts.set(emoji, (counts.get(emoji) || 0) + 1);
    }
  }
  const myReaction = map[myUid] || '';
  const entries: AggregatedReaction[] = Array.from(counts.entries())
    .map(([emoji, count]) => ({
      emoji,
      count,
      mine: myReaction === emoji,
    }))
    .sort((a, b) => b.count - a.count);
  return { myReaction, entries };
}

const GlowingGoldenHeartSvg: React.FC<{ className?: string }> = ({
  className = 'w-9 h-9',
}) => (
  <svg
    viewBox="0 0 48 44"
    fill="none"
    aria-hidden="true"
    className={className}
  >
    <defs>
      <linearGradient id="lqGoldHeartStroke" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff7cc" />
        <stop offset="50%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
    <path
      d="M24 39.5C24 39.5 6.5 28.4 6.5 15.2C6.5 9.8 10.7 5.5 16 5.5C19.6 5.5 22.6 7.5 24 10.5C25.4 7.5 28.4 5.5 32 5.5C37.3 5.5 41.5 9.8 41.5 15.2C41.5 28.4 24 39.5 24 39.5Z"
      stroke="url(#lqGoldHeartStroke)"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HangingGoldenHeartsDivider: React.FC = () => (
  <div
    aria-hidden="true"
    className="hidden lg:flex pointer-events-none absolute -top-5 left-[58.333%] -translate-x-1/2 z-20 flex-col items-center select-none"
  >
    <svg
      viewBox="0 0 72 340"
      fill="none"
      className="w-16 h-[310px] drop-shadow-[0_0_12px_rgba(251,191,36,0.85)]"
    >
      <defs>
        <linearGradient id="lqChainGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* Top fine golden chain */}
      <line x1="36" y1="0" x2="36" y2="112" stroke="url(#lqChainGold)" strokeWidth="1.6" strokeDasharray="3 3" />
      {/* Heart 1 */}
      <path
        d="M36 140C36 140 22 130 22 120C22 115.6 25.4 112 29.6 112C32.4 112 34.8 113.6 36 116C37.2 113.6 39.6 112 42.4 112C46.6 112 50 115.6 50 120C50 130 36 140 36 140Z"
        stroke="#fde047"
        strokeWidth="2.4"
        fill="#fbbf24"
        fillOpacity="0.12"
      />
      <line x1="36" y1="142" x2="36" y2="188" stroke="url(#lqChainGold)" strokeWidth="1.4" strokeDasharray="3 3" />
      {/* Heart 2 */}
      <path
        d="M36 222C36 222 18 209 18 197C18 191.5 22.3 187 27.6 187C31.1 187 34.2 189 36 192.2C37.8 189 40.9 187 44.4 187C49.7 187 54 191.5 54 197C54 209 36 222 36 222Z"
        stroke="#fde047"
        strokeWidth="2.6"
        fill="#fbbf24"
        fillOpacity="0.15"
      />
      <line x1="36" y1="224" x2="36" y2="270" stroke="url(#lqChainGold)" strokeWidth="1.4" strokeDasharray="3 3" />
      {/* Heart 3 */}
      <path
        d="M36 308C36 308 16 294 16 280.5C16 274.2 21 269 27 269C31 269 34.3 271.2 36 274.8C37.7 271.2 41 269 45 269C51 269 56 274.2 56 280.5C56 294 36 308 36 308Z"
        stroke="#fef08a"
        strokeWidth="2.8"
        fill="#fbbf24"
        fillOpacity="0.18"
      />
      {/* Sparkling dust motes */}
      <circle cx="24" cy="96" r="1.6" fill="#fef08a" />
      <circle cx="48" cy="164" r="1.5" fill="#fde047" />
      <circle cx="22" cy="248" r="1.8" fill="#fef08a" />
      <circle cx="50" cy="322" r="1.5" fill="#fde047" />
    </svg>
  </div>
);

const GoldenFlourishSvg: React.FC<{ flip?: boolean }> = ({ flip = false }) => (
  <svg
    viewBox="0 0 64 20"
    fill="none"
    aria-hidden="true"
    className={`w-10 sm:w-14 h-4 shrink-0 ${flip ? '-scale-x-100' : ''}`}
  >
    <path
      d="M2 10H48M48 10C43 6 40 4 36 4C39 7 41 9 48 10ZM48 10C43 14 40 16 36 16C39 13 41 11 48 10ZM54 10L60 6L58 10L60 14L54 10Z"
      stroke="#fbbf24"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="54" cy="10" r="1.6" fill="#fef08a" />
  </svg>
);

export const LittleQuestionView: React.FC<LittleQuestionViewProps> = ({
  camp,
  profile,
  questions,
}) => {
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageLinkInput, setShowImageLinkInput] = useState(false);
  const [imageLinkDraft, setImageLinkDraft] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Emoji reaction state (presets + phone keyboard)
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [customEmojiInputs, setCustomEmojiInputs] = useState<Record<string, string>>({});
  const [keyboardInputHint, setKeyboardInputHint] = useState('');
  const keyboardInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Nested reply state (supports text + optional reply photo)
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyImages, setReplyImages] = useState<Record<string, string>>({});
  const [replyImageBusyId, setReplyImageBusyId] = useState<string | null>(null);
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState('');

  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replyFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const replyTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const partnerName = 'صحابك وزمايلك في المعسكر';

  const { rootQuestions, repliesByParent, totalRepliesCount } = useMemo(() => {
    const roots: LittleQuestion[] = [];
    const byParent = new Map<string, LittleQuestion[]>();

    for (const q of questions) {
      if (q.parentQuestionId) {
        const list = byParent.get(q.parentQuestionId) || [];
        list.push(q);
        byParent.set(q.parentQuestionId, list);
      } else {
        roots.push(q);
      }
    }

    let attachedReplies = 0;
    const rootIds = new Set(roots.map((r) => r.id));

    for (const [parentId, list] of byParent.entries()) {
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        const tb = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
      if (rootIds.has(parentId)) {
        attachedReplies += list.length;
      }
    }

    return {
      rootQuestions: roots,
      repliesByParent: byParent,
      totalRepliesCount: attachedReplies,
    };
  }, [questions]);

  const handleFocusComposer = () => {
    composerTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  };

  const handleUploadQuestionPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setImageBusy(true);
    try {
      const compressed = await compressQuestionImageFile(file);
      setImageUrl(compressed);
      setShowImageLinkInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'مقدرناش نجهّز الصورة.');
    } finally {
      setImageBusy(false);
    }
  };

  const handleApplyImageLink = () => {
    const cleaned = imageLinkDraft.trim();
    if (!cleaned.startsWith('https://') || !isValidQuestionImageInput(cleaned)) {
      setError('حط / حطي رابط صورة آمن بيبدأ بـ https://');
      return;
    }
    setError('');
    setImageUrl(cleaned);
    setImageLinkDraft('');
    setShowImageLinkInput(false);
  };

  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    const cleanedImg = imageUrl.trim();
    if (!trimmed && !cleanedImg) {
      setError('اكتب / اكتبي سؤال أو حط صورة للسؤال الأول.');
      return;
    }
    if (cleanedImg && !isValidQuestionImageInput(cleanedImg)) {
      setError('صورة السؤال مش مظبوطة.');
      return;
    }

    setError('');
    setBusy(true);
    try {
      await sendGroupLittleQuestion({
        camp,
        senderUid: profile.uid,
        senderName: profile.displayName,
        senderAvatar: profile.avatarUrl,
        crystalStyle: 'rose_quartz',
        content: trimmed,
        imageUrl: cleanedImg,
      });
      trackMessageSent({
        channel: 'little_question',
        messageType: 'question',
        isReply: false,
        isBanner: false,
        hasImage: Boolean(cleanedImg),
      });
      setContent('');
      setImageUrl('');
      setImageLinkDraft('');
      setShowImageLinkInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'مقدرناش نبعت السؤال دلوقتي.');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadReplyPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    questionId: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReplyError('');
    setReplyImageBusyId(questionId);
    try {
      const compressed = await compressQuestionImageFile(file);
      setReplyImages((prev) => ({ ...prev, [questionId]: compressed }));
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'مقدرناش نجهّز صورة الرد.');
    } finally {
      setReplyImageBusyId(null);
    }
  };

  const handleSendReply = async (
    e: React.FormEvent,
    parentQuestion: LittleQuestion
  ) => {
    e.preventDefault();
    const draft = (replyDrafts[parentQuestion.id] || '').trim();
    const replyImg = (replyImages[parentQuestion.id] || '').trim();
    if (!draft && !replyImg) {
      setReplyError('اكتب / اكتبي ردك أو حط صورة للحل الأول.');
      replyTextareaRefs.current[parentQuestion.id]?.focus();
      return;
    }

    setReplyError('');
    setReplyBusyId(parentQuestion.id);
    try {
      await sendGroupLittleQuestion({
        camp,
        senderUid: profile.uid,
        senderName: profile.displayName,
        senderAvatar: profile.avatarUrl,
        crystalStyle: parentQuestion.crystalStyle,
        content: draft,
        imageUrl: replyImg,
        parentQuestionId: parentQuestion.id,
      });
      trackMessageSent({
        channel: 'little_question',
        messageType: 'question',
        isReply: true,
        isBanner: false,
        hasImage: Boolean(replyImg),
      });
      setReplyDrafts((prev) => ({ ...prev, [parentQuestion.id]: '' }));
      setReplyImages((prev) => ({ ...prev, [parentQuestion.id]: '' }));
      setOpenReplyId(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'مقدرناش نبعت الرد دلوقتي.');
    } finally {
      setReplyBusyId(null);
    }
  };

  const handleToggleReaction = async (target: LittleQuestion, emoji: string) => {
    if (target.senderUid === profile.uid || reactingId === target.id) return;
    setReactingId(target.id);
    setOpenPickerId(null);
    setKeyboardInputHint('');
    setCustomEmojiInputs((prev) => ({ ...prev, [target.id]: '' }));
    try {
      await toggleGroupLittleQuestionReaction({
        campId: camp.id,
        questionId: target.id,
        uid: profile.uid,
        emoji,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'مقدرناش نحفظ التفاعل.');
    } finally {
      setReactingId(null);
    }
  };

  const handleOpenPhoneKeyboard = (targetId: string) => {
    setKeyboardInputHint('');
    setOpenPickerId(targetId);
    const input = keyboardInputRefs.current[targetId];
    if (input) {
      input.focus();
    } else {
      requestAnimationFrame(() => {
        keyboardInputRefs.current[targetId]?.focus();
      });
    }
  };

  const handleCustomEmojiChange = (
    target: LittleQuestion,
    rawValue: string,
    isComposing: boolean
  ) => {
    setCustomEmojiInputs((prev) => ({ ...prev, [target.id]: rawValue }));
    setKeyboardInputHint('');

    if (isComposing || !rawValue.trim()) return;

    const extracted = extractEmojiGrapheme(rawValue);
    if (extracted) {
      void handleToggleReaction(target, extracted);
    } else {
      setKeyboardInputHint('اختار / اختاري إيموجي من كيبورد الموبايل (مش كلام عادي).');
    }
  };

  const handleSubmitCustomEmoji = (e: React.FormEvent, target: LittleQuestion) => {
    e.preventDefault();
    const raw = customEmojiInputs[target.id] || '';
    const extracted = extractEmojiGrapheme(raw);
    if (!extracted) {
      setKeyboardInputHint('اختار / اختاري إيموجي من كيبورد الموبايل الأول.');
      keyboardInputRefs.current[target.id]?.focus();
      return;
    }
    void handleToggleReaction(target, extracted);
  };

  const renderReactionTray = (target: LittleQuestion, compact = false) => {
    if (openPickerId !== target.id) return null;
    const customVal = customEmojiInputs[target.id] || '';
    const { myReaction } = summarizeReactions(target, profile.uid);

    return (
      <div
        className={`w-full rounded-2xl bg-[#180725]/95 border border-fuchsia-300/35 shadow-xl space-y-2.5 backdrop-blur-md ${
          compact ? 'p-2.5' : 'p-3.5'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {QUESTION_REACTION_EMOJIS.map((emoji) => {
            const isSelected = myReaction === emoji;
            return (
              <button
                key={emoji}
                type="button"
                disabled={reactingId === target.id}
                onClick={() => handleToggleReaction(target, emoji)}
                aria-label={`تفاعل بـ ${emoji}`}
                className={`w-11 h-11 rounded-xl text-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer disabled:opacity-60 ${
                  isSelected
                    ? 'bg-pink-500/35 ring-2 ring-pink-300'
                    : 'bg-white/5 hover:bg-white/15'
                }`}
              >
                {emoji}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => handleOpenPhoneKeyboard(target.id)}
            className="inline-flex items-center gap-1.5 px-3.5 h-11 rounded-xl bg-pink-500/20 border border-pink-300/35 text-xs font-bold text-rose-100 hover:bg-pink-500/35 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Keyboard className="w-4 h-4" />
            <span>من الكيبورد +</span>
          </button>
        </div>

        <form
          onSubmit={(e) => handleSubmitCustomEmoji(e, target)}
          className="flex items-center gap-2 pt-2 border-t border-fuchsia-300/15"
        >
          <input
            ref={(el) => {
              keyboardInputRefs.current[target.id] = el;
            }}
            type="text"
            inputMode="text"
            enterKeyHint="done"
            autoComplete="off"
            dir="auto"
            maxLength={FIELD_LIMITS.REACTION_MAX}
            value={customVal}
            onChange={(e) => {
              const native = e.nativeEvent as InputEvent;
              handleCustomEmojiChange(target, e.target.value, Boolean(native?.isComposing));
            }}
            onCompositionEnd={(e) =>
              handleCustomEmojiChange(target, e.currentTarget.value, false)
            }
            placeholder="اختار أي إيموجي من كيبورد الموبايل..."
            aria-label="اختيار أي إيموجي من كيبورد الموبايل"
            className="flex-1 min-w-0 rounded-xl bg-[#100419]/90 border border-fuchsia-300/30 px-3 py-2 text-sm text-white placeholder:text-rose-200/45 focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          <button
            type="submit"
            disabled={reactingId === target.id}
            className="px-3.5 min-h-[40px] rounded-xl bg-gradient-to-r from-[#df1b85] to-[#f8c156] text-[#29081b] text-xs font-black hover:brightness-105 transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            تمام
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenPickerId(null);
              setKeyboardInputHint('');
            }}
            aria-label="اقفل لوحة الإيموجي"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-rose-200/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </form>

        {keyboardInputHint && (
          <p className="text-[11px] font-medium text-pink-300">{keyboardInputHint}</p>
        )}
      </div>
    );
  };

  return (
    <div className="lq-san-francisco relative text-rose-50 space-y-6">
      {/* Subtle Starry & Magenta Ambient Bokeh Atmosphere */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden -z-0">
        <div className="absolute -top-24 right-1/4 w-96 h-96 rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[28rem] h-96 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      {/* SECTION 1: Exact Reference Twilight Lakeside Sunset Hero Banner */}
      <section className="relative rounded-[24px] overflow-hidden border border-fuchsia-300/35 bg-gradient-to-l from-[#1c082c] via-[#260b34] to-[#170623] shadow-[0_20px_60px_rgba(0,0,0,0.65),0_0_30px_rgba(217,27,134,0.2)] min-h-[265px] sm:min-h-[300px] flex items-center">
        {/* Left & Center Twilight Lake + DUO CAMP Wooden Sign + Lantern + B & M Mugs */}
        <img
          src={heroLeftSceneImg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute left-0 inset-y-0 w-full lg:w-[63%] h-full object-cover object-left lq-mask-fade-r opacity-45 sm:opacity-65 lg:opacity-100"
        />

        {/* Mobile/Tablet Scrim for Guaranteed Contrast Over Artwork */}
        <div
          aria-hidden="true"
          className="lg:hidden absolute inset-0 bg-gradient-to-t from-[#160622]/95 via-[#1c082c]/75 to-[#160622]/70"
        />

        {/* Bottom-Right Golden Dust & Magenta Energy Swirl */}
        <img
          src={heroSwirlBrImg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute bottom-0 right-0 w-64 sm:w-80 lg:w-96 h-auto mix-blend-screen opacity-95"
        />

        {/* Right-Aligned RTL Interactive Copy */}
        <div className="relative z-10 w-full p-5 sm:p-7 lg:p-8 flex flex-col justify-between min-h-[265px] sm:min-h-[300px]">
          <div className="lg:max-w-[46%] lg:mr-0 space-y-2.5 text-right">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-rose-100/95">
              <span aria-hidden="true" className="text-base leading-none">💗</span>
              <span>حديقة الورود والطبيعة.. همسات لطيفة بين شباب وبنات «{camp.name}»</span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-black flex items-center gap-3 leading-tight">
              <GlowingGoldenHeartSvg className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
              <span className="bg-gradient-to-b from-[#fff3b0] via-[#fbbf24] to-[#d97706] bg-clip-text text-transparent drop-shadow-[0_3px_14px_rgba(245,158,11,0.45)]">
                سؤال صغنن
              </span>
              <span aria-hidden="true" className="text-2xl sm:text-3xl leading-none">🌹</span>
            </h1>

            <p className="text-xs sm:text-sm sm:leading-7 text-rose-50/90 max-w-md">
              ابعت سؤال الصغنون ي صغنون
            </p>
          </div>

          {/* Bottom-Left Questions & Replies Pill Counter */}
          <div className="mt-5 lg:mt-0 lg:absolute lg:bottom-4 lg:left-5 self-end lg:self-auto">
            <div className="inline-flex items-center gap-4 rounded-full bg-[#13051e]/92 border border-fuchsia-300/35 px-5 py-2 shadow-[0_8px_26px_rgba(0,0,0,0.65)] backdrop-blur-md text-xs sm:text-sm font-bold tabular-nums">
              <span className="flex items-center gap-1.5 text-rose-100">
                <span>الأسئلة:</span>
                <span className="text-[#f472b6] font-extrabold">{rootQuestions.length}</span>
              </span>
              <span aria-hidden="true" className="w-px h-4 bg-fuchsia-300/25" />
              <span className="flex items-center gap-1.5 text-rose-100">
                <span>الردود:</span>
                <span className="text-[#34d399] font-extrabold">{totalRepliesCount}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Two-Column Split + Center Hanging Golden Hearts Chain */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 items-stretch">
        <HangingGoldenHeartsDivider />

        {/* RIGHT COLUMN (lg:col-span-5 in RTL): Interactive Composer Card */}
        <form
          onSubmit={handleSendQuestion}
          className="lg:col-span-5 rounded-[24px] bg-gradient-to-b from-[#200a30]/95 via-[#170624]/95 to-[#12041c]/95 border border-fuchsia-300/30 p-5 sm:p-6 shadow-[0_18px_50px_rgba(0,0,0,0.6),0_0_24px_rgba(217,27,134,0.14)] backdrop-blur-xl flex flex-col justify-between gap-4"
        >
          <div className="space-y-4">
            {/* Composer Header with Crimson Rose */}
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl sm:text-[22px] font-black text-white flex items-center gap-2">
                <Sprout className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>ازرع / ازرعي سؤال صغنن</span>
              </h2>
              <img
                src={composerRoseImg}
                alt=""
                aria-hidden="true"
                className="w-12 h-12 sm:w-14 sm:h-14 object-contain mix-blend-lighten drop-shadow-[0_4px_12px_rgba(225,29,72,0.5)] shrink-0"
              />
            </div>

            {/* Question Textarea */}
            <div className="space-y-2">
              <label
                htmlFor="lq-composer-textarea"
                className="block text-xs font-bold text-rose-100/95"
              >
                كلام السؤال أو الرسالة (اختياري مع الصورة)
              </label>
              <textarea
                id="lq-composer-textarea"
                ref={composerTextareaRef}
                rows={4}
                maxLength={FIELD_LIMITS.MESSAGE_CONTENT_MAX}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="اكتب / اكتبي سؤالك الصغنن هنا.. فكرة في المذاكرة أو سؤال تشاركه مع زمايلك وسط الورود 🌹"
                className="w-full rounded-2xl bg-[#100419]/95 border border-fuchsia-300/25 px-4 py-3 text-sm text-rose-50 placeholder:text-rose-200/45 focus:outline-none focus:ring-2 focus:ring-pink-400/75 resize-none"
              />
            </div>

            {/* Photo Upload & URL Toggle Row */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-rose-100/95">
                  صورة السؤال (اختياري)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadQuestionPhoto}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={imageBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-full bg-[#0f2922]/90 border border-emerald-400/40 text-xs font-bold text-emerald-300 hover:bg-emerald-900/55 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{imageBusy ? 'بنجهّز الصورة...' : 'ارفع صورة'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImageLinkInput((prev) => !prev)}
                    title="حط رابط صورة"
                    aria-label="حط رابط صورة"
                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                      showImageLinkInput
                        ? 'bg-pink-500/30 border-pink-300 text-white'
                        : 'bg-[#1b0a29]/90 border-fuchsia-300/30 text-rose-200 hover:border-pink-300/60'
                    }`}
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showImageLinkInput && (
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    value={imageLinkDraft}
                    onChange={(e) => setImageLinkDraft(e.target.value)}
                    placeholder="https://example.com/question.jpg"
                    className="flex-1 min-w-0 rounded-xl bg-[#100419]/95 border border-fuchsia-300/25 px-3 py-2 text-xs text-white placeholder:text-rose-200/45 focus:outline-none focus:ring-2 focus:ring-pink-400/75"
                  />
                  <button
                    type="button"
                    onClick={handleApplyImageLink}
                    className="px-3.5 min-h-[38px] rounded-xl bg-pink-500 text-white text-xs font-bold hover:bg-pink-600 transition-colors cursor-pointer shrink-0"
                  >
                    حطها
                  </button>
                </div>
              )}

              {imageUrl && (
                <div className="relative rounded-2xl overflow-hidden border border-fuchsia-300/35 bg-[#100419]">
                  <img
                    src={imageUrl}
                    alt="معاينة صورة السؤال"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-52 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    aria-label="شيل صورة السؤال"
                    className="absolute top-2 left-2 p-2 rounded-xl bg-slate-950/80 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-xl bg-rose-500/20 border border-rose-400/45 px-3.5 py-2.5 text-xs text-rose-100">
                {error}
              </div>
            )}
          </div>

          {/* Primary Magenta-to-Gold Submit Button */}
          <button
            type="submit"
            disabled={busy || imageBusy}
            className="w-full min-h-[48px] py-3 px-5 rounded-full font-display font-black text-sm sm:text-base text-[#29081b] bg-gradient-to-l from-[#f8c156] via-[#ef5b7a] to-[#df1b85] hover:brightness-105 active:scale-[0.99] transition-all shadow-[0_10px_28px_rgba(223,27,133,0.42),0_0_18px_rgba(248,193,86,0.28)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Send className="w-4 h-4 text-[#29081b]" />
            <span>{busy ? 'بنبعت السؤال...' : 'ابعت / ابعتي السؤال الصغنن 🌹'}</span>
          </button>
        </form>

        {/* LEFT COLUMN (lg:col-span-7 in RTL): Empty Showcase Card OR Real Questions Feed */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {rootQuestions.length === 0 ? (
            <div className="relative flex-1 rounded-[24px] overflow-hidden bg-gradient-to-br from-[#230b35]/95 via-[#2a0c38]/92 to-[#170623]/95 border border-fuchsia-300/35 shadow-[0_18px_50px_rgba(0,0,0,0.6),0_0_28px_rgba(232,60,164,0.14)] min-h-[340px] sm:min-h-[385px] flex items-center">
              {/* Top-Left Glowing Golden Heart with Sparkle Rays */}
              <img
                src={heartGlowImg}
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute top-0 left-0 w-24 sm:w-32 h-auto mix-blend-screen opacity-95"
              />

              {/* Bottom-Left Wax-Sealed Envelope & Roses */}
              <img
                src={envelopeRosesImg}
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none absolute bottom-0 left-0 w-40 sm:w-52 md:w-60 h-auto lq-mask-vignette-bl opacity-90 sm:opacity-95"
              />

              {/* Right-Side Lush Red Rose Bouquet with Purple Satin Ribbon */}
              <img
                src={bouquetImg}
                alt=""
                aria-hidden="true"
                className="pointer-events-none select-none hidden sm:block absolute bottom-0 right-0 h-[92%] w-auto max-w-[36%] object-contain object-bottom lq-mask-fade-l"
              />

              {/* Interactive Empty State Copy & Gold Share CTA */}
              <div className="relative z-10 w-full p-6 pb-28 sm:pb-8 sm:pr-[34%] sm:pl-8 flex flex-col items-center sm:items-start text-center sm:text-right space-y-3.5">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0e261d]/92 border border-emerald-400/40 px-4 py-1 text-xs font-bold text-emerald-300 shadow-sm">
                  <Sprout className="w-3.5 h-3.5 shrink-0" />
                  <span>بستان المعسكر الهادي جاهز دلوقتي</span>
                </div>

                <h3 className="font-display font-black text-xl sm:text-2xl text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                  لسه أول وردة سؤال مفتحتش 🌸
                </h3>

                <p className="text-xs sm:text-sm text-rose-100/90 leading-relaxed max-w-sm">
                  ابعت / ابعتي أول سؤال بصورته أو بكلام حلو علشان يزهّر هنا، ويقدر كل الشباب والبنات في المعسكر يردوا عليه بالحل أو يسيبوا تفاعل لطيف.
                </p>

                <button
                  type="button"
                  onClick={handleFocusComposer}
                  className="inline-flex items-center gap-2 px-7 py-2.5 rounded-full bg-gradient-to-r from-[#5a3b0c] via-[#a3751f] to-[#5a3b0c] border border-amber-300/75 text-amber-100 font-display font-bold text-sm shadow-[0_0_24px_rgba(251,191,36,0.42)] hover:brightness-115 active:scale-95 transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4 text-amber-200" />
                  <span>شارك / شاركي دلوقتي</span>
                </button>
              </div>
            </div>
          ) : (
            rootQuestions.map((q) => {
              const cfg =
                CRYSTAL_QUESTION_STYLES[q.crystalStyle] || CRYSTAL_QUESTION_STYLES.rose_quartz;
              const isMine = q.senderUid === profile.uid;
              const isCreator = camp.createdByUid === profile.uid;
              const qReplies = repliesByParent.get(q.id) || [];
              const deletableReplyIds = isCreator
                ? qReplies.map((r) => r.id)
                : qReplies.filter((r) => r.senderUid === profile.uid).map((r) => r.id);
              const isReplyOpen = openReplyId === q.id;
              const replyImgDraft = replyImages[q.id] || '';
              const { myReaction: qMyReaction, entries: qReactionEntries } = summarizeReactions(
                q,
                profile.uid
              );

              return (
                <article
                  key={q.id}
                  className="relative rounded-[24px] bg-gradient-to-br from-[#230b35]/95 via-[#1b0829]/95 to-[#14051f]/95 border border-fuchsia-300/30 shadow-[0_16px_42px_rgba(0,0,0,0.55),0_0_20px_rgba(217,27,134,0.12)] p-5 sm:p-6 overflow-hidden transition-transform hover:-translate-y-0.5"
                >
                  {/* Decorative Rose Accent */}
                  <img
                    src={composerRoseImg}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none select-none absolute top-3 left-3 w-10 h-10 object-contain mix-blend-lighten opacity-60"
                  />

                  {/* Card Header */}
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarImage
                        src={q.senderAvatar}
                        name={q.senderName}
                        sizeClass="w-11 h-11"
                        ringClass="ring-2 ring-pink-400/60"
                      />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-base text-white truncate">
                          {q.senderName}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap text-xs text-rose-200/75 mt-0.5">
                          <span className="font-semibold text-amber-300">
                            {cfg.emoji} {cfg.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelativeArabicTime(q.createdAt?.toMillis?.())}</span>
                        </div>
                      </div>
                    </div>

                    {(isMine || isCreator) && (
                      <button
                        type="button"
                        onClick={() => deleteGroupLittleQuestion(camp.id, q.id, deletableReplyIds)}
                        title="امسح السؤال"
                        aria-label="امسح السؤال"
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-rose-200/65 hover:text-rose-300 hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Question Body: Text & Photo */}
                  <div className="relative z-10 mt-4 space-y-3">
                    {q.content && (
                      <p className="text-sm sm:text-base text-rose-50/95 leading-relaxed whitespace-pre-wrap">
                        {q.content}
                      </p>
                    )}

                    {q.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(q.imageUrl)}
                        className="relative block w-full rounded-2xl overflow-hidden border border-fuchsia-300/30 bg-[#100419] group cursor-zoom-in"
                      >
                        <img
                          src={q.imageUrl}
                          alt={`صورة سؤال من ${q.senderName}`}
                          referrerPolicy="no-referrer"
                          className="w-full max-h-80 object-contain mx-auto"
                        />
                        <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-950/80 text-[11px] font-bold text-white backdrop-blur-sm">
                          <ZoomIn className="w-3.5 h-3.5" />
                          <span>كبّر الصورة</span>
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Action Bar: Emoji Reactions + Reply Trigger */}
                  <div className="relative z-10 mt-4 pt-3.5 border-t border-fuchsia-300/15 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isMine ? (
                          <>
                            {qReactionEntries.map((item) => (
                              <button
                                key={item.emoji}
                                type="button"
                                disabled={reactingId === q.id}
                                onClick={() => handleToggleReaction(q, item.emoji)}
                                title={item.mine ? 'دوس علشان تشيل تفاعلك' : 'دوس علشان تتفاعل بنفس الإيموجي'}
                                className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border text-sm font-bold text-white hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-60 ${
                                  item.mine
                                    ? 'bg-pink-500/30 border-pink-300 ring-1 ring-pink-300/60'
                                    : 'bg-white/10 border-pink-300/45'
                                }`}
                              >
                                <span className="text-lg leading-none">{item.emoji}</span>
                                <span className="text-xs text-pink-200 font-mono-num tabular-nums">
                                  {item.count}
                                </span>
                              </button>
                            ))}

                            <button
                              type="button"
                              onClick={() => {
                                setKeyboardInputHint('');
                                setOpenPickerId((prev) => (prev === q.id ? null : q.id));
                              }}
                              aria-expanded={openPickerId === q.id}
                              className={`inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-xl text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                                openPickerId === q.id
                                  ? 'bg-pink-600 text-white border-pink-400 shadow-sm'
                                  : 'bg-white/10 text-rose-100 border-fuchsia-300/30 hover:border-pink-300'
                              }`}
                            >
                              <SmilePlus className="w-4 h-4" />
                              <span>{qMyReaction ? 'غيّر الإيموجي' : 'تفاعل بإيموجي'}</span>
                            </button>
                          </>
                        ) : qReactionEntries.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {qReactionEntries.map((item) => (
                              <div
                                key={item.emoji}
                                className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl bg-white/10 border border-pink-300/35 text-xs font-semibold text-rose-100"
                              >
                                <span className="text-lg leading-none">{item.emoji}</span>
                                <span className="font-mono-num tabular-nums text-pink-200">
                                  {item.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-rose-200/70">
                            مستنيين رد أو لمسة لطيفة من {partnerName} 🌸
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setReplyError('');
                          setOpenReplyId((prev) => {
                            const next = prev === q.id ? null : q.id;
                            if (next) {
                              requestAnimationFrame(() => {
                                replyTextareaRefs.current[q.id]?.focus();
                              });
                            }
                            return next;
                          });
                        }}
                        aria-expanded={isReplyOpen}
                        className={`inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isReplyOpen
                            ? 'bg-gradient-to-r from-[#df1b85] to-[#f8c156] text-[#29081b] border-amber-200/70 shadow-sm'
                            : 'bg-[#0f2922]/90 text-emerald-300 border-emerald-400/35 hover:border-emerald-300'
                        }`}
                      >
                        <Reply className="w-4 h-4" />
                        <span>
                          {qReplies.length > 0 ? `الردود (${qReplies.length})` : 'رد على السؤال'}
                        </span>
                      </button>
                    </div>

                    {!isMine && renderReactionTray(q)}
                  </div>

                  {/* Nested Floral Replies Thread */}
                  {(qReplies.length > 0 || isReplyOpen) && (
                    <div className="relative z-10 mt-4 pt-4 border-t border-fuchsia-300/15 space-y-3">
                      {qReplies.map((reply) => {
                        const isMyReply = reply.senderUid === profile.uid;
                        const { myReaction: replyMyReaction, entries: replyReactionEntries } =
                          summarizeReactions(reply, profile.uid);
                        return (
                          <div
                            key={reply.id}
                            className="rounded-2xl bg-[#140620]/90 border border-fuchsia-300/20 px-4 py-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <AvatarImage
                                  src={reply.senderAvatar}
                                  name={reply.senderName}
                                  sizeClass="w-8 h-8"
                                />
                                <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-display font-bold text-xs sm:text-sm text-white">
                                    {reply.senderName}
                                  </span>
                                  <span aria-hidden="true" className="text-rose-200/40">·</span>
                                  <span className="text-[11px] text-rose-200/65">
                                    {formatRelativeArabicTime(reply.createdAt?.toMillis?.())}
                                  </span>
                                </div>
                              </div>

                              {(isMyReply || isCreator) && (
                                <button
                                  type="button"
                                  onClick={() => deleteGroupLittleQuestion(camp.id, reply.id)}
                                  title="امسح الرد"
                                  aria-label="امسح الرد"
                                  className="p-2 rounded-lg text-rose-200/60 hover:text-rose-300 hover:bg-white/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {reply.content && (
                              <p className="text-xs sm:text-sm text-rose-50/90 leading-relaxed whitespace-pre-wrap">
                                {reply.content}
                              </p>
                            )}

                            {reply.imageUrl && (
                              <button
                                type="button"
                                onClick={() => setLightboxUrl(reply.imageUrl)}
                                className="block w-full rounded-xl overflow-hidden border border-fuchsia-300/25 bg-[#100419] cursor-zoom-in"
                              >
                                <img
                                  src={reply.imageUrl}
                                  alt={`صورة رد من ${reply.senderName}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full max-h-60 object-contain mx-auto"
                                />
                              </button>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {!isMyReply ? (
                                <>
                                  {replyReactionEntries.map((item) => (
                                    <button
                                      key={item.emoji}
                                      type="button"
                                      disabled={reactingId === reply.id}
                                      onClick={() => handleToggleReaction(reply, item.emoji)}
                                      className={`inline-flex items-center gap-1 px-2.5 min-h-[36px] rounded-lg border text-xs font-bold text-white hover:scale-105 transition-transform cursor-pointer disabled:opacity-60 ${
                                        item.mine
                                          ? 'bg-pink-500/30 border-pink-300'
                                          : 'bg-white/10 border-pink-300/40'
                                      }`}
                                    >
                                      <span className="text-sm leading-none">{item.emoji}</span>
                                      <span className="text-[11px] text-pink-200 font-mono-num tabular-nums">
                                        {item.count}
                                      </span>
                                    </button>
                                  ))}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setKeyboardInputHint('');
                                      setOpenPickerId((prev) =>
                                        prev === reply.id ? null : reply.id
                                      );
                                    }}
                                    aria-expanded={openPickerId === reply.id}
                                    className={`inline-flex items-center gap-1 px-3 min-h-[36px] rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                                      openPickerId === reply.id
                                        ? 'bg-pink-600 text-white border-pink-400'
                                        : 'bg-white/10 text-rose-100 border-fuchsia-300/25 hover:border-pink-300'
                                    }`}
                                  >
                                    <SmilePlus className="w-3.5 h-3.5" />
                                    <span>{replyMyReaction ? 'غيّر' : 'تفاعل بإيموجي'}</span>
                                  </button>

                                  {renderReactionTray(reply, true)}
                                </>
                              ) : (
                                replyReactionEntries.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {replyReactionEntries.map((item) => (
                                      <div
                                        key={item.emoji}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 border border-pink-300/30 text-[11px] font-semibold text-rose-100"
                                      >
                                        <span className="text-sm leading-none">{item.emoji}</span>
                                        <span className="font-mono-num tabular-nums text-pink-200">
                                          {item.count}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Inline Reply Composer */}
                      {isReplyOpen && (
                        <form
                          onSubmit={(e) => handleSendReply(e, q)}
                          className="rounded-2xl bg-[#140620]/95 border border-fuchsia-300/30 p-3.5 space-y-2.5"
                        >
                          <textarea
                            ref={(el) => {
                              replyTextareaRefs.current[q.id] = el;
                            }}
                            rows={2}
                            maxLength={FIELD_LIMITS.MESSAGE_CONTENT_MAX}
                            value={replyDrafts[q.id] || ''}
                            onChange={(e) => {
                              setReplyError('');
                              setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }));
                            }}
                            placeholder={`اكتب / اكتبي ردك الدافي على ${q.senderName}... أو حط صورة للحل 🌸`}
                            aria-label={`رد على سؤال ${q.senderName}`}
                            className="w-full rounded-xl bg-white/5 border border-fuchsia-300/25 px-3 py-2 text-xs sm:text-sm text-white placeholder:text-rose-200/50 focus:outline-none focus:ring-2 focus:ring-pink-400"
                          />

                          {replyImgDraft && (
                            <div className="relative rounded-xl overflow-hidden border border-fuchsia-300/35 bg-[#100419]">
                              <img
                                src={replyImgDraft}
                                alt="معاينة صورة الرد"
                                referrerPolicy="no-referrer"
                                className="w-full max-h-40 object-contain"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setReplyImages((prev) => ({ ...prev, [q.id]: '' }))
                                }
                                aria-label="شيل صورة الرد"
                                className="absolute top-1.5 left-1.5 p-1.5 rounded-lg bg-slate-950/80 text-white hover:bg-rose-600 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {replyError && (
                            <p className="text-[11px] font-medium text-pink-300">{replyError}</p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <input
                                ref={(el) => {
                                  replyFileInputRefs.current[q.id] = el;
                                }}
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleUploadReplyPhoto(e, q.id)}
                                className="hidden"
                              />
                              <button
                                type="button"
                                disabled={replyImageBusyId === q.id}
                                onClick={() => replyFileInputRefs.current[q.id]?.click()}
                                className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[#0f2922]/90 border border-emerald-400/35 text-xs font-bold text-emerald-300 hover:bg-emerald-900/55 transition-colors cursor-pointer disabled:opacity-60"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>
                                  {replyImageBusyId === q.id ? 'بنجهّز الصورة...' : 'حط صورة في الرد'}
                                </span>
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenReplyId(null);
                                  setReplyError('');
                                }}
                                className="px-3 min-h-[38px] rounded-xl text-xs font-semibold text-rose-200/80 hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                إلغاء
                              </button>
                              <button
                                type="submit"
                                disabled={replyBusyId === q.id || replyImageBusyId === q.id}
                                className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-xl text-xs font-black text-[#29081b] bg-gradient-to-l from-[#f8c156] via-[#ef5b7a] to-[#df1b85] hover:brightness-105 transition-all cursor-pointer disabled:opacity-60"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>{replyBusyId === q.id ? 'بنبعت الرد...' : 'ابعت الرد'}</span>
                              </button>
                            </div>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* SECTION 3: Exact Reference Panoramic Bottom Footer (Twin Cats, Glowing Lanterns & Golden Ornament Banner) */}
      <footer className="relative z-10 rounded-[22px] overflow-hidden border border-fuchsia-300/25 bg-gradient-to-r from-[#170622] via-[#210930] to-[#170622] shadow-[0_14px_40px_rgba(0,0,0,0.65)] min-h-[86px] sm:min-h-[104px] flex items-center justify-center px-3 py-3">
        {/* Left Twin Silhouetted Cats + Glowing Lantern + Magenta Flowers */}
        <img
          src={footerCatsLeftImg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute left-0 inset-y-0 h-full w-auto max-w-[44%] sm:max-w-[38%] object-cover object-left lq-mask-fade-r opacity-45 sm:opacity-85 lg:opacity-95"
        />

        {/* Right Glowing Lantern + Magenta Flowers */}
        <img
          src={footerRightLanternImg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute right-0 inset-y-0 h-full w-auto max-w-[30%] sm:max-w-[22%] object-cover object-right lq-mask-fade-l opacity-45 sm:opacity-85 lg:opacity-95"
        />

        {/* Center Golden Ornamental Motto Frame */}
        <div className="relative z-10 inline-flex items-center gap-2 sm:gap-3 rounded-full border border-amber-300/45 bg-[#160622]/85 backdrop-blur-sm px-4 sm:px-8 py-2 shadow-[0_0_24px_rgba(251,191,36,0.18)]">
          <GoldenFlourishSvg />
          <GlowingGoldenHeartSvg className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.85)]" />
          <span className="font-display font-bold text-xs sm:text-base bg-gradient-to-b from-[#fef08a] via-[#fbbf24] to-[#d97706] bg-clip-text text-transparent whitespace-nowrap">
            سوا .. بنصنع أحلى لحظات المعسكر
          </span>
          <GoldenFlourishSvg flip />
        </div>
      </footer>

      {/* Full-Screen Photo Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-[#12051c]/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-3xl w-full rounded-3xl overflow-hidden border border-fuchsia-300/40 bg-[#1e092e] shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="اقفل الصورة"
              className="absolute top-4 left-4 z-10 p-2.5 rounded-xl bg-slate-950/80 text-white hover:bg-rose-600 border border-white/20 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxUrl}
              alt="صورة السؤال بالحجم الكامل"
              referrerPolicy="no-referrer"
              className="w-full max-h-[82vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
