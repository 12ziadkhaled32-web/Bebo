import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  areAllQuestionsAnswered,
  areResultsReleased,
  canStudentStartAttempt,
  computeExamDeadlineMs,
  computeMemberTotalsFromAttempts,
  computeRemainingSeconds,
  countAnsweredQuestions,
  findFirstUnansweredQuestionIndex,
  formatCountdownClock,
  generateGroupInviteCode,
  getExamTimeStatus,
  gradeObjectiveExam,
  normalizeAiParsedQuestions,
  parseBulkMcqQuestions,
  rankGroupMembers,
} from '../src/lib/groupCampUtils';
import {
  ADMIN_PHONE_LOCAL,
  SECURITY_QUESTIONS,
  buildPrimarySyntheticEmail,
  buildRecoveryAliasEmail,
  computeRecoverySecretHash,
  getEgyptianPhoneValidationError,
  getSecurityAnswerValidationError,
  getStudentPasswordValidationError,
  isAdminPhoneAuthEmail,
  isSyntheticPhoneEmail,
  isValidEgyptianMobile,
  normalizeEgyptianPhoneInput,
  normalizeSecurityAnswer,
  toE164EgyptianPhone,
  toLocalEgyptianPhone,
  toPhoneDigitsKey,
} from '../src/lib/phoneAuthUtils';
import {
  EVENING_AZKAR,
  MORNING_AZKAR,
  selectAzkarByCount,
} from '../src/constants/azkarData';
import {
  GroupCampMember,
  GroupExam,
  GroupExamAttempt,
  GroupExamQuestion,
} from '../src/types/camp';

function makeExam(overrides: Partial<GroupExam> = {}): GroupExam {
  const now = 1_750_000_000_000;
  return {
    id: 'exam_1',
    campId: 'gcamp_1',
    title: 'امتحان الفيزياء التنافسي',
    subject: 'الفيزياء',
    unit: 'الباب الأول',
    description: '',
    instructions: '',
    durationMinutes: 30,
    totalScore: 10,
    questionsCount: 4,
    startsAtMs: now - 60_000,
    endsAtMs: now + 3_600_000,
    maxAttempts: 2,
    resultsReleaseAtMs: 0,
    allowReviewAfterSubmit: true,
    status: 'published',
    attemptsStartedCount: 0,
    createdByUid: 'admin_uid',
    createdAt: null as any,
    updatedAt: null as any,
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<GroupExamAttempt> = {}): GroupExamAttempt {
  return {
    id: 'u1_1',
    campId: 'gcamp_1',
    examId: 'exam_1',
    uid: 'u1',
    studentName: 'أحمد',
    studentAvatar: '',
    attemptNumber: 1,
    status: 'submitted',
    answers: {},
    startedAt: null as any,
    startedAtMs: 1_750_000_000_000,
    deadlineAtMs: 1_750_001_800_000,
    submittedAtMs: 1_750_000_600_000,
    score: 8,
    maxScore: 10,
    percentage: 80,
    correctCount: 3,
    totalQuestions: 4,
    graded: true,
    adminApproved: true,
    updatedAt: null as any,
    ...overrides,
  };
}

test('getExamTimeStatus distinguishes upcoming, available, and ended correctly', () => {
  const exam = makeExam({ startsAtMs: 1000, endsAtMs: 5000 });
  assert.equal(getExamTimeStatus(exam, 999), 'upcoming');
  assert.equal(getExamTimeStatus(exam, 1000), 'available');
  assert.equal(getExamTimeStatus(exam, 5000), 'available');
  assert.equal(getExamTimeStatus(exam, 5001), 'ended');
});

test('computeExamDeadlineMs clamps deadline to exam endsAtMs and computeRemainingSeconds floors >= 0', () => {
  const startedAt = 100_000;
  // Normal: 10 mins = 600_000ms
  assert.equal(computeExamDeadlineMs(startedAt, 10, 900_000), 700_000);
  // Clamped: exam closes earlier at 300_000
  assert.equal(computeExamDeadlineMs(startedAt, 10, 300_000), 300_000);

  assert.equal(computeRemainingSeconds(300_000, 290_000), 10);
  assert.equal(computeRemainingSeconds(300_000, 350_000), 0);
  assert.equal(formatCountdownClock(3665), '01:01:05');
  assert.equal(formatCountdownClock(95), '01:35');
});

test('canStudentStartAttempt enforces schedule, draft, attempt limits, and active attempt resume', () => {
  const now = 1_750_000_000_000;
  const draftExam = makeExam({ status: 'draft' });
  assert.equal(canStudentStartAttempt(draftExam, [], now).allowed, false);

  const upcomingExam = makeExam({ startsAtMs: now + 5000, endsAtMs: now + 60000 });
  assert.equal(canStudentStartAttempt(upcomingExam, [], now).allowed, false);

  const endedExam = makeExam({ startsAtMs: now - 60000, endsAtMs: now - 1000 });
  assert.equal(canStudentStartAttempt(endedExam, [], now).allowed, false);

  const liveExam = makeExam({ startsAtMs: now - 5000, endsAtMs: now + 600000, maxAttempts: 1 });
  const inProgress = makeAttempt({ status: 'in_progress', deadlineAtMs: now + 120_000 });
  const resumeDecision = canStudentStartAttempt(liveExam, [inProgress], now);
  assert.equal(resumeDecision.allowed, true);
  assert.equal(resumeDecision.activeAttempt?.id, inProgress.id);

  const finished = makeAttempt({ status: 'submitted' });
  assert.equal(canStudentStartAttempt(liveExam, [finished], now).allowed, false);

  const multiAttemptExam = makeExam({ startsAtMs: now - 5000, endsAtMs: now + 600000, maxAttempts: 2 });
  const secondDecision = canStudentStartAttempt(multiAttemptExam, [finished], now);
  assert.equal(secondDecision.allowed, true);
  assert.equal(secondDecision.nextAttemptNumber, 2);
});

test('gradeObjectiveExam handles MCQ, image+4buttons, true/false, scientific questions, and fractional scores', () => {
  const questions: GroupExamQuestion[] = [
    {
      id: 'q1',
      examId: 'e1',
      campId: 'c1',
      order: 0,
      type: 'mcq',
      promptText: 'سؤال اختيار من متعدد',
      imageUrl: '',
      imageStoragePath: '',
      options: ['1', '2', '3', '4'],
      correctOptionIndex: 2,
      score: 2,
      explanation: '',
      createdAt: null as any,
      updatedAt: null as any,
    },
    {
      id: 'q2',
      examId: 'e1',
      campId: 'c1',
      order: 1,
      type: 'image_mcq',
      promptText: '',
      imageUrl: 'https://example.com/q2.png',
      imageStoragePath: '',
      options: ['أ', 'ب', 'ج', 'د'],
      correctOptionIndex: 1,
      score: 2.5,
      explanation: '',
      createdAt: null as any,
      updatedAt: null as any,
    },
    {
      id: 'q3',
      examId: 'e1',
      campId: 'c1',
      order: 2,
      type: 'true_false',
      promptText: 'وحدة قياس المقاومة هي الأوم',
      imageUrl: '',
      imageStoragePath: '',
      options: ['صح', 'خطأ'],
      correctOptionIndex: 0,
      score: 1.5,
      explanation: '',
      createdAt: null as any,
      updatedAt: null as any,
    },
    {
      id: 'q4',
      examId: 'e1',
      campId: 'c1',
      order: 3,
      type: 'scientific_mcq',
      promptText: 'V = I × R',
      imageUrl: '',
      imageStoragePath: '',
      options: ['I = V/R', 'I = V×R', 'I = R/V', 'I = V+R'],
      correctOptionIndex: 0,
      score: 4,
      explanation: '',
      createdAt: null as any,
      updatedAt: null as any,
    },
  ];

  // q1 right (2), q2 wrong (0), q3 right (1.5), q4 unanswered (0) => 3.5 / 10 (35%)
  const result = gradeObjectiveExam(questions, { q1: 2, q2: 0, q3: 0 });
  assert.equal(result.score, 3.5);
  assert.equal(result.maxScore, 10);
  assert.equal(result.percentage, 35);
  assert.equal(result.correctCount, 2);
  assert.equal(result.totalQuestions, 4);
});

test('areResultsReleased honors immediate release (0) and scheduled timestamp', () => {
  assert.equal(areResultsReleased({ resultsReleaseAtMs: 0 }, 1000), true);
  assert.equal(areResultsReleased({ resultsReleaseAtMs: 2000 }, 1500), false);
  assert.equal(areResultsReleased({ resultsReleaseAtMs: 2000 }, 2000), true);
});

test('computeMemberTotalsFromAttempts takes best score per exam and ignores in_progress attempts', () => {
  const attempts: GroupExamAttempt[] = [
    makeAttempt({ examId: 'ex1', attemptNumber: 1, status: 'submitted', score: 6, correctCount: 3, totalQuestions: 5 }),
    makeAttempt({ examId: 'ex1', attemptNumber: 2, status: 'submitted', score: 9, correctCount: 4, totalQuestions: 5 }),
    makeAttempt({ examId: 'ex2', attemptNumber: 1, status: 'timed_out', score: 8, correctCount: 4, totalQuestions: 4 }),
    makeAttempt({ examId: 'ex3', attemptNumber: 1, status: 'in_progress', score: 99, correctCount: 99, totalQuestions: 10 }),
  ];

  const totals = computeMemberTotalsFromAttempts({
    finishedAttempts: attempts,
    publishedExamsCount: 4,
    latestExamScore: 8,
  });

  assert.equal(totals.totalScore, 17); // 9 (best of ex1) + 8 (ex2)
  assert.equal(totals.examsTakenCount, 2);
  assert.equal(totals.totalCorrectAnswers, 8);
  assert.equal(totals.totalQuestionsAnswered, 9);
  assert.equal(totals.completionPercent, 50);
  assert.equal(totals.lastExamScore, 8);
});

test('rankGroupMembers ranks deterministically without speed bias and calculates scoreDiffFromPrev', () => {
  const members: GroupCampMember[] = [
    {
      uid: 'u3',
      campId: 'g1',
      displayName: 'سارة',
      avatarUrl: '',
      totalScore: 20,
      examsTakenCount: 2,
      totalCorrectAnswers: 10,
      totalQuestionsAnswered: 12,
      completionPercent: 100,
      lastExamScore: 9,
      joinedAt: null as any,
      updatedAt: null as any,
    },
    {
      uid: 'u1',
      campId: 'g1',
      displayName: 'باسم',
      avatarUrl: '',
      totalScore: 25,
      examsTakenCount: 2,
      totalCorrectAnswers: 12,
      totalQuestionsAnswered: 12,
      completionPercent: 100,
      lastExamScore: 10,
      joinedAt: null as any,
      updatedAt: null as any,
    },
    {
      uid: 'u2',
      campId: 'g1',
      displayName: 'مريم',
      avatarUrl: '',
      totalScore: 20,
      examsTakenCount: 2,
      totalCorrectAnswers: 11,
      totalQuestionsAnswered: 12,
      completionPercent: 100,
      lastExamScore: 8,
      joinedAt: null as any,
      updatedAt: null as any,
    },
  ];

  const ranked = rankGroupMembers(members);
  assert.equal(ranked[0].member.uid, 'u1');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].isChampion, true);
  assert.equal(ranked[0].scoreDiffFromPrev, 0);

  // Tie on totalScore=20 broken by totalCorrectAnswers (11 > 10)
  assert.equal(ranked[1].member.uid, 'u2');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[1].scoreDiffFromPrev, 5);

  assert.equal(ranked[2].member.uid, 'u3');
  assert.equal(ranked[2].rank, 3);
  assert.equal(ranked[2].scoreDiffFromPrev, 0);
});

test('generateGroupInviteCode matches strict Firestore invite code format', () => {
  for (let i = 0; i < 20; i++) {
    const code = generateGroupInviteCode();
    assert.match(code, /^GRP-[A-Z0-9]{6}$/);
  }
});

test('Security & Integrity static contract checks on firestore.rules, AdminPortalView.tsx, and GroupCampsView.tsx', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.match(rulesText, /request\.auth\.token\.email == '201274011475@phone\.moaskar\.app'/);
  assert.equal(rulesText.includes('12bassemmohamed12@gmail.com'), false);
  assert.match(rulesText, /function isGroupCampCreator\(campId\)/);
  assert.match(rulesText, /data\.maxMembers is int && data\.maxMembers >= 1 && data\.maxMembers <= 50/);
  assert.match(rulesText, /existing\(\)\.attemptsStartedCount == 0/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/userProfiles\/\$\(uid\)\)\.data\.groupCampId == campId/);
  assert.match(rulesText, /allow get: if isAdmin\(\)\s*\|\|\s*isGroupCampCreator\(campId\)\s*\|\|\s*isGroupCampMember\(campId\)\s*\|\|\s*\(isSignedIn\(\) && isValidId\(campId\) && isValidId\(uid\) && request\.auth\.uid == uid\)/);

  const adminText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AdminPortalView.tsx'),
    'utf8'
  );
  assert.equal(adminText.includes('getFirestore('), false, 'AdminPortalView must use named db, never getFirestore()');
  assert.equal(adminText.includes('window.confirm'), false, 'AdminPortalView must not call window.confirm');
  assert.equal(adminText.includes('window.alert'), false, 'AdminPortalView must not call window.alert');

  const groupViewText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/GroupCampsView.tsx'),
    'utf8'
  );
  assert.equal(groupViewText.includes('window.confirm'), false, 'GroupCampsView must not call window.confirm');
  assert.equal(groupViewText.includes('window.alert'), false, 'GroupCampsView must not call window.alert');

  const runnerText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/GroupExamRunnerModal.tsx'),
    'utf8'
  );
  assert.equal(/window\.confirm\s*\(/.test(runnerText), false, 'GroupExamRunnerModal must not call window.confirm');
  assert.equal(/window\.alert\s*\(/.test(runnerText), false, 'GroupExamRunnerModal must not call window.alert');
});

test('parseBulkMcqQuestions parses Arabic format with star-marked answer and 50 questions batch', () => {
  const sample = `السؤال الاول : ماهي عاصمة مصر ؟
١-الاسنكدرية
٢-العاصمة الادارية 
٣-القاهرة*
٤- المنيا `;

  const single = parseBulkMcqQuestions(sample, 2);
  assert.equal(single.questions.length, 1);
  assert.equal(single.questions[0].promptText, 'ماهي عاصمة مصر ؟');
  assert.deepEqual(single.questions[0].options, ['الاسنكدرية', 'العاصمة الادارية', 'القاهرة', 'المنيا']);
  assert.equal(single.questions[0].correctOptionIndex, 2);
  assert.equal(single.questions[0].score, 2);
  assert.equal(single.questions[0].hasMarkedCorrectAnswer, true);
  assert.deepEqual(single.missingStarNumbers, []);

  // Build 50 questions batch with varying star positions and formats
  const blocks: string[] = [];
  for (let i = 1; i <= 50; i++) {
    const correctIdx = (i - 1) % 4;
    const opts = ['خيار أ', 'خيار ب', 'خيار ج', 'خيار د'].map((txt, idx) =>
      `${['١', '٢', '٣', '٤'][idx]}-${idx === correctIdx ? `${txt}*` : txt}`
    );
    blocks.push(`السؤال ${i} : نص السؤال رقم ${i}؟\n${opts.join('\n')}`);
  }

  const batchResult = parseBulkMcqQuestions(blocks.join('\n'), 1.5);
  assert.equal(batchResult.questions.length, 50);
  assert.equal(batchResult.skippedCount, 0);
  assert.deepEqual(batchResult.missingStarNumbers, []);
  assert.equal(batchResult.questions[0].correctOptionIndex, 0);
  assert.equal(batchResult.questions[2].correctOptionIndex, 2);
  assert.equal(batchResult.questions[49].promptText, 'نص السؤال رقم 50؟');
  assert.equal(batchResult.questions[49].score, 1.5);

  // Missing star detection
  const noStar = parseBulkMcqQuestions(`السؤال الاول : سؤال بدون نجمة\n1- الف\n2- ب`, 1);
  assert.equal(noStar.questions.length, 1);
  assert.equal(noStar.questions[0].hasMarkedCorrectAnswer, false);
  assert.deepEqual(noStar.missingStarNumbers, [1]);
});

test('normalizeAiParsedQuestions validates mixed question types, 50-question batches, and Firestore bounds', () => {
  const mixedRaw = [
    {
      type: 'mcq',
      promptText: 'ما هي عاصمة مصر؟',
      options: ['الإسكندرية', 'العاصمة الإدارية', '*القاهرة*', 'المنيا'],
      correctOptionIndex: 2,
      hasMarkedCorrectAnswer: true,
      score: 2,
      explanation: 'القاهرة هي عاصمة جمهورية مصر العربية.',
    },
    {
      type: 'true_false',
      promptText: 'الأمبير هو وحدة قياس شدة التيار الكهربائي',
      options: ['صواب', 'خطأ', 'غير ذلك'],
      correctOptionIndex: 0,
      hasMarkedCorrectAnswer: true,
    },
    {
      type: 'scientific_mcq',
      promptText: 'احسب قيمة س في 2س + 4 = 10',
      options: ['2', '3', '4', '5'],
      correctOptionIndex: 1,
      hasMarkedCorrectAnswer: true,
      score: 1.5,
    },
    {
      type: 'image_mcq',
      promptText: 'في الشكل المقابل ما قيمة الزاوية س؟',
      options: [],
      correctOptionIndex: 99,
      hasMarkedCorrectAnswer: false,
    },
    {
      // Malformed MCQ with < 2 options should be skipped safely
      type: 'mcq',
      promptText: 'سؤال ناقص بدون اختيارات كافية',
      options: ['خيار واحد فقط'],
      correctOptionIndex: 0,
    },
  ];

  const res = normalizeAiParsedQuestions(mixedRaw, 1.25);
  assert.equal(res.questions.length, 4);
  assert.equal(res.summary.total, 4);
  assert.deepEqual(res.summary.byType, {
    mcq: 1,
    true_false: 1,
    scientific_mcq: 1,
    image_mcq: 1,
  });
  assert.equal(res.summary.unmarkedCount, 1);

  assert.equal(res.questions[0].options[2], 'القاهرة');
  assert.equal(res.questions[0].score, 2);
  assert.deepEqual(res.questions[1].options, ['صح', 'خطأ']);
  assert.equal(res.questions[1].score, 1.25);
  assert.equal(res.questions[2].type, 'scientific_mcq');
  assert.deepEqual(res.questions[3].options, ['أ', 'ب', 'ج', 'د']);
  assert.equal(res.questions[3].correctOptionIndex, 0);

  // Batch of 50 mixed questions
  const fiftyRaw = Array.from({ length: 50 }, (_, idx) => ({
    type: idx % 3 === 0 ? 'mcq' : idx % 3 === 1 ? 'true_false' : 'scientific_mcq',
    promptText: `سؤال رقم ${idx + 1}`,
    options: idx % 3 === 1 ? ['صح', 'خطأ'] : ['خ1', 'خ2', 'خ3', 'خ4'],
    correctOptionIndex: idx % 3 === 1 ? idx % 2 : idx % 4,
    hasMarkedCorrectAnswer: true,
  }));
  const batch50 = normalizeAiParsedQuestions(fiftyRaw, 1);
  assert.equal(batch50.questions.length, 50);
  assert.equal(batch50.summary.total, 50);
  assert.equal(batch50.summary.unmarkedCount, 0);
});

test('areAllQuestionsAnswered and findFirstUnansweredQuestionIndex enforce full completion before submit', () => {
  const questions = Array.from({ length: 50 }, (_, idx) => ({
    id: `q_${idx + 1}`,
    options: ['أ', 'ب', 'ج', 'د'],
  }));

  assert.equal(areAllQuestionsAnswered([], {}), false);
  assert.equal(countAnsweredQuestions(questions, {}), 0);
  assert.equal(findFirstUnansweredQuestionIndex(questions, {}), 0);
  assert.equal(areAllQuestionsAnswered(questions, {}), false);

  // Answer all except question #27 (index 26), plus inject an out-of-bounds option index for q_27
  const partial: Record<string, number> = {};
  for (let i = 0; i < 50; i++) {
    if (i !== 26) partial[`q_${i + 1}`] = i % 4;
  }
  partial.q_27 = 9; // invalid option index should NOT count as answered

  assert.equal(countAnsweredQuestions(questions, partial), 49);
  assert.equal(findFirstUnansweredQuestionIndex(questions, partial), 26);
  assert.equal(areAllQuestionsAnswered(questions, partial), false);

  // Valid answer for question #27 unlocks submission
  partial.q_27 = 2;
  assert.equal(countAnsweredQuestions(questions, partial), 50);
  assert.equal(findFirstUnansweredQuestionIndex(questions, partial), -1);
  assert.equal(areAllQuestionsAnswered(questions, partial), true);
});

test('In-camp لوحة الأدمن exam publisher contract & security checks', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const serverText = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const groupViewText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/GroupCampsView.tsx'),
    'utf8'
  );
  const publisherPanelText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CampExamPublisherPanel.tsx'),
    'utf8'
  );
  const gateApiText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/adminGateApi.ts'),
    'utf8'
  );

  // Never store plaintext passcode in client, rules, or server source
  const forbiddenLiteral = ['9090', 'bssdf'].join('');
  assert.equal(rulesText.includes(forbiddenLiteral), false);
  assert.equal(serverText.includes(forbiddenLiteral), false);
  assert.equal(groupViewText.includes(forbiddenLiteral), false);
  assert.equal(publisherPanelText.includes(forbiddenLiteral), false);
  assert.equal(gateApiText.includes(forbiddenLiteral), false);

  // Firestore rules contract
  assert.match(rulesText, /function isGroupExamPublisher\(campId\)/);
  assert.match(rulesText, /function isValidGroupExamPublisher\(data, campId, uid\)/);
  assert.match(rulesText, /match \/examPublishers\/\{uid\}/);
  assert.match(rulesText, /incoming\(\)\.createdByUid == request\.auth\.uid\s*&&\s*incoming\(\)\.status == 'published'/);

  // Server endpoints & AI sorter scope contract
  assert.match(serverText, /\/api\/camp-exam-gate\/verify/);
  assert.match(serverText, /\/api\/camp-exam-gate\/session/);
  assert.match(serverText, /verifyGateToken\(token,\s*\['admin_gate',\s*'camp_exam_gate'\]\)/);

  // Button placement right next to سؤال صغنن 🌸
  const lqIndex = groupViewText.indexOf("label: 'سؤال صغنن 🌸'");
  const adminBtnIndex = groupViewText.indexOf("label: 'لوحة الأدمن'");
  assert.ok(lqIndex !== -1 && adminBtnIndex !== -1 && adminBtnIndex > lqIndex);

  // Focused exam creation & publishing only (no browser storage tokens, no window prompts, no delete/monitor tools)
  assert.equal(/\blocalStorage\s*\./.test(publisherPanelText), false);
  assert.equal(/\bsessionStorage\s*\./.test(publisherPanelText), false);
  assert.equal(/window\.confirm\s*\(/.test(publisherPanelText), false);
  assert.equal(/window\.alert\s*\(/.test(publisherPanelText), false);
  assert.equal(publisherPanelText.includes('adminDeleteGroupExam'), false);
  assert.equal(publisherPanelText.includes('adminFetchExamAttempts'), false);
  assert.match(publisherPanelText, /status:\s*'published'/);
});

test('Azkar section (الأذكار) data integrity and Egyptian-dialect 3-step UI contract', () => {
  assert.equal(MORNING_AZKAR.length, 16);
  assert.equal(EVENING_AZKAR.length, 16);

  // Distinct IDs in both pools
  assert.equal(new Set(MORNING_AZKAR.map((z) => z.id)).size, 16);
  assert.equal(new Set(EVENING_AZKAR.map((z) => z.id)).size, 16);

  // Exact count selection & safe clamping
  assert.equal(selectAzkarByCount('morning', 5).length, 5);
  assert.equal(selectAzkarByCount('evening', 9).length, 9);
  assert.equal(selectAzkarByCount('morning', 0).length, 1);
  assert.equal(selectAzkarByCount('evening', 999).length, EVENING_AZKAR.length);
  assert.equal(selectAzkarByCount('morning', Number.NaN).length, 0);

  const azkarViewText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AzkarView.tsx'),
    'utf8'
  );
  const topBannerText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/TopBannerAndNav.tsx'),
    'utf8'
  );
  const appText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/App.tsx'),
    'utf8'
  );

  // Integrated button in top header bar (TopBannerAndNav) and rendered via App.tsx
  assert.match(topBannerText, /الأذكار 💗/);
  assert.match(topBannerText, /onClick=\{onToggleAzkar\}/);
  assert.match(appText, /azkarOpen \?\s*\(\s*<AzkarView onBack=\{\(\) => setAzkarOpen\(false\)\} \/>/);

  // Exact user flow: 2 period buttons -> "عاوز كام ذكر؟" + number input -> exact chosen azkar
  assert.match(azkarViewText, /أذكار الصباح/);
  assert.match(azkarViewText, /أذكار المساء/);
  assert.match(azkarViewText, /عاوز كام ذكر؟/);
  assert.match(azkarViewText, /type="number"/);

  // Requested emojis present
  for (const emoji of ['💗', '🌚', '🌝', '🎀', '🧸']) {
    assert.equal(azkarViewText.includes(emoji), true, `Missing requested emoji: ${emoji}`);
  }

  // Zero inline styles or blocking browser dialogs
  assert.equal(/\bstyle=\{\{/.test(azkarViewText), false);
  assert.equal(/window\.alert\s*\(/.test(azkarViewText), false);
  assert.equal(/window\.confirm\s*\(/.test(azkarViewText), false);
});

test('PWA compliance, icon assets, and SettingsModal install section contract', () => {
  const requiredAssets = [
    'public/icon.svg',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-512x512.png',
    'public/apple-touch-icon.png',
  ];
  for (const relPath of requiredAssets) {
    const absPath = path.resolve(process.cwd(), relPath);
    assert.equal(fs.existsSync(absPath), true, `Missing PWA asset: ${relPath}`);
    assert.ok(fs.statSync(absPath).size > 500, `PWA asset unexpectedly empty: ${relPath}`);
  }

  const viteConfigText = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
  assert.match(viteConfigText, /VitePWA\(/);
  assert.match(viteConfigText, /display:\s*'standalone'/);
  assert.match(viteConfigText, /short_name:\s*'معسكر مغلق'/);
  assert.match(viteConfigText, /devOptions:\s*\{\s*enabled:\s*true/);
  assert.match(viteConfigText, /navigateFallbackDenylist:\s*\[\/\^\\\/api\\\/\/\]/);

  const indexHtmlText = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.match(indexHtmlText, /rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"/);
  assert.match(indexHtmlText, /href="\/icon\.svg"/);

  const modalsText = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Modals.tsx'), 'utf8');
  assert.equal(modalsText.includes('تشغيل كل الإشعارات الفورية'), false);
  assert.equal(modalsText.includes('NOTIFICATION_TOGGLE_ITEMS'), false);
  assert.match(modalsText, /<PWAInstallSection\s*\/>/);
});

test('Admin-managed religious fact (معلومة يمكن اول مرة تعرفها) UI, service, and rules contract', () => {
  const azkarViewText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AzkarView.tsx'),
    'utf8'
  );
  const adminPortalText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AdminPortalView.tsx'),
    'utf8'
  );
  const adminTreasureTabText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AdminIslamicTreasureTab.tsx'),
    'utf8'
  );
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  assert.match(azkarViewText, /معلومة يمكن اول مرة تعرفها/);
  assert.equal(azkarViewText.includes('كنوز من الإسلام'), false);
  assert.match(azkarViewText, /subscribeToActiveIslamicTreasure/);

  assert.match(adminPortalText, /islamic_treasure/);
  assert.match(adminPortalText, /معلومة يمكن اول مرة تعرفها/);
  assert.match(adminPortalText, /<AdminIslamicTreasureTab/);

  assert.equal(adminTreasureTabText.includes('getFirestore('), false);
  assert.equal(/window\.alert\s*\(/.test(adminTreasureTabText), false);
  assert.equal(/window\.confirm\s*\(/.test(adminTreasureTabText), false);

  assert.match(rulesText, /function isValidIslamicTreasure\(data, treasureId\)/);
  assert.match(rulesText, /function isValidActiveIslamicTreasure\(data, docId\)/);
  assert.match(rulesText, /match \/islamicTreasures\/\{treasureId\}/);
  assert.match(rulesText, /match \/platformContent\/\{docId\}/);
});

test('Egyptian phone+password & zero-SMS security-question recovery contract', async () => {
  // Valid 11-digit Egyptian numbers (010, 011, 012, 015 + Arabic digits + +20 prefix)
  assert.equal(normalizeEgyptianPhoneInput('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.equal(normalizeEgyptianPhoneInput('+20 112 345 6789'), '01123456789');
  assert.equal(normalizeEgyptianPhoneInput('00201555551234'), '01555551234');
  assert.equal(isValidEgyptianMobile('01234567890'), true);
  assert.equal(getEgyptianPhoneValidationError('01098765432'), null);

  // Reject non-Egyptian, short, wrong prefix, or invalid 3rd digit
  assert.equal(isValidEgyptianMobile('01312345678'), false);
  assert.equal(isValidEgyptianMobile('02012345678'), false);
  assert.equal(isValidEgyptianMobile('0101234567'), false);
  assert.ok(getEgyptianPhoneValidationError('01312345678') !== null);

  assert.equal(toE164EgyptianPhone('01012345678'), '+201012345678');
  assert.equal(toPhoneDigitsKey('01012345678'), '201012345678');
  assert.equal(buildPrimarySyntheticEmail('01012345678'), '201012345678@phone.moaskar.app');
  const alias = buildRecoveryAliasEmail('01012345678', 1764000000000);
  assert.equal(alias, '201012345678.r1764000000000@phone.moaskar.app');
  assert.equal(isSyntheticPhoneEmail(alias), true);
  assert.equal(toLocalEgyptianPhone(alias), '01012345678');
  assert.equal(toLocalEgyptianPhone('+201555551234'), '01555551234');

  assert.ok(getStudentPasswordValidationError('12345') !== null);
  assert.equal(getStudentPasswordValidationError('123456'), null);

  // Security question normalization, validation, and deterministic SHA-256 hashing
  assert.ok(SECURITY_QUESTIONS.length >= 4);
  assert.equal(normalizeSecurityAnswer('  أَحْمَدُ   مُصْطَفَى ٠١ '), 'احمد مصطفي 01');
  assert.equal(normalizeSecurityAnswer('الفيزياء الحديثة'), normalizeSecurityAnswer('الفيزياء الحديثه'));
  assert.ok(getSecurityAnswerValidationError('أ') !== null);
  assert.equal(getSecurityAnswerValidationError('الفيزياء'), null);

  const hashA = await computeRecoverySecretHash('01012345678', 'أحمد');
  const hashB = await computeRecoverySecretHash('201012345678', 'احمد');
  const hashOtherPhone = await computeRecoverySecretHash('01112345678', 'احمد');
  const hashOtherAnswer = await computeRecoverySecretHash('01012345678', 'محمد');
  assert.match(hashA, /^[a-f0-9]{64}$/);
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashOtherPhone);
  assert.notEqual(hashA, hashOtherAnswer);

  // Student AuthOnboarding removed Google Sign-In & SMS modal, uses ForgotPasswordModal & SECURITY_QUESTIONS
  const authOnboardingText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AuthOnboarding.tsx'),
    'utf8'
  );
  assert.equal(authOnboardingText.includes('googleProvider'), false);
  assert.equal(authOnboardingText.includes('signInWithPopup'), false);
  assert.equal(authOnboardingText.includes('SmsForgotPasswordModal'), false);
  assert.match(authOnboardingText, /نسيت كلمة السر؟/);
  assert.match(authOnboardingText, /<ForgotPasswordModal/);
  assert.match(authOnboardingText, /SECURITY_QUESTIONS/);

  // AdminPortalView switched from Google Sign-In to 01274011475 phone+password auth
  assert.equal(ADMIN_PHONE_LOCAL, '01274011475');
  assert.equal(isAdminPhoneAuthEmail('201274011475@phone.moaskar.app'), true);
  assert.equal(isAdminPhoneAuthEmail('201274011475.r1764000000000@phone.moaskar.app'), true);
  assert.equal(isAdminPhoneAuthEmail('201012345678@phone.moaskar.app'), false);
  assert.equal(isAdminPhoneAuthEmail('12bassemmohamed12@gmail.com'), false);

  const adminPortalText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/AdminPortalView.tsx'),
    'utf8'
  );
  assert.equal(adminPortalText.includes('12bassemmohamed12@gmail.com'), false);
  assert.equal(adminPortalText.includes('googleProvider'), false);
  assert.equal(adminPortalText.includes('signInWithPopup'), false);
  assert.match(adminPortalText, /isAdminPhoneAuthEmail/);
  assert.match(adminPortalText, /ADMIN_PHONE_LOCAL/);

  const serverText = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  assert.equal(serverText.includes('12bassemmohamed12@gmail.com'), false);
  assert.match(serverText, /201274011475/);

  // ForgotPasswordModal uses zero-SMS security-question recovery (no RecaptchaVerifier, no signInWithPhoneNumber)
  assert.equal(fs.existsSync(path.resolve(process.cwd(), 'src/components/SmsForgotPasswordModal.tsx')), false);
  const forgotModalText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ForgotPasswordModal.tsx'),
    'utf8'
  );
  assert.match(forgotModalText, /fetchSecurityQuestionForPhone/);
  assert.match(forgotModalText, /resetPasswordWithSecurityAnswer/);
  assert.equal(/RecaptchaVerifier|signInWithPhoneNumber/.test(forgotModalText), false);
  assert.equal(/window\.alert\s*\(/.test(forgotModalText), false);

  const studentAuthServiceText = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/studentAuthService.ts'),
    'utf8'
  );
  assert.equal(/RecaptchaVerifier|signInWithPhoneNumber/.test(studentAuthServiceText), false);

  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.match(rulesText, /function isVerifiedOrPhoneStudent\(\)/);
  assert.match(rulesText, /match \/phoneLoginAliases\/\{phoneDigits\}/);
  assert.match(rulesText, /match \/phoneRecoverySecrets\/\{phoneDigits\}/);
  assert.equal(/isPhoneAuthUser|signInWithPhoneNumber/.test(rulesText), false);
});

