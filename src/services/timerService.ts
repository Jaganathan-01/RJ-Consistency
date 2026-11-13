import type { CompletionType, FocusSession } from '../types/models';
import { getLogicalDate } from '../utils/dateUtils';
import { createId } from './commitmentService';
import { db, databaseService } from './databaseService';
import { recoveryEngine } from './recoveryEngine';
import { streakEngine } from './streakEngine';

export interface StartSessionParams {
  commitmentId: string;
  targetDurationMinutes?: number;
  completionType?: CompletionType;
  recoveryChallengeId?: string;
  nowMs?: number;
}

export interface ReconcileTimerResult {
  session: FocusSession;
  elapsedSeconds: number;
  remainingSeconds: number;
  progressRatio: number;
  justCompleted: boolean;
}

export function computeElapsedMs(session: FocusSession, nowMs: number = Date.now()): number {
  if (session.sessionStatus === 'COMPLETED' || session.sessionStatus === 'STOPPED') {
    return session.actualDurationSeconds * 1000;
  }
  if (session.sessionStatus === 'PAUSED' && session.pausedAt !== undefined) {
    return Math.max(0, session.pausedAt - session.startedAt - session.accumulatedPausedDuration);
  }
  return Math.max(0, nowMs - session.startedAt - session.accumulatedPausedDuration);
}

export const timerService = {
  async getActiveSession(): Promise<FocusSession | undefined> {
    const sessions = await db.focusSessions
      .where('sessionStatus')
      .anyOf(['RUNNING', 'PAUSED'])
      .toArray();
    if (sessions.length === 0) return undefined;
    // Return most recent active session
    return sessions.sort((a, b) => b.startedAt - a.startedAt)[0];
  },

  async startSession(params: StartSessionParams): Promise<FocusSession> {
    const nowMs = params.nowMs ?? Date.now();
    const commitment = await db.commitments.get(params.commitmentId);
    if (!commitment) throw new Error('Commitment not found');

    // Guard against multiple simultaneous running/paused sessions
    const existingActive = await this.getActiveSession();
    if (existingActive) {
      throw new Error('An active focus session is already in progress.');
    }

    const settings = await databaseService.ensureSettings();
    const scheduledDate = getLogicalDate(nowMs, settings.timezone, settings.dayResetTime);

    let targetMinutes = params.targetDurationMinutes ?? commitment.targetDurationMinutes;
    if (params.completionType === 'RECOVERY' && params.recoveryChallengeId) {
      const challenge = await db.recoveryChallenges.get(params.recoveryChallengeId);
      if (challenge) {
        targetMinutes = challenge.requiredDurationMinutes;
        await recoveryEngine.markInProgress(challenge.id);
      }
    }

    const session: FocusSession = {
      id: createId('ses'),
      commitmentId: commitment.id,
      scheduledDate,
      startedAt: nowMs,
      accumulatedPausedDuration: 0,
      targetDurationSeconds: Math.max(60, Math.round(targetMinutes * 60)),
      actualDurationSeconds: 0,
      sessionStatus: 'RUNNING',
      completionType: params.completionType ?? 'REGULAR',
      recoveryChallengeId: params.recoveryChallengeId,
    };

    await db.focusSessions.put(session);
    return session;
  },

  async pauseSession(sessionId: string, nowMs: number = Date.now()): Promise<FocusSession> {
    const session = await db.focusSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.sessionStatus !== 'RUNNING') return session;

    const elapsedSeconds = Math.floor(computeElapsedMs(session, nowMs) / 1000);
    const updated: FocusSession = {
      ...session,
      pausedAt: nowMs,
      actualDurationSeconds: elapsedSeconds,
      sessionStatus: 'PAUSED',
    };
    await db.focusSessions.put(updated);
    return updated;
  },

  async resumeSession(sessionId: string, nowMs: number = Date.now()): Promise<FocusSession> {
    const session = await db.focusSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.sessionStatus !== 'PAUSED' || session.pausedAt === undefined) return session;

    const pausedDelta = Math.max(0, nowMs - session.pausedAt);
    const updated: FocusSession = {
      ...session,
      pausedAt: undefined,
      accumulatedPausedDuration: session.accumulatedPausedDuration + pausedDelta,
      sessionStatus: 'RUNNING',
    };
    await db.focusSessions.put(updated);
    return updated;
  },

  /**
   * Stops a session early. Counts actual elapsed time only if valid (>= 60 seconds
   * or meeting flexible minimum), and never marks a recovery challenge complete unless
   * target duration was met.
   */
  async stopSession(
    sessionId: string,
    nowMs: number = Date.now(),
    savePartialProgress: boolean = true
  ): Promise<FocusSession> {
    const session = await db.focusSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.sessionStatus === 'COMPLETED' || session.sessionStatus === 'STOPPED') {
      return session;
    }

    const elapsedSeconds = Math.floor(computeElapsedMs(session, nowMs) / 1000);
    const reachedTarget = elapsedSeconds >= session.targetDurationSeconds;

    if (reachedTarget) {
      const { session: completed } = await this.completeSession(sessionId, nowMs);
      return completed;
    }

    const stopped: FocusSession = {
      ...session,
      endTime: nowMs,
      pausedAt: undefined,
      actualDurationSeconds: elapsedSeconds,
      sessionStatus: 'STOPPED',
    };

    await db.focusSessions.put(stopped);

    if (savePartialProgress && elapsedSeconds >= 60 && session.completionType === 'REGULAR') {
      await streakEngine.recordSessionCompletion({
        commitmentId: session.commitmentId,
        scheduledDate: session.scheduledDate,
        sessionId: session.id,
        actualDurationSeconds: elapsedSeconds,
        completionType: 'REGULAR',
      });
    }

    return stopped;
  },

  /**
   * Idempotently marks a session COMPLETED and updates DailyCompletion + StreakRecord once.
   */
  async completeSession(
    sessionId: string,
    nowMs: number = Date.now()
  ): Promise<{ session: FocusSession; justCompleted: boolean }> {
    let justCompleted = false;
    let finalSession!: FocusSession;

    await db.transaction('rw', [db.focusSessions], async () => {
      const session = await db.focusSessions.get(sessionId);
      if (!session) throw new Error('Session not found');

      if (session.sessionStatus === 'COMPLETED') {
        finalSession = session;
        justCompleted = false;
        return;
      }

      const elapsedSeconds = Math.max(
        session.targetDurationSeconds,
        Math.floor(computeElapsedMs(session, nowMs) / 1000)
      );

      finalSession = {
        ...session,
        endTime: nowMs,
        pausedAt: undefined,
        actualDurationSeconds: elapsedSeconds,
        sessionStatus: 'COMPLETED',
      };
      await db.focusSessions.put(finalSession);
      justCompleted = true;
    });

    if (justCompleted) {
      await streakEngine.recordSessionCompletion({
        commitmentId: finalSession.commitmentId,
        scheduledDate: finalSession.scheduledDate,
        sessionId: finalSession.id,
        actualDurationSeconds: finalSession.actualDurationSeconds,
        completionType: finalSession.completionType,
        recoveryChallengeId: finalSession.recoveryChallengeId,
      });
    }

    return { session: finalSession, justCompleted };
  },

  /**
   * Called on app startup/resume and every tick. Uses wall-clock timestamps
   * so app restarts or mobile background suspension recover accurately.
   */
  async reconcileActiveSession(nowMs: number = Date.now()): Promise<ReconcileTimerResult | null> {
    const active = await this.getActiveSession();
    if (!active) return null;

    const elapsedSeconds = Math.floor(computeElapsedMs(active, nowMs) / 1000);
    const remainingSeconds = Math.max(0, active.targetDurationSeconds - elapsedSeconds);
    const progressRatio = Math.min(1, elapsedSeconds / Math.max(1, active.targetDurationSeconds));

    if (active.sessionStatus === 'RUNNING' && elapsedSeconds >= active.targetDurationSeconds) {
      const { session, justCompleted } = await this.completeSession(active.id, nowMs);
      return {
        session,
        elapsedSeconds: session.actualDurationSeconds,
        remainingSeconds: 0,
        progressRatio: 1,
        justCompleted,
      };
    }

    return {
      session: active,
      elapsedSeconds,
      remainingSeconds,
      progressRatio,
      justCompleted: false,
    };
  },
};
