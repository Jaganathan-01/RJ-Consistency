export type StrictnessLevel = 'STRICT' | 'NORMAL' | 'FLEXIBLE';

export type CommitmentStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export type ScheduleType = 'daily' | 'custom';

export interface PauseInterval {
  fromDate: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD (inclusive if set, open-ended if currently paused)
}

export interface CommitmentSchedule {
  type: ScheduleType;
  weekdays: number[]; // 0 = Sunday, 1 = Monday ... 6 = Saturday
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export interface FreezeSettings {
  enabled: boolean;
  gracePeriodDays: number;
  maxFrozenDays: number;
  freezeDurationDays: number;
}

export interface RecoverySettings {
  enabled: boolean;
  recoveryDeadlineDays: number;
  recoveryMultiplier: number;
}

export interface Commitment {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  targetDurationMinutes: number;
  minimumDurationMinutes: number;
  schedule: CommitmentSchedule;
  preferredTime: string; // HH:mm
  reminderTime: string; // HH:mm
  reminderEnabled: boolean;
  allowMultipleSessionsPerDay: boolean;
  strictness: StrictnessLevel;
  freezeSettings: FreezeSettings;
  recoverySettings: RecoverySettings;
  status: CommitmentStatus;
  pauseIntervals: PauseInterval[];
  createdAt: string;
  updatedAt: string;
}

export type SessionStatus = 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'STOPPED';
export type CompletionType = 'REGULAR' | 'RECOVERY';

export interface FocusSession {
  id: string;
  commitmentId: string;
  scheduledDate: string; // YYYY-MM-DD
  startedAt: number; // epoch ms
  endTime?: number; // epoch ms
  pausedAt?: number; // epoch ms when paused
  accumulatedPausedDuration: number; // ms
  targetDurationSeconds: number;
  actualDurationSeconds: number;
  sessionStatus: SessionStatus;
  completionType: CompletionType;
  recoveryChallengeId?: string;
}

export type DailyCompletionStatus =
  | 'COMPLETED'
  | 'PARTIAL'
  | 'MISSED'
  | 'FROZEN'
  | 'RECOVERED'
  | 'PAUSED';

export interface DailyCompletion {
  id: string; // `${commitmentId}_${scheduledDate}`
  commitmentId: string;
  scheduledDate: string; // YYYY-MM-DD
  actualDurationMinutes: number;
  actualDurationSeconds: number;
  requiredDurationMinutes: number;
  minimumDurationMinutes: number;
  completionStatus: DailyCompletionStatus;
  completedAt?: string;
  sessionIds: string[];
}

export type StreakStatus =
  | 'ACTIVE'
  | 'AT_RISK'
  | 'FROZEN'
  | 'RECOVERY_REQUIRED'
  | 'PAUSED'
  | 'BROKEN';

export interface StreakRecord {
  id: string; // matches commitmentId
  commitmentId: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletedDays: number;
  missedDays: number;
  frozenDays: number;
  recoveryDays: number;
  scheduledDaysCount: number;
  consistencyPercentage: number;
  lastCompletedDate?: string;
  lastEvaluatedDate?: string;
  streakStatus: StreakStatus;
  updatedAt: string;
}

export type ChallengeStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface RecoveryChallenge {
  id: string;
  commitmentId: string;
  previousStreak: number;
  missedDates: string[];
  requiredDurationMinutes: number;
  actualDurationMinutes: number;
  challengeStatus: ChallengeStatus;
  createdAt: string;
  deadline: string; // YYYY-MM-DD inclusive
  completedAt?: string;
}

export type FreezeStatus = 'ACTIVE' | 'RECOVERED' | 'EXPIRED';

export interface FreezeRecord {
  id: string;
  commitmentId: string;
  frozenFromDate: string;
  frozenUntilDate: string;
  missedDaysCount: number;
  reason: string;
  status: FreezeStatus;
  createdAt: string;
}

export type HistoryEventType =
  | 'SESSION_COMPLETED'
  | 'DAY_COMPLETED'
  | 'DAY_PARTIAL'
  | 'DAY_MISSED'
  | 'STREAK_FROZEN'
  | 'RECOVERY_CREATED'
  | 'RECOVERY_COMPLETED'
  | 'RECOVERY_EXPIRED'
  | 'COMMITMENT_PAUSED'
  | 'COMMITMENT_RESUMED';

export interface HistoryEvent {
  id: string;
  commitmentId: string;
  commitmentName: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO
  type: HistoryEventType;
  durationMinutes?: number;
  streakBefore?: number;
  streakAfter?: number;
  details: string;
}

export interface NotificationSettings {
  enabled: boolean;
  timerCompletionEnabled: boolean;
  recoveryRemindersEnabled: boolean;
  dailySummaryEnabled: boolean;
  dailySummaryTime: string; // HH:mm
}

export interface SoundSettings {
  enabled: boolean;
  vibrationEnabled: boolean;
}

export interface UserSettings {
  id: 'default';
  theme: 'dark' | 'light';
  timezone: string;
  dayResetTime: string; // HH:mm
  defaultStrictness: StrictnessLevel;
  defaultGracePeriodDays: number;
  defaultFreezeDurationDays: number;
  defaultMaxFrozenDays: number;
  defaultRecoveryDeadlineDays: number;
  defaultRecoveryMultiplier: number;
  notificationSettings: NotificationSettings;
  soundSettings: SoundSettings;
  onboardingDismissed?: boolean;
}

export type AppSection =
  | 'dashboard'
  | 'commitments'
  | 'focus'
  | 'streaks'
  | 'recovery'
  | 'analytics'
  | 'history'
  | 'settings';

export type TodayDashboardStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Frozen'
  | 'Recovery Required'
  | 'Paused'
  | 'Rest Day';

export interface BackupPayload {
  app: 'CONSISTENCY';
  schemaVersion: number;
  exportedAt: string;
  data: {
    commitments: Commitment[];
    focusSessions: FocusSession[];
    dailyCompletions: DailyCompletion[];
    streakRecords: StreakRecord[];
    recoveryChallenges: RecoveryChallenge[];
    freezeRecords: FreezeRecord[];
    historyEvents: HistoryEvent[];
    settings: UserSettings[];
  };
}
