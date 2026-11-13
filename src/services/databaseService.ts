import Dexie, { type Table } from 'dexie';
import type {
  Commitment,
  DailyCompletion,
  FocusSession,
  FreezeRecord,
  HistoryEvent,
  RecoveryChallenge,
  StreakRecord,
  UserSettings,
} from '../types/models';
import { getBrowserTimezone } from '../utils/dateUtils';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  id: 'default',
  theme: 'dark',
  timezone: getBrowserTimezone(),
  dayResetTime: '00:00',
  defaultStrictness: 'NORMAL',
  defaultGracePeriodDays: 1,
  defaultFreezeDurationDays: 3,
  defaultMaxFrozenDays: 3,
  defaultRecoveryDeadlineDays: 2,
  defaultRecoveryMultiplier: 1.35,
  notificationSettings: {
    enabled: false,
    timerCompletionEnabled: true,
    recoveryRemindersEnabled: true,
    dailySummaryEnabled: false,
    dailySummaryTime: '20:00',
  },
  soundSettings: {
    enabled: true,
    vibrationEnabled: true,
  },
  onboardingDismissed: false,
};

export class ConsistencyDatabase extends Dexie {
  commitments!: Table<Commitment, string>;
  focusSessions!: Table<FocusSession, string>;
  dailyCompletions!: Table<DailyCompletion, string>;
  streakRecords!: Table<StreakRecord, string>;
  recoveryChallenges!: Table<RecoveryChallenge, string>;
  freezeRecords!: Table<FreezeRecord, string>;
  historyEvents!: Table<HistoryEvent, string>;
  settings!: Table<UserSettings, string>;

  constructor(dbName: string = 'ConsistencyDB') {
    super(dbName);
    this.version(1).stores({
      commitments: 'id, status, category, createdAt',
      focusSessions: 'id, commitmentId, scheduledDate, sessionStatus, startedAt, [commitmentId+scheduledDate]',
      dailyCompletions: 'id, commitmentId, scheduledDate, completionStatus, [commitmentId+scheduledDate]',
      streakRecords: 'id, commitmentId, streakStatus, currentStreak',
      recoveryChallenges: 'id, commitmentId, challengeStatus, deadline, createdAt',
      freezeRecords: 'id, commitmentId, status, frozenFromDate',
      historyEvents: 'id, commitmentId, date, type, timestamp',
      settings: 'id',
    });
  }
}

export const db = new ConsistencyDatabase();

export const databaseService = {
  async ensureSettings(): Promise<UserSettings> {
    const existing = await db.settings.get('default');
    if (existing) return existing;
    const initial: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      timezone: getBrowserTimezone(),
    };
    await db.settings.put(initial);
    return initial;
  },

  async updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.ensureSettings();
    const updated: UserSettings = {
      ...current,
      ...patch,
      id: 'default',
      notificationSettings: {
        ...current.notificationSettings,
        ...(patch.notificationSettings ?? {}),
      },
      soundSettings: {
        ...current.soundSettings,
        ...(patch.soundSettings ?? {}),
      },
    };
    await db.settings.put(updated);
    return updated;
  },

  async clearAllData(): Promise<void> {
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
        db.settings,
      ],
      async () => {
        await db.commitments.clear();
        await db.focusSessions.clear();
        await db.dailyCompletions.clear();
        await db.streakRecords.clear();
        await db.recoveryChallenges.clear();
        await db.freezeRecords.clear();
        await db.historyEvents.clear();
        await db.settings.clear();
      }
    );
    await this.ensureSettings();
  },
};
