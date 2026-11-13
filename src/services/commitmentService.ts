import type {
  Commitment,
  CommitmentSchedule,
  FreezeSettings,
  HistoryEvent,
  RecoverySettings,
  StreakRecord,
  StrictnessLevel,
} from '../types/models';
import { getLogicalDate } from '../utils/dateUtils';
import { db, databaseService } from './databaseService';

export interface CreateCommitmentInput {
  name: string;
  description?: string;
  category: string;
  icon: string;
  color: string;
  targetDurationMinutes: number;
  minimumDurationMinutes: number;
  schedule: CommitmentSchedule;
  preferredTime?: string;
  reminderTime?: string;
  reminderEnabled?: boolean;
  allowMultipleSessionsPerDay?: boolean;
  strictness: StrictnessLevel;
  freezeSettings?: Partial<FreezeSettings>;
  recoverySettings?: Partial<RecoverySettings>;
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const SAMPLE_COMMITMENT_TEMPLATES: Omit<CreateCommitmentInput, 'schedule'>[] = [
  {
    name: 'Meditation',
    description: 'Uninterrupted breath awareness and stillness before starting the day.',
    category: 'Mindfulness',
    icon: 'Brain',
    color: '#10B981',
    targetDurationMinutes: 15,
    minimumDurationMinutes: 10,
    preferredTime: '07:00',
    reminderTime: '06:50',
    reminderEnabled: true,
    allowMultipleSessionsPerDay: false,
    strictness: 'STRICT',
  },
  {
    name: 'DSA Practice',
    description: 'Deep problem solving on data structures, algorithms, and complexity analysis.',
    category: 'Engineering',
    icon: 'Code2',
    color: '#3B82F6',
    targetDurationMinutes: 60,
    minimumDurationMinutes: 30,
    preferredTime: '09:00',
    reminderTime: '08:50',
    reminderEnabled: true,
    allowMultipleSessionsPerDay: true,
    strictness: 'NORMAL',
  },
  {
    name: 'English Practice',
    description: 'Active speaking drills, pronunciation, and structured articulation.',
    category: 'Communication',
    icon: 'Mic',
    color: '#8B5CF6',
    targetDurationMinutes: 20,
    minimumDurationMinutes: 10,
    preferredTime: '18:00',
    reminderTime: '17:50',
    reminderEnabled: true,
    allowMultipleSessionsPerDay: true,
    strictness: 'FLEXIBLE',
  },
  {
    name: 'Reading',
    description: 'Focused non-fiction or technical reading without phone distractions.',
    category: 'Learning',
    icon: 'BookOpen',
    color: '#F59E0B',
    targetDurationMinutes: 20,
    minimumDurationMinutes: 10,
    preferredTime: '21:00',
    reminderTime: '20:50',
    reminderEnabled: true,
    allowMultipleSessionsPerDay: true,
    strictness: 'NORMAL',
  },
  {
    name: 'Exercise',
    description: 'Strength conditioning, mobility, or cardio endurance session.',
    category: 'Health',
    icon: 'Dumbbell',
    color: '#EF4444',
    targetDurationMinutes: 30,
    minimumDurationMinutes: 15,
    preferredTime: '17:00',
    reminderTime: '16:45',
    reminderEnabled: true,
    allowMultipleSessionsPerDay: false,
    strictness: 'NORMAL',
  },
];

export const commitmentService = {
  async listAll(): Promise<Commitment[]> {
    return db.commitments.orderBy('createdAt').toArray();
  },

  async getById(id: string): Promise<Commitment | undefined> {
    return db.commitments.get(id);
  },

  async create(input: CreateCommitmentInput): Promise<Commitment> {
    const settings = await databaseService.ensureSettings();
    const now = new Date().toISOString();
    const id = createId('cmt');

    const commitment: Commitment = {
      id,
      name: input.name.trim(),
      description: (input.description ?? '').trim(),
      category: input.category.trim() || 'General',
      icon: input.icon || 'Target',
      color: input.color || '#10B981',
      targetDurationMinutes: Math.max(1, Math.round(input.targetDurationMinutes)),
      minimumDurationMinutes: Math.max(
        1,
        Math.min(
          Math.round(input.targetDurationMinutes),
          Math.round(input.minimumDurationMinutes || input.targetDurationMinutes)
        )
      ),
      schedule: {
        type: input.schedule.type,
        weekdays:
          input.schedule.type === 'daily'
            ? [0, 1, 2, 3, 4, 5, 6]
            : Array.from(new Set(input.schedule.weekdays)).sort((a, b) => a - b),
        startDate:
          input.schedule.startDate ||
          getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime),
        endDate: input.schedule.endDate || undefined,
      },
      preferredTime: input.preferredTime || '08:00',
      reminderTime: input.reminderTime || '',
      reminderEnabled: Boolean(input.reminderEnabled),
      allowMultipleSessionsPerDay: input.allowMultipleSessionsPerDay ?? true,
      strictness: input.strictness,
      freezeSettings: {
        enabled: input.freezeSettings?.enabled ?? true,
        gracePeriodDays:
          input.freezeSettings?.gracePeriodDays ??
          (input.strictness === 'STRICT' ? 0 : settings.defaultGracePeriodDays),
        maxFrozenDays: input.freezeSettings?.maxFrozenDays ?? settings.defaultMaxFrozenDays,
        freezeDurationDays:
          input.freezeSettings?.freezeDurationDays ?? settings.defaultFreezeDurationDays,
      },
      recoverySettings: {
        enabled: input.recoverySettings?.enabled ?? true,
        recoveryDeadlineDays:
          input.recoverySettings?.recoveryDeadlineDays ?? settings.defaultRecoveryDeadlineDays,
        recoveryMultiplier:
          input.recoverySettings?.recoveryMultiplier ?? settings.defaultRecoveryMultiplier,
      },
      status: 'ACTIVE',
      pauseIntervals: [],
      createdAt: now,
      updatedAt: now,
    };

    const initialStreak: StreakRecord = {
      id,
      commitmentId: id,
      currentStreak: 0,
      longestStreak: 0,
      totalCompletedDays: 0,
      missedDays: 0,
      frozenDays: 0,
      recoveryDays: 0,
      scheduledDaysCount: 0,
      consistencyPercentage: 0,
      streakStatus: 'ACTIVE',
      updatedAt: now,
    };

    await db.transaction('rw', [db.commitments, db.streakRecords], async () => {
      await db.commitments.put(commitment);
      await db.streakRecords.put(initialStreak);
    });

    return commitment;
  },

  async update(id: string, patch: Partial<Commitment>): Promise<Commitment> {
    const existing = await db.commitments.get(id);
    if (!existing) throw new Error('Commitment not found');

    const nextTarget = patch.targetDurationMinutes ?? existing.targetDurationMinutes;
    const nextMin = Math.min(
      nextTarget,
      patch.minimumDurationMinutes ?? existing.minimumDurationMinutes
    );

    const updated: Commitment = {
      ...existing,
      ...patch,
      id,
      targetDurationMinutes: Math.max(1, Math.round(nextTarget)),
      minimumDurationMinutes: Math.max(1, Math.round(nextMin)),
      schedule: patch.schedule ? { ...existing.schedule, ...patch.schedule } : existing.schedule,
      freezeSettings: patch.freezeSettings
        ? { ...existing.freezeSettings, ...patch.freezeSettings }
        : existing.freezeSettings,
      recoverySettings: patch.recoverySettings
        ? { ...existing.recoverySettings, ...patch.recoverySettings }
        : existing.recoverySettings,
      updatedAt: new Date().toISOString(),
    };

    await db.commitments.put(updated);
    return updated;
  },

  async pause(id: string, logicalDateStr?: string): Promise<Commitment> {
    const existing = await db.commitments.get(id);
    if (!existing) throw new Error('Commitment not found');
    if (existing.status === 'PAUSED') return existing;

    const settings = await databaseService.ensureSettings();
    const todayStr =
      logicalDateStr ?? getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime);
    const nowIso = new Date().toISOString();

    const updated: Commitment = {
      ...existing,
      status: 'PAUSED',
      pauseIntervals: [...(existing.pauseIntervals ?? []), { fromDate: todayStr }],
      updatedAt: nowIso,
    };

    const history: HistoryEvent = {
      id: createId('hist'),
      commitmentId: id,
      commitmentName: existing.name,
      date: todayStr,
      timestamp: nowIso,
      type: 'COMMITMENT_PAUSED',
      details: `Paused commitment from ${todayStr}. Streak preserved.`,
    };

    await db.transaction('rw', [db.commitments, db.streakRecords, db.historyEvents], async () => {
      await db.commitments.put(updated);
      const streak = await db.streakRecords.get(id);
      if (streak) {
        await db.streakRecords.put({
          ...streak,
          streakStatus: 'PAUSED',
          updatedAt: nowIso,
        });
      }
      await db.historyEvents.put(history);
    });

    return updated;
  },

  async resume(id: string, logicalDateStr?: string): Promise<Commitment> {
    const existing = await db.commitments.get(id);
    if (!existing) throw new Error('Commitment not found');

    const settings = await databaseService.ensureSettings();
    const todayStr =
      logicalDateStr ?? getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime);
    const nowIso = new Date().toISOString();

    const nextIntervals = (existing.pauseIntervals ?? []).map((interval, idx, arr) => {
      if (idx === arr.length - 1 && !interval.toDate) {
        // Closed up to yesterday if resumed today so today becomes scheduled again
        return { ...interval, toDate: todayStr > interval.fromDate ? todayStr : interval.fromDate };
      }
      return interval;
    });

    // If resumed on a later day than paused, ensure today is NOT inside pauseIntervals
    const cleanedIntervals = nextIntervals.map((interval) => {
      if (interval.toDate === todayStr && todayStr > interval.fromDate) {
        const d = new Date(`${todayStr}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return { ...interval, toDate: d.toISOString().slice(0, 10) };
      }
      return interval;
    });

    const updated: Commitment = {
      ...existing,
      status: 'ACTIVE',
      pauseIntervals: existing.status === 'PAUSED' ? cleanedIntervals : existing.pauseIntervals,
      updatedAt: nowIso,
    };

    const history: HistoryEvent = {
      id: createId('hist'),
      commitmentId: id,
      commitmentName: existing.name,
      date: todayStr,
      timestamp: nowIso,
      type: 'COMMITMENT_RESUMED',
      details: `Resumed commitment on ${todayStr}.`,
    };

    await db.transaction('rw', [db.commitments, db.historyEvents], async () => {
      await db.commitments.put(updated);
      await db.historyEvents.put(history);
    });

    return updated;
  },

  async archive(id: string): Promise<Commitment> {
    return this.update(id, { status: 'ARCHIVED' });
  },

  async unarchive(id: string): Promise<Commitment> {
    return this.update(id, { status: 'ACTIVE' });
  },

  async delete(id: string): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.commitments,
        db.focusSessions,
        db.dailyCompletions,
        db.streakRecords,
        db.recoveryChallenges,
        db.freezeRecords,
        db.historyEvents,
      ],
      async () => {
        await db.commitments.delete(id);
        await db.focusSessions.where('commitmentId').equals(id).delete();
        await db.dailyCompletions.where('commitmentId').equals(id).delete();
        await db.streakRecords.delete(id);
        await db.recoveryChallenges.where('commitmentId').equals(id).delete();
        await db.freezeRecords.where('commitmentId').equals(id).delete();
        await db.historyEvents.where('commitmentId').equals(id).delete();
      }
    );
  },

  async importSampleCommitments(): Promise<Commitment[]> {
    const settings = await databaseService.ensureSettings();
    const todayStr = getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime);
    const existing = await db.commitments.toArray();
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

    const created: Commitment[] = [];
    for (const tpl of SAMPLE_COMMITMENT_TEMPLATES) {
      if (existingNames.has(tpl.name.toLowerCase())) continue;
      const item = await this.create({
        ...tpl,
        schedule: {
          type: 'daily',
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startDate: todayStr,
        },
      });
      created.push(item);
    }
    return created;
  },
};
