import type { Commitment, HistoryEvent, RecoveryChallenge } from '../types/models';
import { addDaysToDateStr } from '../utils/dateUtils';
import { createId } from './commitmentService';
import { db } from './databaseService';
import { freezeEngine } from './freezeEngine';

export const recoveryEngine = {
  calculateRequiredDurationMinutes(commitment: Commitment, missedDaysCount: number): number {
    const multiplier = Math.max(1, commitment.recoverySettings.recoveryMultiplier || 1.35);
    const scaled = Math.round(commitment.targetDurationMinutes * multiplier);
    const extraScale = missedDaysCount > 3 ? Math.round(commitment.targetDurationMinutes * 0.1 * (missedDaysCount - 3)) : 0;
    return Math.max(commitment.targetDurationMinutes + 1, scaled + extraScale);
  },

  async getActiveChallenge(commitmentId: string): Promise<RecoveryChallenge | undefined> {
    const list = await db.recoveryChallenges.where('commitmentId').equals(commitmentId).toArray();
    return list.find((c) => c.challengeStatus === 'PENDING' || c.challengeStatus === 'IN_PROGRESS');
  },

  async listAllChallenges(): Promise<RecoveryChallenge[]> {
    return db.recoveryChallenges.orderBy('createdAt').reverse().toArray();
  },

  async createOrGetChallenge(
    commitment: Commitment,
    previousStreak: number,
    missedDates: string[],
    todayDateStr: string
  ): Promise<RecoveryChallenge | undefined> {
    if (!commitment.recoverySettings.enabled || previousStreak <= 0 || missedDates.length === 0) {
      return undefined;
    }

    const existing = await this.getActiveChallenge(commitment.id);
    if (existing) {
      // Update missedDates if additional days were missed before deadline
      if (missedDates.length > existing.missedDates.length) {
        const updated: RecoveryChallenge = {
          ...existing,
          missedDates,
          requiredDurationMinutes: this.calculateRequiredDurationMinutes(commitment, missedDates.length),
        };
        await db.recoveryChallenges.put(updated);
        return updated;
      }
      return existing;
    }

    const nowIso = new Date().toISOString();
    const requiredMinutes = this.calculateRequiredDurationMinutes(commitment, missedDates.length);
    const deadline = addDaysToDateStr(
      todayDateStr,
      Math.max(1, commitment.recoverySettings.recoveryDeadlineDays)
    );

    const challenge: RecoveryChallenge = {
      id: createId('rec'),
      commitmentId: commitment.id,
      previousStreak,
      missedDates,
      requiredDurationMinutes: requiredMinutes,
      actualDurationMinutes: 0,
      challengeStatus: 'PENDING',
      createdAt: nowIso,
      deadline,
    };

    const event: HistoryEvent = {
      id: createId('hist'),
      commitmentId: commitment.id,
      commitmentName: commitment.name,
      date: todayDateStr,
      timestamp: nowIso,
      type: 'RECOVERY_CREATED',
      durationMinutes: requiredMinutes,
      streakBefore: previousStreak,
      streakAfter: previousStreak,
      details: `Recovery challenge generated (${requiredMinutes} min) to restore ${previousStreak}-day streak by ${deadline}.`,
    };

    await db.transaction('rw', [db.recoveryChallenges, db.historyEvents], async () => {
      await db.recoveryChallenges.put(challenge);
      await db.historyEvents.put(event);
    });

    return challenge;
  },

  async markInProgress(challengeId: string): Promise<void> {
    const ch = await db.recoveryChallenges.get(challengeId);
    if (!ch || ch.challengeStatus !== 'PENDING') return;
    await db.recoveryChallenges.put({
      ...ch,
      challengeStatus: 'IN_PROGRESS',
    });
  },

  async completeChallenge(
    challengeId: string,
    actualDurationMinutes: number,
    todayDateStr: string
  ): Promise<RecoveryChallenge> {
    const ch = await db.recoveryChallenges.get(challengeId);
    if (!ch) throw new Error('Recovery challenge not found');
    if (ch.challengeStatus === 'COMPLETED') return ch;

    const commitment = await db.commitments.get(ch.commitmentId);
    const nowIso = new Date().toISOString();

    const completed: RecoveryChallenge = {
      ...ch,
      actualDurationMinutes: Math.max(ch.actualDurationMinutes, actualDurationMinutes),
      challengeStatus: 'COMPLETED',
      completedAt: nowIso,
    };

    await db.transaction(
      'rw',
      [db.recoveryChallenges, db.freezeRecords, db.historyEvents],
      async () => {
        await db.recoveryChallenges.put(completed);
        await freezeEngine.markFreezeRecovered(ch.commitmentId);
        await db.historyEvents.put({
          id: createId('hist'),
          commitmentId: ch.commitmentId,
          commitmentName: commitment?.name ?? 'Commitment',
          date: todayDateStr,
          timestamp: nowIso,
          type: 'RECOVERY_COMPLETED',
          durationMinutes: actualDurationMinutes,
          streakBefore: ch.previousStreak,
          streakAfter: ch.previousStreak + 1,
          details: `Completed ${actualDurationMinutes}-minute recovery session. ${ch.previousStreak}-day streak restored.`,
        });
      }
    );

    return completed;
  },

  async expireChallenge(challengeId: string, todayDateStr: string): Promise<void> {
    const ch = await db.recoveryChallenges.get(challengeId);
    if (!ch || ch.challengeStatus === 'COMPLETED' || ch.challengeStatus === 'EXPIRED') return;

    const commitment = await db.commitments.get(ch.commitmentId);
    const nowIso = new Date().toISOString();

    await db.transaction(
      'rw',
      [db.recoveryChallenges, db.freezeRecords, db.historyEvents],
      async () => {
        await db.recoveryChallenges.put({
          ...ch,
          challengeStatus: 'EXPIRED',
        });
        await freezeEngine.expireActiveFreeze(ch.commitmentId);
        await db.historyEvents.put({
          id: createId('hist'),
          commitmentId: ch.commitmentId,
          commitmentName: commitment?.name ?? 'Commitment',
          date: todayDateStr,
          timestamp: nowIso,
          type: 'RECOVERY_EXPIRED',
          streakBefore: ch.previousStreak,
          streakAfter: 0,
          details: `Recovery challenge expired after deadline ${ch.deadline}. Streak reset from ${ch.previousStreak} to 0; longest streak preserved.`,
        });
      }
    );
  },
};
