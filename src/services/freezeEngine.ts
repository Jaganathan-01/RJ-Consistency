import type { Commitment, FreezeRecord, HistoryEvent } from '../types/models';
import { addDaysToDateStr } from '../utils/dateUtils';
import { createId } from './commitmentService';
import { db } from './databaseService';

export const freezeEngine = {
  shouldTriggerFreeze(commitment: Commitment, consecutiveMissedCount: number): boolean {
    if (!commitment.freezeSettings.enabled || consecutiveMissedCount <= 0) return false;
    if (commitment.strictness === 'STRICT') {
      return consecutiveMissedCount >= 1;
    }
    return consecutiveMissedCount > commitment.freezeSettings.gracePeriodDays;
  },

  isWithinFreezeWindow(commitment: Commitment, consecutiveMissedCount: number): boolean {
    if (!commitment.freezeSettings.enabled) return false;
    return consecutiveMissedCount <= commitment.freezeSettings.maxFrozenDays;
  },

  async getActiveFreeze(commitmentId: string): Promise<FreezeRecord | undefined> {
    const all = await db.freezeRecords.where('commitmentId').equals(commitmentId).toArray();
    return all.find((r) => r.status === 'ACTIVE');
  },

  async createOrExtendFreeze(
    commitment: Commitment,
    missedDates: string[],
    previousStreak: number
  ): Promise<FreezeRecord> {
    const existing = await this.getActiveFreeze(commitment.id);
    const firstMissed = missedDates[0];
    const freezeUntil = addDaysToDateStr(
      firstMissed,
      Math.max(0, commitment.freezeSettings.freezeDurationDays - 1)
    );

    if (existing) {
      const updated: FreezeRecord = {
        ...existing,
        frozenUntilDate: freezeUntil > existing.frozenUntilDate ? freezeUntil : existing.frozenUntilDate,
        missedDaysCount: Math.max(existing.missedDaysCount, missedDates.length),
        reason: `Missed ${missedDates.length} scheduled day${missedDates.length === 1 ? '' : 's'} (${missedDates.join(', ')})`,
      };
      await db.freezeRecords.put(updated);
      return updated;
    }

    const nowIso = new Date().toISOString();
    const record: FreezeRecord = {
      id: createId('frz'),
      commitmentId: commitment.id,
      frozenFromDate: firstMissed,
      frozenUntilDate: freezeUntil,
      missedDaysCount: missedDates.length,
      reason: `Missed ${missedDates.length} scheduled day${missedDates.length === 1 ? '' : 's'} while preserving ${previousStreak}-day streak`,
      status: 'ACTIVE',
      createdAt: nowIso,
    };

    const event: HistoryEvent = {
      id: createId('hist'),
      commitmentId: commitment.id,
      commitmentName: commitment.name,
      date: firstMissed,
      timestamp: nowIso,
      type: 'STREAK_FROZEN',
      streakBefore: previousStreak,
      streakAfter: previousStreak,
      details: `${previousStreak}-day streak frozen after missing ${missedDates.length} scheduled day${missedDates.length === 1 ? '' : 's'}.`,
    };

    await db.transaction('rw', [db.freezeRecords, db.historyEvents], async () => {
      await db.freezeRecords.put(record);
      await db.historyEvents.put(event);
    });

    return record;
  },

  async markFreezeRecovered(commitmentId: string): Promise<void> {
    const active = await this.getActiveFreeze(commitmentId);
    if (!active) return;
    await db.freezeRecords.put({
      ...active,
      status: 'RECOVERED',
    });
  },

  async expireActiveFreeze(commitmentId: string): Promise<void> {
    const active = await this.getActiveFreeze(commitmentId);
    if (!active) return;
    await db.freezeRecords.put({
      ...active,
      status: 'EXPIRED',
    });
  },
};
