import { SUBJECT_ORDER, TASK_TYPE_CONFIG } from '../constants/campConfig';
import { Camp, CampTask, StudySession, SubjectKey } from '../types/camp';

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CampTimeInfo {
  currentDay: number;
  elapsedDays: number;
  daysLeft: number;
  hoursLeft: number;
  minutesLeft: number;
  secondsLeft: number;
  totalRemainingMs: number;
  isEnded: boolean;
  isEndingSoon: boolean;
}

export function getCampTimeInfo(startDateStr: string, nowMs: number = Date.now()): CampTimeInfo {
  const parts = startDateStr.split('-').map((n) => parseInt(n, 10));
  const start =
    parts.length === 3 && !parts.some(Number.isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0)
      : new Date();

  const startMs = start.getTime();
  const campDurationMs = 20 * 24 * 60 * 60 * 1000;
  const endMs = startMs + campDurationMs;
  const diffFromStartMs = nowMs - startMs;

  const rawDay = Math.floor(diffFromStartMs / (24 * 60 * 60 * 1000)) + 1;
  const currentDay = Math.min(20, Math.max(1, rawDay));
  const elapsedDays = Math.min(20, Math.max(0, rawDay));

  const totalRemainingMs = Math.max(0, endMs - nowMs);
  const isEnded = nowMs >= endMs;
  const daysLeft = Math.floor(totalRemainingMs / (24 * 60 * 60 * 1000));
  const hoursLeft = Math.floor((totalRemainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutesLeft = Math.floor((totalRemainingMs % (60 * 60 * 1000)) / (60 * 1000));
  const secondsLeft = Math.floor((totalRemainingMs % (60 * 1000)) / 1000);
  const isEndingSoon = !isEnded && daysLeft <= 3;

  return {
    currentDay,
    elapsedDays,
    daysLeft,
    hoursLeft,
    minutesLeft,
    secondsLeft,
    totalRemainingMs,
    isEnded,
    isEndingSoon,
  };
}

export interface MemberStats {
  uid: string;
  name: string;
  avatar: string;
  completedTasks: number;
  completedLectures: number;
  completionRate: number;
  activeDaysCount: number;
  streak: number;
  studyMinutes: number;
}

export interface DayStat {
  day: number;
  totalTasks: number;
  member1Done: number;
  member2Done: number;
  bothDone: number;
}

export interface SubjectStat {
  subject: SubjectKey;
  total: number;
  bothDone: number;
  member1Done: number;
  member2Done: number;
  percent: number;
}

export interface CampAnalytics {
  totalTasks: number;
  bothDoneCount: number;
  oneDoneCount: number;
  notStartedCount: number;
  remainingTasksCount: number;
  totalLectures: number;
  finishedLecturesBoth: number;
  overallCompletionPercent: number;
  campSuccessRate: number;
  member1: MemberStats;
  member2: MemberStats | null;
  dailyStats: DayStat[];
  subjectStats: SubjectStat[];
}

function computeStreak(activeDaysSet: Set<number>, currentDay: number): number {
  if (activeDaysSet.size === 0) return 0;
  let streak = 0;
  // Count consecutive active days ending at currentDay or currentDay-1
  let cursor = activeDaysSet.has(currentDay) ? currentDay : currentDay - 1;
  while (cursor >= 1 && activeDaysSet.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

export function computeCampAnalytics(
  camp: Camp,
  tasks: CampTask[],
  sessions: StudySession[],
  currentDay: number
): CampAnalytics {
  const totalTasks = tasks.length;
  let bothDoneCount = 0;
  let oneDoneCount = 0;
  let notStartedCount = 0;
  let totalLectures = 0;
  let finishedLecturesBoth = 0;

  let m1Done = 0;
  let m1Lectures = 0;
  let m2Done = 0;
  let m2Lectures = 0;

  const m1ActiveDays = new Set<number>();
  const m2ActiveDays = new Set<number>();

  const dayMap = new Map<number, DayStat>();
  for (let d = 1; d <= 20; d++) {
    dayMap.set(d, { day: d, totalTasks: 0, member1Done: 0, member2Done: 0, bothDone: 0 });
  }

  const subjectMap: Record<SubjectKey, SubjectStat> = {
    arabic: { subject: 'arabic', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    english: { subject: 'english', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    biology: { subject: 'biology', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    chemistry: { subject: 'chemistry', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    physics: { subject: 'physics', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    math: { subject: 'math', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    history: { subject: 'history', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    geography: { subject: 'geography', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    statistics: { subject: 'statistics', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
    geology: { subject: 'geology', total: 0, bothDone: 0, member1Done: 0, member2Done: 0, percent: 0 },
  };

  for (const task of tasks) {
    const isLecture = TASK_TYPE_CONFIG[task.taskType]?.isLecture ?? false;
    if (isLecture) totalLectures += 1;

    const dStat = dayMap.get(task.day);
    if (dStat) dStat.totalTasks += 1;

    const sStat = subjectMap[task.subject];
    if (sStat) sStat.total += 1;

    if (task.member1Done) {
      m1Done += 1;
      m1ActiveDays.add(task.day);
      if (isLecture) m1Lectures += 1;
      if (dStat) dStat.member1Done += 1;
      if (sStat) sStat.member1Done += 1;
    }

    if (task.member2Done) {
      m2Done += 1;
      m2ActiveDays.add(task.day);
      if (isLecture) m2Lectures += 1;
      if (dStat) dStat.member2Done += 1;
      if (sStat) sStat.member2Done += 1;
    }

    if (task.member1Done && task.member2Done) {
      bothDoneCount += 1;
      if (isLecture) finishedLecturesBoth += 1;
      if (dStat) dStat.bothDone += 1;
      if (sStat) sStat.bothDone += 1;
    } else if (task.member1Done || task.member2Done) {
      oneDoneCount += 1;
    } else {
      notStartedCount += 1;
    }
  }

  let m1SessionMins = 0;
  let m2SessionMins = 0;
  for (const session of sessions) {
    if (session.userUid === camp.member1Uid) {
      m1ActiveDays.add(session.day);
      m1SessionMins += session.durationMinutes;
    } else if (camp.member2Uid && session.userUid === camp.member2Uid) {
      m2ActiveDays.add(session.day);
      m2SessionMins += session.durationMinutes;
    }
  }

  const m1TotalMins = Math.max(camp.member1StudyMinutes || 0, m1SessionMins);
  const m2TotalMins = Math.max(camp.member2StudyMinutes || 0, m2SessionMins);

  const m1Rate = totalTasks > 0 ? Math.round((m1Done / totalTasks) * 100) : 0;
  const m2Rate = totalTasks > 0 ? Math.round((m2Done / totalTasks) * 100) : 0;

  const totalCheckSlots = totalTasks * (camp.member2Uid ? 2 : 1);
  const filledCheckSlots = m1Done + (camp.member2Uid ? m2Done : 0);
  const overallCompletionPercent =
    totalCheckSlots > 0 ? Math.round((filledCheckSlots / totalCheckSlots) * 100) : 0;

  const campSuccessRate =
    totalTasks > 0
      ? camp.member2Uid
        ? Math.round(((bothDoneCount * 1 + oneDoneCount * 0.5) / totalTasks) * 100)
        : m1Rate
      : 0;

  for (const key of Object.keys(subjectMap) as SubjectKey[]) {
    const s = subjectMap[key];
    const slots = s.total * (camp.member2Uid ? 2 : 1);
    const done = s.member1Done + (camp.member2Uid ? s.member2Done : 0);
    s.percent = slots > 0 ? Math.round((done / slots) * 100) : 0;
  }

  const m1Streak = computeStreak(m1ActiveDays, currentDay);
  const m2Streak = computeStreak(m2ActiveDays, currentDay);

  const activeStats = SUBJECT_ORDER.map((key) => subjectMap[key]);
  if (subjectMap.geology.total > 0) {
    activeStats.push(subjectMap.geology);
  }

  return {
    totalTasks,
    bothDoneCount,
    oneDoneCount,
    notStartedCount,
    remainingTasksCount: totalTasks - bothDoneCount,
    totalLectures,
    finishedLecturesBoth,
    overallCompletionPercent,
    campSuccessRate,
    member1: {
      uid: camp.member1Uid,
      name: camp.member1Name,
      avatar: camp.member1Avatar,
      completedTasks: m1Done,
      completedLectures: m1Lectures,
      completionRate: m1Rate,
      activeDaysCount: m1ActiveDays.size,
      streak: m1Streak,
      studyMinutes: m1TotalMins,
    },
    member2: camp.member2Uid
      ? {
          uid: camp.member2Uid,
          name: camp.member2Name,
          avatar: camp.member2Avatar,
          completedTasks: m2Done,
          completedLectures: m2Lectures,
          completionRate: m2Rate,
          activeDaysCount: m2ActiveDays.size,
          streak: m2Streak,
          studyMinutes: m2TotalMins,
        }
      : null,
    dailyStats: Array.from(dayMap.values()),
    subjectStats: activeStats,
  };
}

export function formatRelativeArabicTime(ms: number | undefined): string {
  if (!ms) return 'من لحظات';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'دلوقتي';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `من ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `من ${hrs} س`;
  const days = Math.floor(hrs / 24);
  return `من ${days} يوم`;
}

export function generateSafeId(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 12; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${Date.now()}_${suffix}`;
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part = '';
  for (let i = 0; i < 6; i++) {
    part += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MC-${part}`;
}
