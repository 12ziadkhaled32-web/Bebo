export type SocialPlatformId =
  | 'facebook'
  | 'whatsapp'
  | 'instagram'
  | 'sarhne'
  | 'batch_group'
  | 'batch_group_2';

export interface SocialLinkItem {
  id: SocialPlatformId;
  name: string;
  /**
   * عدّل الرابط أدناه لوضع رابط حسابك أو صفحتك الحقيقية على كل منصة.
   * Edit the URL below to point to your real social account or page.
   */
  url: string;
  brandColor: string;
  badgeClass: string;
  hoverRingClass: string;
}

/**
 * ملف إعدادات روابط التواصل الاجتماعي الموحّد للصفحة الرئيسية.
 * يمكنك تعديل أي رابط هنا بسهولة دون الحاجة لتعديل أي مكوّن تصميم.
 */
export const SOCIAL_MEDIA_LINKS: SocialLinkItem[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    url: 'https://www.facebook.com/bassem.beboj',
    brandColor: '#1877F2',
    badgeClass: 'bg-[#1877F2] text-white shadow-[0_6px_16px_-4px_rgba(24,119,242,0.55)]',
    hoverRingClass: 'hover:border-[#1877F2]/50 hover:bg-[#1877F2]/10 dark:hover:bg-[#1877F2]/20',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://wa.me/201274011475',
    brandColor: '#25D366',
    badgeClass: 'bg-[#25D366] text-white shadow-[0_6px_16px_-4px_rgba(37,211,102,0.55)]',
    hoverRingClass: 'hover:border-[#25D366]/50 hover:bg-[#25D366]/10 dark:hover:bg-[#25D366]/20',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com/bassem_beboj?lqvp=M296cmp6NDVjMnlp',
    brandColor: '#E4405F',
    badgeClass:
      'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white shadow-[0_6px_16px_-4px_rgba(221,42,123,0.55)]',
    hoverRingClass: 'hover:border-pink-400/60 hover:bg-pink-500/10 dark:hover:bg-pink-500/20',
  },
  {
    id: 'sarhne',
    name: 'صارحني',
    url: 'https://twet.link/bassem42',
    brandColor: '#10B981',
    badgeClass:
      'bg-gradient-to-tr from-[#0EA5A4] via-[#10B981] to-[#34D399] text-white shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)]',
    hoverRingClass: 'hover:border-emerald-400/60 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20',
  },
  {
    id: 'batch_group',
    name: 'جروب الدفعة',
    url: 'https://chat.whatsapp.com/GMW2IMy9FCB7xitbp9eca4?s=cl&p=a&iam=2',
    brandColor: '#8B5CF6',
    badgeClass:
      'bg-gradient-to-tr from-[#7C3AED] via-[#A855F7] to-[#EC4899] text-white shadow-[0_6px_16px_-4px_rgba(139,92,246,0.55)]',
    hoverRingClass: 'hover:border-violet-400/60 hover:bg-violet-500/10 dark:hover:bg-violet-500/20',
  },
  {
    id: 'batch_group_2',
    name: 'جروب الدفعة 2',
    url: 'https://chat.whatsapp.com/G6myy2zAdCLIjnDXeExkpP?s=cl&p=a&iam=2',
    brandColor: '#06B6D4',
    badgeClass:
      'bg-gradient-to-tr from-[#0EA5E9] via-[#06B6D4] to-[#10B981] text-white shadow-[0_6px_16px_-4px_rgba(6,182,212,0.55)]',
    hoverRingClass: 'hover:border-cyan-400/60 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/20',
  },
];
