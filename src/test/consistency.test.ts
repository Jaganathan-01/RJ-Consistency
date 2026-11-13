import { describe, expect, it } from 'vitest';
import { backupService } from '../services/backupService';
import { commitmentService } from '../services/commitmentService';
import { db } from '../services/databaseService';
import { freezeEngine } from '../services/freezeEngine';
import { recoveryEngine } from '../services/recoveryEngine';
import { streakEngine } from '../services/streakEngine';
import { computeElapsedMs, timerService } from '../services/timerService';
import { addDaysToDateStr, getLogicalDate } from '../utils/dateUtils';

describe('Timezone and Logical Date Boundaries', () => {
  it('applies timezone and dayResetTime accurately across midnight', () => {
    // 2026-05-10 01:30 UTC => in America/New_York (EDT UTC-4) it is 2026-05-09 21:30
    const ts = Date.UTC(2026, 4, 10, 1, 30, 0);
    expect(getLogicalDate(ts, 'UTC', '00:00')).toBe('2026-05-10');
    expect(getLogicalDate(ts, 'America/New_York', '00:00')).toBe('2026-05-09');

    // With dayResetTime 04:00 in UTC, 01:30 belongs to previous logical day 2026-05-09
    expect(getLogicalDate(ts, 'UTC', '04:00')).toBe('2026-05-09');
  });
});

describe('Commitment CRUD and Pause Protection', () => {
  it('creates, updates, pauses without missed-day penalty, and deletes commitments', async () => {
    const c = await commitmentService.create({
      name: 'Meditation',
      category: 'Mindfulness',
      icon: 'Brain',
      color: '#10B981',
      targetDurationMinutes: 15,
      minimumDurationMinutes: 10,
      schedule: { type: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-05-01' },
      strictness: 'STRICT',
    });

    expect(c.name).toBe('Meditation');
    expect(c.targetDurationMinutes).toBe(15);

    // Complete Day 1
    await streakEngine.recordSessionCompletion({
      commitmentId: c.id,
      scheduledDate: '2026-05-01',
      sessionId: 'ses_1',
      actualDurationSeconds: 15 * 60,
      completionType: 'REGULAR',
    });

    // Pause from Day 2 through Day 4
    await commitmentService.pause(c.id, '2026-05-02');
    const streakWhilePaused = await streakEngine.reconcileCommitment(c.id, '2026-05-04');
    expect(streakWhilePaused?.currentStreak).toBe(1);
    expect(streakWhilePaused?.missedDays).toBe(0);
    expect(streakWhilePaused?.streakStatus).toBe('PAUSED');

    // Resume on Day 5
    await commitmentService.resume(c.id, '2026-05-05');
    const streakResumed = await streakEngine.reconcileCommitment(c.id, '2026-05-05');
    expect(streakResumed?.missedDays).toBe(0);
    expect(streakResumed?.currentStreak).toBe(1);

    await commitmentService.delete(c.id);
    expect(await commitmentService.getById(c.id)).toBeUndefined();
  });
});

describe('Focus Timer Persistence and Duplicate Prevention', () => {
  it('calculates elapsed duration from startedAt, pausedAt, and accumulatedPausedDuration', async () => {
    const c = await commitmentService.create({
      name: 'Reading',
      category: 'Learning',
      icon: 'BookOpen',
      color: '#F59E0B',
      targetDurationMinutes: 20,
      minimumDurationMinutes: 10,
      schedule: { type: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-05-10' },
      strictness: 'NORMAL',
    });

    const t0 = Date.UTC(2026, 4, 10, 10, 0, 0);
    const session = await timerService.startSession({
      commitmentId: c.id,
      nowMs: t0,
    });

    // Pause after 5 minutes
    const tPause = t0 + 5 * 60 * 1000;
    const paused = await timerService.pauseSession(session.id, tPause);
    expect(computeElapsedMs(paused, tPause + 10 * 60 * 1000)).toBe(5 * 60 * 1000);

    // Resume 10 minutes later
    const tResume = tPause + 10 * 60 * 1000;
    const resumed = await timerService.resumeSession(session.id, tResume);
    expect(resumed.accumulatedPausedDuration).toBe(10 * 60 * 1000);

    // Reopen 15 minutes after resume => total active = 5 + 15 = 20 minutes => completes!
    const tEnd = tResume + 15 * 60 * 1000;
    const reconciled = await timerService.reconcileActiveSession(tEnd);
    expect(reconciled?.justCompleted).toBe(true);
    expect(reconciled?.session.sessionStatus).toBe('COMPLETED');

    // Reconciling/completing again does NOT double-count
    const secondComplete = await timerService.completeSession(session.id, tEnd + 5000);
    expect(secondComplete.justCompleted).toBe(false);

    const streak = await db.streakRecords.get(c.id);
    expect(streak?.currentStreak).toBe(1);
    expect(streak?.totalCompletedDays).toBe(1);
  });

  it('prevents duplicate sessionId counting in DailyCompletion', async () => {
    const c = await commitmentService.create({
      name: 'Exercise',
      category: 'Health',
      icon: 'Dumbbell',
      color: '#EF4444',
      targetDurationMinutes: 30,
      minimumDurationMinutes: 15,
      schedule: { type: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-05-10' },
      strictness: 'STRICT',
    });

    await streakEngine.recordSessionCompletion({
      commitmentId: c.id,
      scheduledDate: '2026-05-10',
      sessionId: 'dup_ses_1',
      actualDurationSeconds: 1800,
      completionType: 'REGULAR',
    });

    await streakEngine.recordSessionCompletion({
      commitmentId: c.id,
      scheduledDate: '2026-05-10',
      sessionId: 'dup_ses_1',
      actualDurationSeconds: 1800,
      completionType: 'REGULAR',
    });

    const daily = await db.dailyCompletions.get(`${c.id}_2026-05-10`);
    expect(daily?.actualDurationMinutes).toBe(30);
    expect(daily?.sessionIds).toHaveLength(1);
  });
});

describe('Streak Freeze and Recovery Challenge Engine', () => {
  it('freezes a 10-day streak after 3 missed days, generates a 20m recovery challenge, and restores on completion', async () => {
    const start = '2026-05-01';
    const c = await commitmentService.create({
      name: 'Meditation',
      category: 'Mindfulness',
      icon: 'Brain',
      color: '#10B981',
      targetDurationMinutes: 15,
      minimumDurationMinutes: 15,
      schedule: { type: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: start },
      strictness: 'STRICT',
      freezeSettings: { enabled: true, gracePeriodDays: 0, maxFrozenDays: 3, freezeDurationDays: 3 },
      recoverySettings: { enabled: true, recoveryDeadlineDays: 2, recoveryMultiplier: 1.35 },
    });

    // Days 1-10 completed
    for (let i = 0; i < 10; i++) {
      const d = addDaysToDateStr(start, i);
      await streakEngine.recordSessionCompletion({
        commitmentId: c.id,
        scheduledDate: d,
        sessionId: `ses_${i}`,
        actualDurationSeconds: 15 * 60,
        completionType: 'REGULAR',
      });
    }

    // Reconcile on Day 14 (Days 11, 12, 13 missed => 3 missed days)
    const day14 = addDaysToDateStr(start, 13);
    const frozenStreak = await streakEngine.reconcileCommitment(c.id, day14);

    expect(frozenStreak?.currentStreak).toBe(10);
    expect(frozenStreak?.longestStreak).toBe(10);
    expect(frozenStreak?.missedDays).toBe(3);
    expect(frozenStreak?.streakStatus).toBe('RECOVERY_REQUIRED');

    const activeFreeze = await freezeEngine.getActiveFreeze(c.id);
    expect(activeFreeze?.status).toBe('ACTIVE');

    const challenge = await recoveryEngine.getActiveChallenge(c.id);
    expect(challenge).toBeDefined();
    expect(challenge?.previousStreak).toBe(10);
    expect(challenge?.requiredDurationMinutes).toBe(20);

    // Complete recovery session on Day 14
    await streakEngine.recordSessionCompletion({
      commitmentId: c.id,
      scheduledDate: day14,
      sessionId: 'ses_recovery',
      actualDurationSeconds: 20 * 60,
      completionType: 'RECOVERY',
      recoveryChallengeId: challenge?.id,
    });

    const restoredStreak = await db.streakRecords.get(c.id);
    expect(restoredStreak?.currentStreak).toBe(11);
    expect(restoredStreak?.longestStreak).toBe(11);
    expect(restoredStreak?.streakStatus).toBe('ACTIVE');

    const updatedChallenge = await db.recoveryChallenges.get(challenge!.id);
    expect(updatedChallenge?.challengeStatus).toBe('COMPLETED');
  });

  it('resets current streak when recovery challenge expires while preserving longest streak', async () => {
    const start = '2026-05-01';
    const c = await commitmentService.create({
      name: 'DSA Practice',
      category: 'Engineering',
      icon: 'Code2',
      color: '#3B82F6',
      targetDurationMinutes: 60,
      minimumDurationMinutes: 30,
      schedule: { type: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: start },
      strictness: 'NORMAL',
      freezeSettings: { enabled: true, gracePeriodDays: 1, maxFrozenDays: 3, freezeDurationDays: 3 },
      recoverySettings: { enabled: true, recoveryDeadlineDays: 1, recoveryMultiplier: 1.5 },
    });

    for (let i = 0; i < 5; i++) {
      await streakEngine.recordSessionCompletion({
        commitmentId: c.id,
        scheduledDate: addDaysToDateStr(start, i),
        sessionId: `dsa_${i}`,
        actualDurationSeconds: 60 * 60,
        completionType: 'REGULAR',
      });
    }

    // Reconcile on Day 8 (Days 6 & 7 missed => > 1 grace day => freeze & recovery deadline Day 9)
    const day8 = addDaysToDateStr(start, 7);
    const frozen = await streakEngine.reconcileCommitment(c.id, day8);
    expect(frozen?.streakStatus).toBe('RECOVERY_REQUIRED');

    // Reconcile on Day 11 (after deadline Day 9) => expired
    const day11 = addDaysToDateStr(start, 10);
    const expired = await streakEngine.reconcileCommitment(c.id, day11);
    expect(expired?.currentStreak).toBe(0);
    expect(expired?.longestStreak).toBe(5);
    expect(expired?.streakStatus).toBe('BROKEN');
  });
});

describe('Backup Export and Restore', () => {
  it('exports valid JSON, validates schema, and merges without duplicating existing records', async () => {
    const c = await commitmentService.create({
      name: 'English Practice',
      category: 'Communication',
      icon: 'Mic',
      color: '#8B5CF6',
      targetDurationMinutes: 20,
      minimumDurationMinutes: 10,
      schedule: { type: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-05-10' },
      strictness: 'FLEXIBLE',
    });

    const exported = await backupService.exportJson();
    const validation = backupService.validateBackup(exported);
    expect(validation.valid).toBe(true);

    // Merge into existing DB should import 0 duplicate commitments
    const mergeSummary = await backupService.importBackup(exported, 'merge');
    expect(mergeSummary.commitmentsImported).toBe(0);
    expect(await db.commitments.count()).toBe(1);

    // Replace restores the commitment cleanly
    await commitmentService.delete(c.id);
    expect(await db.commitments.count()).toBe(0);

    const replaceSummary = await backupService.importBackup(exported, 'replace');
    expect(replaceSummary.commitmentsImported).toBe(1);
    expect(await db.commitments.count()).toBe(1);
  });
});
