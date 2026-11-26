import { Timestamp } from 'firebase/firestore';

export type StudyTrackKey = 'literary' | 'science_bio' | 'science_math';

export type SubjectKey =
  | 'arabic'
  | 'english'
  | 'biology'
  | 'chemistry'
  | 'physics'
  | 'math'
  | 'history'
  | 'geography'
  | 'statistics'
  | 'geology';
export type StudySubjectKey = SubjectKey | 'general';

export type TaskTypeKey =
  | 'watch_lecture'
  | 'study_lecture'
  | 'solve_homework'
  | 'solve_questions'
  | 'revision'
  | 'comprehensive_exam'
  | 'custom';

export type MessageTypeKey = 'normal' | 'advice' | 'dua' | 'quote' | 'love' | 'custom';

export type NotificationTypeKey =
  | 'lecture_done'
  | 'task_completed'
  | 'new_message'
  | 'new_question'
  | 'new_surprise'
  | 'new_day'
  | 'camp_ending';

export type CrystalQuestionStyle =
  | 'toty_sapphire'
  | 'rose_quartz'
  | 'starlight_gold'
  | 'aurora_amethyst';

export type ActiveTab = 'group_camps';

export interface UserProfile {
  uid: string;
  displayName: string;
  avatarUrl: string;
  campId: string;
  email?: string;
  phone?: string;
  groupCampId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InviteCodeDoc {
  code: string;
  campId: string;
  ownerUid: string;
  campName: string;
  isFull: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Camp {
  id: string;
  name: string;
  inviteCode: string;
  ownerUid: string;
  member1Uid: string;
  member1Name: string;
  member1Avatar: string;
  member1LastActivity: string;
  member1LastActiveAt: Timestamp;
  member1StudyMinutes: number;
  member2Uid: string;
  member2Name: string;
  member2Avatar: string;
  member2LastActivity: string;
  member2LastActiveAt: Timestamp;
  member2StudyMinutes: number;
  memberCount: 1 | 2;
  startDate: string;
  heroImageUrl?: string;
  status: 'waiting' | 'active' | 'completed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CampTask {
  id: string;
  campId: string;
  day: number;
  subject: SubjectKey;
  taskType: TaskTypeKey;
  customTypeLabel: string;
  title: string;
  notes: string;
  bgImageUrl?: string;
  createdBy: string;
  member1Done: boolean;
  member1DoneAtMs: number;
  member2Done: boolean;
  member2DoneAtMs: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CampMessage {
  id: string;
  campId: string;
  senderUid: string;
  senderName: string;
  senderAvatar: string;
  type: MessageTypeKey;
  customLabel: string;
  content: string;
  isBanner: boolean;
  parentMessageId?: string;
  partnerReaction?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface StudySession {
  id: string;
  campId: string;
  userUid: string;
  subject: StudySubjectKey;
  durationMinutes: number;
  day: number;
  createdAt: Timestamp;
}

export interface CampNotification {
  id: string;
  campId: string;
  actorUid: string;
  targetUid: string;
  type: NotificationTypeKey;
  title: string;
  body: string;
  readBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LittleQuestion {
  id: string;
  campId: string;
  senderUid: string;
  senderName: string;
  senderAvatar: string;
  crystalStyle: CrystalQuestionStyle;
  content: string;
  imageUrl: string;
  parentQuestionId?: string;
  partnerReaction?: string;
  reactions?: Record<string, string>;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type SurpriseKind =
  | 'rose'
  | 'heart'
  | 'star'
  | 'congrats'
  | 'medal'
  | 'surprise_note';

export interface FcmTokenDoc {
  id: string;
  uid: string;
  campId: string;
  token: string;
  platform: 'web';
  deviceLabel: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUsedAt: Timestamp;
}

export interface NotificationPreferences {
  uid: string;
  enabled: boolean;
  lecture_done: boolean;
  task_completed: boolean;
  new_message: boolean;
  new_question: boolean;
  new_surprise: boolean;
  new_day: boolean;
  camp_ending: boolean;
  updatedAt?: Timestamp;
}

export type AnalyticsConsentStatus = 'granted' | 'denied' | 'unset';

// ============================================================
// Group Camps & Competitive Exams Types (up to 50 students)
// ============================================================

export type GroupCampStatus = 'open' | 'closed';

export interface GroupCamp {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string;
  coverStoragePath: string;
  maxMembers: number; // 1..50
  memberCount: number; // 0..maxMembers
  inviteCode: string;
  status: GroupCampStatus;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupInviteCodeDoc {
  code: string;
  campId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupCampMember {
  uid: string;
  campId: string;
  displayName: string;
  avatarUrl: string;
  totalScore: number;
  examsTakenCount: number;
  totalCorrectAnswers: number;
  totalQuestionsAnswered: number;
  completionPercent: number;
  lastExamScore: number;
  joinedAt: Timestamp;
  updatedAt: Timestamp;
}

export type GroupQuestionType = 'mcq' | 'image_mcq' | 'true_false' | 'scientific_mcq';

export interface GroupExamQuestion {
  id: string;
  examId: string;
  campId: string;
  order: number;
  type: GroupQuestionType;
  promptText: string;
  imageUrl: string;
  imageStoragePath: string;
  options: string[];
  correctOptionIndex: number;
  score: number;
  explanation: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type GroupExamPublishStatus = 'draft' | 'published';
export type GroupExamTimeStatus = 'upcoming' | 'available' | 'ended';

export interface GroupExam {
  id: string;
  campId: string;
  title: string;
  subject: string;
  unit: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  totalScore: number;
  questionsCount: number;
  startsAtMs: number;
  endsAtMs: number;
  maxAttempts: number;
  resultsReleaseAtMs: number;
  allowReviewAfterSubmit: boolean;
  status: GroupExamPublishStatus;
  attemptsStartedCount: number;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type GroupAttemptStatus = 'in_progress' | 'submitted' | 'timed_out';

export interface GroupExamAttempt {
  id: string; // deterministic `${uid}_${attemptNumber}`
  campId: string;
  examId: string;
  uid: string;
  studentName: string;
  studentAvatar: string;
  attemptNumber: number;
  status: GroupAttemptStatus;
  answers: Record<string, number>;
  startedAt: Timestamp;
  startedAtMs: number;
  deadlineAtMs: number;
  submittedAt?: Timestamp;
  submittedAtMs: number;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  graded: boolean;
  adminApproved: boolean;
  updatedAt: Timestamp;
}

export interface StudentExamHistoryEntry {
  id: string;
  uid: string;
  campId: string;
  campName: string;
  examId: string;
  examTitle: string;
  subject: string;
  attemptNumber: number;
  status: GroupAttemptStatus;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  resultsReleaseAtMs: number;
  submittedAtMs: number;
  createdAt: Timestamp;
}

export interface LeaderboardEntry {
  rank: number;
  member: GroupCampMember;
  scoreDiffFromPrev: number;
  isChampion: boolean;
}

export type BroadcastTargetRoute =
  | 'home'
  | 'azkar'
  | 'exams'
  | 'leaderboard'
  | 'little_question'
  | 'settings'
  | 'notification_view';

export interface PushSubscriptionDoc {
  id: string;
  uid: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: 'android' | 'ios' | 'desktop' | 'web';
  installMode: 'pwa' | 'browser';
  deviceLabel: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastUsedAt?: Timestamp;
}

export interface AdminBroadcastNotification {
  id: string;
  createdByUid: string;
  title: string;
  body: string;
  imageUrl: string;
  targetRoute: BroadcastTargetRoute;
  recipientCount: number;
  targetedDevicesCount: number;
  acceptedCount: number;
  failedCount: number;
  staleRemovedCount: number;
  openedCount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BroadcastDeliveryReceipt {
  id: string;
  notificationId: string;
  uid: string;
  subscriptionId: string;
  status: 'delivered' | 'opened';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface IslamicTreasureDoc {
  id: string;
  questionLead: string;
  factLine1: string;
  factLine2: string;
  evidenceText: string;
  evidenceRef: string;
  closingNote: string;
  isActive: boolean;
  createdByUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ActiveIslamicTreasureDoc {
  id: 'activeIslamicTreasure';
  treasureId: string;
  questionLead: string;
  factLine1: string;
  factLine2: string;
  evidenceText: string;
  evidenceRef: string;
  closingNote: string;
  updatedByUid: string;
  updatedAt?: Timestamp;
}
