import { create } from 'zustand';
import {
  commitmentService,
  type CreateCommitmentInput,
} from '../services/commitmentService';
import { databaseService, db, DEFAULT_USER_SETTINGS } from '../services/databaseService';
import { notificationService } from '../services/notificationService';
import { timerService } from '../services/timerService';
import { streakEngine } from '../services/streakEngine';
import type {
  AppSection,
  Commitment,
  CompletionType,
  DailyCompletion,
  FocusSession,
  FreezeRecord,
  HistoryEvent,
  RecoveryChallenge,
  StreakRecord,
  UserSettings,
} from '../types/models';
import { getLogicalDate } from '../utils/dateUtils';

export interface CompletedSessionBanner {
  session: FocusSession;
  commitment: Commitment;
  actualMinutes: number;
  isRecovery: boolean;
  newStreak: number;
}

interface AppState {
  initialized: boolean;
  isLoading: boolean;
  activeSection: AppSection;
  todayDateStr: string;
  settings: UserSettings;
  commitments: Commitment[];
  dailyCompletions: DailyCompletion[];
  streakRecords: StreakRecord[];
  recoveryChallenges: RecoveryChallenge[];
  freezeRecords: FreezeRecord[];
  historyEvents: HistoryEvent[];
  focusSessions: FocusSession[];

  // Active Timer State
  activeSession: FocusSession | null;
  elapsedSeconds: number;
  remainingSeconds: number;
  progressRatio: number;
  selectedFocusCommitmentId: string | null;
  completedBanner: CompletedSessionBanner | null;
  toastMessage: string | null;

  // Actions
  setActiveSection: (section: AppSection) => void;
  setSelectedFocusCommitmentId: (id: string | null) => void;
  dismissCompletedBanner: () => void;
  showToast: (msg: string) => void;
  clearToast: () => void;

  initializeApp: () => Promise<void>;
  refreshAllData: () => Promise<void>;
  tickTimer: () => Promise<void>;

  createCommitment: (input: CreateCommitmentInput) => Promise<Commitment>;
  updateCommitment: (id: string, patch: Partial<Commitment>) => Promise<void>;
  pauseCommitment: (id: string) => Promise<void>;
  resumeCommitment: (id: string) => Promise<void>;
  archiveCommitment: (id: string) => Promise<void>;
  unarchiveCommitment: (id: string) => Promise<void>;
  deleteCommitment: (id: string) => Promise<void>;
  importSamples: () => Promise<number>;

  startFocusSession: (params: {
    commitmentId: string;
    targetDurationMinutes?: number;
    completionType?: CompletionType;
    recoveryChallengeId?: string;
  }) => Promise<void>;
  pauseFocusSession: () => Promise<void>;
  resumeFocusSession: () => Promise<void>;
  stopFocusSession: (savePartial?: boolean) => Promise<void>;

  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
}

function applyThemeToDocument(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#0B0F17' : '#F8FAFC');
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  isLoading: true,
  activeSection: 'dashboard',
  todayDateStr: getLogicalDate(Date.now()),
  settings: DEFAULT_USER_SETTINGS,
  commitments: [],
  dailyCompletions: [],
  streakRecords: [],
  recoveryChallenges: [],
  freezeRecords: [],
  historyEvents: [],
  focusSessions: [],

  activeSession: null,
  elapsedSeconds: 0,
  remainingSeconds: 0,
  progressRatio: 0,
  selectedFocusCommitmentId: null,
  completedBanner: null,
  toastMessage: null,

  setActiveSection: (section) => set({ activeSection: section }),
  setSelectedFocusCommitmentId: (id) => set({ selectedFocusCommitmentId: id }),
  dismissCompletedBanner: () => set({ completedBanner: null }),
  showToast: (msg) => set({ toastMessage: msg }),
  clearToast: () => set({ toastMessage: null }),

  initializeApp: async () => {
    set({ isLoading: true });
    try {
      const settings = await databaseService.ensureSettings();
      applyThemeToDocument(settings.theme);
      const todayDateStr = getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime);

      // Reconcile any active timer session first (in case target was reached while closed)
      const timerRes = await timerService.reconcileActiveSession(Date.now());
      await streakEngine.reconcileAll(todayDateStr);

      await get().refreshAllData();

      if (timerRes && timerRes.justCompleted) {
        const commitment = get().commitments.find((c) => c.id === timerRes.session.commitmentId);
        const streak = get().streakRecords.find((s) => s.commitmentId === timerRes.session.commitmentId);
        if (commitment) {
          notificationService.playCompletionTone(
            settings.soundSettings.enabled,
            settings.soundSettings.vibrationEnabled
          );
          set({
            completedBanner: {
              session: timerRes.session,
              commitment,
              actualMinutes: Math.max(1, Math.round(timerRes.session.actualDurationSeconds / 60)),
              isRecovery: timerRes.session.completionType === 'RECOVERY',
              newStreak: streak?.currentStreak ?? 1,
            },
          });
        }
      }

      set({ initialized: true, isLoading: false, todayDateStr });
    } catch (err) {
      console.error('Failed to initialize app:', err);
      set({ initialized: true, isLoading: false });
    }
  },

  refreshAllData: async () => {
    const settings = await databaseService.ensureSettings();
    applyThemeToDocument(settings.theme);
    const todayDateStr = getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime);

    const [
      commitments,
      dailyCompletions,
      streakRecords,
      recoveryChallenges,
      freezeRecords,
      historyEvents,
      focusSessions,
      activeTimer,
    ] = await Promise.all([
      db.commitments.orderBy('createdAt').toArray(),
      db.dailyCompletions.toArray(),
      db.streakRecords.toArray(),
      db.recoveryChallenges.orderBy('createdAt').reverse().toArray(),
      db.freezeRecords.toArray(),
      db.historyEvents.orderBy('timestamp').reverse().toArray(),
      db.focusSessions.orderBy('startedAt').reverse().toArray(),
      timerService.reconcileActiveSession(Date.now()),
    ]);

    set({
      settings,
      todayDateStr,
      commitments,
      dailyCompletions,
      streakRecords,
      recoveryChallenges,
      freezeRecords,
      historyEvents,
      focusSessions,
      activeSession:
        activeTimer && !activeTimer.justCompleted ? activeTimer.session : null,
      elapsedSeconds: activeTimer && !activeTimer.justCompleted ? activeTimer.elapsedSeconds : 0,
      remainingSeconds:
        activeTimer && !activeTimer.justCompleted ? activeTimer.remainingSeconds : 0,
      progressRatio: activeTimer && !activeTimer.justCompleted ? activeTimer.progressRatio : 0,
    });

    // Check foreground reminders safely
    const completedIdsToday = new Set(
      dailyCompletions
        .filter(
          (d) =>
            d.scheduledDate === todayDateStr &&
            (d.completionStatus === 'COMPLETED' || d.completionStatus === 'RECOVERED')
        )
        .map((d) => d.commitmentId)
    );
    const activeChallenges = recoveryChallenges.filter(
      (r) => r.challengeStatus === 'PENDING' || r.challengeStatus === 'IN_PROGRESS'
    );
    await notificationService.checkScheduledReminders({
      settings,
      todayDateStr,
      commitments,
      completedIdsToday,
      activeChallenges,
    });
  },

  tickTimer: async () => {
    const { activeSession, settings, todayDateStr } = get();
    const currentLogicalToday = getLogicalDate(Date.now(), settings.timezone, settings.dayResetTime);
    if (currentLogicalToday !== todayDateStr) {
      await streakEngine.reconcileAll(currentLogicalToday);
      await get().refreshAllData();
    }

    if (!activeSession) return;

    const result = await timerService.reconcileActiveSession(Date.now());
    if (!result) {
      set({ activeSession: null, elapsedSeconds: 0, remainingSeconds: 0, progressRatio: 0 });
      return;
    }

    if (result.justCompleted) {
      await get().refreshAllData();
      const commitment = get().commitments.find((c) => c.id === result.session.commitmentId);
      const streak = get().streakRecords.find((s) => s.commitmentId === result.session.commitmentId);

      notificationService.playCompletionTone(
        settings.soundSettings.enabled,
        settings.soundSettings.vibrationEnabled
      );

      if (settings.notificationSettings.enabled && settings.notificationSettings.timerCompletionEnabled) {
        await notificationService.showNotification(
          `${commitment?.name ?? 'Focus Session'} Completed`,
          `Logged ${Math.round(result.session.actualDurationSeconds / 60)} minutes. Streak: ${streak?.currentStreak ?? 1} days.`,
          `complete_${result.session.id}`
        );
      }

      if (commitment) {
        set({
          activeSession: null,
          elapsedSeconds: 0,
          remainingSeconds: 0,
          progressRatio: 0,
          completedBanner: {
            session: result.session,
            commitment,
            actualMinutes: Math.max(1, Math.round(result.session.actualDurationSeconds / 60)),
            isRecovery: result.session.completionType === 'RECOVERY',
            newStreak: streak?.currentStreak ?? 1,
          },
        });
      }
      return;
    }

    set({
      activeSession: result.session,
      elapsedSeconds: result.elapsedSeconds,
      remainingSeconds: result.remainingSeconds,
      progressRatio: result.progressRatio,
    });
  },

  createCommitment: async (input) => {
    const created = await commitmentService.create(input);
    await streakEngine.reconcileCommitment(created.id, get().todayDateStr);
    await get().refreshAllData();
    return created;
  },

  updateCommitment: async (id, patch) => {
    await commitmentService.update(id, patch);
    await streakEngine.reconcileCommitment(id, get().todayDateStr);
    await get().refreshAllData();
  },

  pauseCommitment: async (id) => {
    await commitmentService.pause(id, get().todayDateStr);
    await streakEngine.reconcileCommitment(id, get().todayDateStr);
    await get().refreshAllData();
  },

  resumeCommitment: async (id) => {
    await commitmentService.resume(id, get().todayDateStr);
    await streakEngine.reconcileCommitment(id, get().todayDateStr);
    await get().refreshAllData();
  },

  archiveCommitment: async (id) => {
    await commitmentService.archive(id);
    await get().refreshAllData();
  },

  unarchiveCommitment: async (id) => {
    await commitmentService.unarchive(id);
    await streakEngine.reconcileCommitment(id, get().todayDateStr);
    await get().refreshAllData();
  },

  deleteCommitment: async (id) => {
    const active = get().activeSession;
    if (active && active.commitmentId === id) {
      await timerService.stopSession(active.id, Date.now(), false);
    }
    await commitmentService.delete(id);
    await get().refreshAllData();
  },

  importSamples: async () => {
    const created = await commitmentService.importSampleCommitments();
    await streakEngine.reconcileAll(get().todayDateStr);
    await get().refreshAllData();
    return created.length;
  },

  startFocusSession: async (params) => {
    const session = await timerService.startSession(params);
    set({
      activeSession: session,
      selectedFocusCommitmentId: params.commitmentId,
      elapsedSeconds: 0,
      remainingSeconds: session.targetDurationSeconds,
      progressRatio: 0,
      activeSection: 'focus',
    });
    await get().refreshAllData();
  },

  pauseFocusSession: async () => {
    const active = get().activeSession;
    if (!active) return;
    const updated = await timerService.pauseSession(active.id, Date.now());
    set({ activeSession: updated });
    await get().refreshAllData();
  },

  resumeFocusSession: async () => {
    const active = get().activeSession;
    if (!active) return;
    const updated = await timerService.resumeSession(active.id, Date.now());
    set({ activeSession: updated });
    await get().refreshAllData();
  },

  stopFocusSession: async (savePartial = true) => {
    const active = get().activeSession;
    if (!active) return;
    const stopped = await timerService.stopSession(active.id, Date.now(), savePartial);
    set({
      activeSession: null,
      elapsedSeconds: 0,
      remainingSeconds: 0,
      progressRatio: 0,
    });
    await get().refreshAllData();
    if (stopped.sessionStatus === 'COMPLETED') {
      const commitment = get().commitments.find((c) => c.id === stopped.commitmentId);
      const streak = get().streakRecords.find((s) => s.commitmentId === stopped.commitmentId);
      if (commitment) {
        set({
          completedBanner: {
            session: stopped,
            commitment,
            actualMinutes: Math.max(1, Math.round(stopped.actualDurationSeconds / 60)),
            isRecovery: stopped.completionType === 'RECOVERY',
            newStreak: streak?.currentStreak ?? 1,
          },
        });
      }
    } else if (savePartial && stopped.actualDurationSeconds >= 60) {
      set({
        toastMessage: `Saved ${Math.round(stopped.actualDurationSeconds / 60)}m of partial focus progress.`,
      });
    } else {
      set({ toastMessage: 'Session stopped (under 1 minute, not logged).' });
    }
  },

  updateSettings: async (patch) => {
    const updated = await databaseService.updateSettings(patch);
    applyThemeToDocument(updated.theme);
    const nextToday = getLogicalDate(Date.now(), updated.timezone, updated.dayResetTime);
    await streakEngine.reconcileAll(nextToday);
    await get().refreshAllData();
  },
}));
