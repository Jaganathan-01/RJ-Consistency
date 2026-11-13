import type {
  Commitment,
  DailyCompletion,
  DailyCompletionStatus,
  HistoryEvent,
  StreakRecord,
  StreakStatus,
} from '../types/models';
import {
  getDatesInRange,
  getLogicalDate,
  isScheduledOnDate,
  subDaysFromDateStr,
} from '../utils/dateUtils';
import { createId } from './commitmentService';
import { db, databaseService } from './databaseService';
import { freezeEngine } from './freezeEngine';
import { recoveryEngine } from './recoveryEngine';

export function isQualifyingCompletion(
  commitment: Commitment,
  record: DailyCompletion
): boolean {
  if (record.completionStatus === 'COMPLETED' || record.completionStatus === 'RECOVERED') {
    return true;
  }
  if (commitment.strictness === 'FLEXIBLE' && record.completionStatus === 'PARTIAL') {
    return record.actualDurationMinutes >= record.minimumDurationMinutes;
  }
  return false;
}

export const streakEngine = {
  /**
   * Reconciles missed days, freeze states, recovery challenges, and recalculates
   * the authoritative StreakRecord for a single commitment up to todayDateStr.
   */
  async reconcileCommitment(commitmentId: string, todayDateStr?: string): Promise<StreakRecord | undefined> {
    const commitment = await db.commitments.get(commitmentId);
    if (!commitment) return undefined;

    const settings = await databaseService.ensureSettings();
    const today = todayDateStr ?? getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime);
    const yesterday = subDaysFromDateStr(today, 1);

    const existingStreak = await db.streakRecords.get(commitmentId);
    let longestStreak = existingStreak?.longestStreak ?? 0;

    // 1. Ensure past scheduled days (< today) without a record are explicitly recorded as MISSED
    //    (unless commitment was paused or unscheduled on that date).
    const allCompletions = await db.dailyCompletions
      .where('commitmentId')
      .equals(commitmentId)
      .toArray();
    const completionByDate = new Map<string, DailyCompletion>(
      allCompletions.map((c) => [c.scheduledDate, c])
    );

    if (commitment.schedule.startDate <= yesterday && commitment.status !== 'ARCHIVED') {
      const pastDates = getDatesInRange(commitment.schedule.startDate, yesterday);
      const newMissedRecords: DailyCompletion[] = [];
      const newMissedEvents: HistoryEvent[] = [];
      const nowIso = new Date().toISOString();

      for (const dateStr of pastDates) {
        if (!isScheduledOnDate(commitment, dateStr)) continue;
        const existing = completionByDate.get(dateStr);
        if (!existing) {
          const missedRecord: DailyCompletion = {
            id: `${commitmentId}_${dateStr}`,
            commitmentId,
            scheduledDate: dateStr,
            actualDurationMinutes: 0,
            actualDurationSeconds: 0,
            requiredDurationMinutes: commitment.targetDurationMinutes,
            minimumDurationMinutes: commitment.minimumDurationMinutes,
            completionStatus: 'MISSED',
            sessionIds: [],
          };
          completionByDate.set(dateStr, missedRecord);
          newMissedRecords.push(missedRecord);
          newMissedEvents.push({
            id: createId('hist'),
            commitmentId,
            commitmentName: commitment.name,
            date: dateStr,
            timestamp: nowIso,
            type: 'DAY_MISSED',
            details: `Missed scheduled commitment (${commitment.targetDurationMinutes} min target).`,
          });
        }
      }

      if (newMissedRecords.length > 0) {
        await db.transaction('rw', [db.dailyCompletions, db.historyEvents], async () => {
          await db.dailyCompletions.bulkPut(newMissedRecords);
          await db.historyEvents.bulkPut(newMissedEvents);
        });
      }
    }

    // 2. Walk chronologically across all scheduled dates up to today to compute metrics & current run
    const endRange = commitment.schedule.endDate && commitment.schedule.endDate < today
      ? commitment.schedule.endDate
      : today;
    const timelineDates =
      commitment.schedule.startDate <= endRange
        ? getDatesInRange(commitment.schedule.startDate, endRange)
        : [];

    let scheduledDaysCount = 0;
    let totalCompletedDays = 0;
    let missedDays = 0;
    let recoveryDays = 0;
    let lastCompletedDate: string | undefined;

    // Track runs separated by missed days or recoveries
    let runningStreak = 0;
    let trailingMissedDates: string[] = [];
    let streakBeforeTrailingMisses = 0;

    // Fetch completed recovery challenges so we know when a streak was preserved & restored
    const allChallenges = await db.recoveryChallenges
      .where('commitmentId')
      .equals(commitmentId)
      .toArray();
    const completedRecoveryByDate = new Map<string, number>();
    for (const ch of allChallenges) {
      if (ch.challengeStatus === 'COMPLETED' && ch.completedAt) {
        const recDate = getLogicalDate(
          new Date(ch.completedAt).getTime(),
          settings.timezone,
          settings.dayResetTime
        );
        completedRecoveryByDate.set(recDate, ch.previousStreak);
      }
    }

    for (const dateStr of timelineDates) {
      const rec = completionByDate.get(dateStr);
      const scheduled = isScheduledOnDate(commitment, dateStr);
      if (!scheduled && !rec) continue;

      if (scheduled) scheduledDaysCount++;

      if (rec && isQualifyingCompletion(commitment, rec)) {
        totalCompletedDays++;
        lastCompletedDate = dateStr;
        if (rec.completionStatus === 'RECOVERED') {
          recoveryDays++;
          const restoredFrom = completedRecoveryByDate.get(dateStr) ?? streakBeforeTrailingMisses;
          runningStreak = Math.max(runningStreak, restoredFrom) + 1;
        } else {
          runningStreak += 1;
        }
        longestStreak = Math.max(longestStreak, runningStreak);
        trailingMissedDates = [];
        streakBeforeTrailingMisses = runningStreak;
      } else if (dateStr < today && scheduled) {
        // Past scheduled day that was not completed
        missedDays++;
        if (trailingMissedDates.length === 0) {
          streakBeforeTrailingMisses = runningStreak;
        }
        trailingMissedDates.push(dateStr);
        // Check if freeze/recovery can hold this streak or if it broke
        if (
          streakBeforeTrailingMisses > 0 &&
          freezeEngine.shouldTriggerFreeze(commitment, trailingMissedDates.length) &&
          !freezeEngine.isWithinFreezeWindow(commitment, trailingMissedDates.length)
        ) {
          // Exceeded max frozen days without recovery
          runningStreak = 0;
        }
      }
    }

    // 3. Evaluate active freeze & recovery challenge for trailing missed dates
    let activeChallenge = await recoveryEngine.getActiveChallenge(commitmentId);
    if (activeChallenge && today > activeChallenge.deadline) {
      await recoveryEngine.expireChallenge(activeChallenge.id, today);
      activeChallenge = undefined;
      runningStreak = 0;
      streakBeforeTrailingMisses = 0;
    }

    let streakStatus: StreakStatus = 'ACTIVE';
    let currentStreak = runningStreak;

    if (commitment.status === 'PAUSED') {
      streakStatus = 'PAUSED';
    } else if (trailingMissedDates.length > 0 && streakBeforeTrailingMisses > 0) {
      const missedCount = trailingMissedDates.length;
      const shouldFreeze = freezeEngine.shouldTriggerFreeze(commitment, missedCount);
      const withinWindow = freezeEngine.isWithinFreezeWindow(commitment, missedCount);

      if (!shouldFreeze) {
        // Inside NORMAL grace period
        streakStatus = 'AT_RISK';
        currentStreak = streakBeforeTrailingMisses;
      } else if (withinWindow) {
        // Freeze active + recovery required
        await freezeEngine.createOrExtendFreeze(
          commitment,
          trailingMissedDates,
          streakBeforeTrailingMisses
        );
        const challenge = await recoveryEngine.createOrGetChallenge(
          commitment,
          streakBeforeTrailingMisses,
          trailingMissedDates,
          today
        );
        currentStreak = streakBeforeTrailingMisses;
        streakStatus = challenge ? 'RECOVERY_REQUIRED' : 'FROZEN';
      } else {
        // Exceeded max frozen days
        if (activeChallenge) {
          await recoveryEngine.expireChallenge(activeChallenge.id, today);
        } else {
          await freezeEngine.expireActiveFreeze(commitmentId);
        }
        currentStreak = 0;
        streakStatus = 'BROKEN';
      }
    } else if (trailingMissedDates.length > 0 && streakBeforeTrailingMisses === 0) {
      currentStreak = 0;
      streakStatus = 'BROKEN';
    } else {
      streakStatus = 'ACTIVE';
    }

    const freezes = await db.freezeRecords.where('commitmentId').equals(commitmentId).toArray();
    const frozenDays = freezes.reduce((sum, f) => sum + f.missedDaysCount, 0);

    const pastOrTodayScheduled = timelineDates.filter((d) => {
      if (!isScheduledOnDate(commitment, d)) return false;
      if (d < today) return true;
      const rec = completionByDate.get(d);
      return Boolean(rec && isQualifyingCompletion(commitment, rec));
    }).length;

    const consistencyPercentage =
      pastOrTodayScheduled > 0
        ? Math.min(100, Math.round((totalCompletedDays / pastOrTodayScheduled) * 100))
        : 0;

    const nowIso = new Date().toISOString();
    const record: StreakRecord = {
      id: commitmentId,
      commitmentId,
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      totalCompletedDays,
      missedDays,
      frozenDays,
      recoveryDays,
      scheduledDaysCount,
      consistencyPercentage,
      lastCompletedDate,
      lastEvaluatedDate: today,
      streakStatus,
      updatedAt: nowIso,
    };

    await db.streakRecords.put(record);
    return record;
  },

  async reconcileAll(todayDateStr?: string): Promise<StreakRecord[]> {
    const commitments = await db.commitments.toArray();
    const results: StreakRecord[] = [];
    for (const c of commitments) {
      if (c.status === 'ARCHIVED') {
        const existing = await db.streakRecords.get(c.id);
        if (existing) results.push(existing);
        continue;
      }
      const updated = await this.reconcileCommitment(c.id, todayDateStr);
      if (updated) results.push(updated);
    }
    return results;
  },

  /**
   * Records session seconds toward a commitment's DailyCompletion in an idempotent
   * transaction (duplicate sessionIds are safely ignored).
   */
  async recordSessionCompletion(params: {
    commitmentId: string;
    scheduledDate: string;
    sessionId: string;
    actualDurationSeconds: number;
    completionType: 'REGULAR' | 'RECOVERY';
    recoveryChallengeId?: string;
  }): Promise<{ completion: DailyCompletion; streak?: StreakRecord; newlyCompletedToday: boolean }> {
    const {
      commitmentId,
      scheduledDate,
      sessionId,
      actualDurationSeconds,
      completionType,
      recoveryChallengeId,
    } = params;

    const commitment = await db.commitments.get(commitmentId);
    if (!commitment) throw new Error('Commitment not found');

    const completionId = `${commitmentId}_${scheduledDate}`;
    const nowIso = new Date().toISOString();

    let newlyCompletedToday = false;
    let savedCompletion!: DailyCompletion;

    await db.transaction(
      'rw',
      [db.dailyCompletions, db.historyEvents],
      async () => {
        const existing = await db.dailyCompletions.get(completionId);
        if (existing && existing.sessionIds.includes(sessionId)) {
          savedCompletion = existing;
          return;
        }

        const prevQualified = existing ? isQualifyingCompletion(commitment, existing) : false;
        const nextTotalSeconds = (existing?.actualDurationSeconds ?? 0) + actualDurationSeconds;
        const nextTotalMinutes = Math.round(nextTotalSeconds / 60);
        const requiredMins = existing?.requiredDurationMinutes ?? commitment.targetDurationMinutes;
        const minimumMins = existing?.minimumDurationMinutes ?? commitment.minimumDurationMinutes;

        let nextStatus: DailyCompletionStatus = existing?.completionStatus ?? 'PARTIAL';

        if (completionType === 'RECOVERY') {
          nextStatus = 'RECOVERED';
        } else if (nextTotalSeconds >= requiredMins * 60) {
          nextStatus = 'COMPLETED';
        } else if (
          commitment.strictness === 'FLEXIBLE' &&
          nextTotalSeconds >= minimumMins * 60
        ) {
          nextStatus = 'PARTIAL';
        } else {
          nextStatus = 'PARTIAL';
        }

        const updated: DailyCompletion = {
          id: completionId,
          commitmentId,
          scheduledDate,
          actualDurationMinutes: nextTotalMinutes,
          actualDurationSeconds: nextTotalSeconds,
          requiredDurationMinutes: requiredMins,
          minimumDurationMinutes: minimumMins,
          completionStatus: nextStatus,
          completedAt:
            nextStatus === 'COMPLETED' || nextStatus === 'RECOVERED'
              ? existing?.completedAt ?? nowIso
              : existing?.completedAt,
          sessionIds: [...(existing?.sessionIds ?? []), sessionId],
        };

        await db.dailyCompletions.put(updated);
        savedCompletion = updated;

        const nowQualified = isQualifyingCompletion(commitment, updated);
        newlyCompletedToday = !prevQualified && nowQualified;

        const sessionMinutes = Math.max(1, Math.round(actualDurationSeconds / 60));
        await db.historyEvents.put({
          id: createId('hist'),
          commitmentId,
          commitmentName: commitment.name,
          date: scheduledDate,
          timestamp: nowIso,
          type:
            nextStatus === 'COMPLETED' || nextStatus === 'RECOVERED'
              ? 'DAY_COMPLETED'
              : 'SESSION_COMPLETED',
          durationMinutes: sessionMinutes,
          details:
            completionType === 'RECOVERY'
              ? `Logged ${sessionMinutes}m recovery focus session.`
              : `Logged ${sessionMinutes}m focus session (${nextTotalMinutes}/${requiredMins}m today).`,
        });
      }
    );

    if (completionType === 'RECOVERY' && recoveryChallengeId) {
      const challenge = await db.recoveryChallenges.get(recoveryChallengeId);
      if (challenge && actualDurationSeconds >= challenge.requiredDurationMinutes * 60) {
        await recoveryEngine.completeChallenge(
          recoveryChallengeId,
          Math.round(actualDurationSeconds / 60),
          scheduledDate
        );
      }
    }

    const streak = await this.reconcileCommitment(commitmentId, scheduledDate);
    return { completion: savedCompletion, streak, newlyCompletedToday };
  },
};
