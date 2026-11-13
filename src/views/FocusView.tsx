import { Info, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';
import { CommitmentIcon } from '../components/CommitmentIcon';
import { Button } from '../components/ui/button';
import { useAppStore } from '../store/useAppStore';
import { formatSecondsClock } from '../utils/dateUtils';

export function FocusView() {
  const {
    commitments,
    recoveryChallenges,
    focusSessions,
    todayDateStr,
    activeSession,
    elapsedSeconds,
    remainingSeconds,
    progressRatio,
    selectedFocusCommitmentId,
    setSelectedFocusCommitmentId,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    stopFocusSession,
  } = useAppStore();

  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const activeCommitments = commitments.filter((c) => c.status === 'ACTIVE');
  const activeChallenges = recoveryChallenges.filter(
    (r) => r.challengeStatus === 'PENDING' || r.challengeStatus === 'IN_PROGRESS'
  );

  const currentCommitmentId =
    activeSession?.commitmentId ??
    selectedFocusCommitmentId ??
    activeCommitments[0]?.id ??
    null;

  const selectedCommitment = commitments.find((c) => c.id === currentCommitmentId);
  const matchingChallenge = activeChallenges.find(
    (r) => r.commitmentId === currentCommitmentId
  );

  const targetSeconds = activeSession
    ? activeSession.targetDurationSeconds
    : (matchingChallenge?.requiredDurationMinutes ??
        selectedCommitment?.targetDurationMinutes ??
        20) * 60;

  const displayRemaining = activeSession ? remainingSeconds : targetSeconds;
  const displayElapsed = activeSession ? elapsedSeconds : 0;
  const displayRatio = activeSession ? progressRatio : 0;

  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - displayRatio);

  const todaysSessions = focusSessions.filter((s) => s.scheduledDate === todayDateStr);

  const handleStartRegular = async () => {
    if (!selectedCommitment) return;
    await startFocusSession({
      commitmentId: selectedCommitment.id,
      targetDurationMinutes: selectedCommitment.targetDurationMinutes,
      completionType: 'REGULAR',
    });
  };

  const handleStartRecovery = async () => {
    if (!selectedCommitment || !matchingChallenge) return;
    await startFocusSession({
      commitmentId: selectedCommitment.id,
      targetDurationMinutes: matchingChallenge.requiredDurationMinutes,
      completionType: 'RECOVERY',
      recoveryChallengeId: matchingChallenge.id,
    });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Focus Sessions</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Timestamp-backed focus timer persisted continuously in IndexedDB.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Main Timer Card */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-[#121826] flex flex-col items-center">
          {/* Commitment Selector (when no active session) */}
          {!activeSession ? (
            <div className="w-full max-w-sm mb-6">
              <label
                htmlFor="focus-commitment-select"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"
              >
                Select Active Commitment
              </label>
              <select
                id="focus-commitment-select"
                value={currentCommitmentId ?? ''}
                onChange={(e) => setSelectedFocusCommitmentId(e.target.value)}
                disabled={activeCommitments.length === 0}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                {activeCommitments.length === 0 ? (
                  <option value="">No active commitments available</option>
                ) : (
                  activeCommitments.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.targetDurationMinutes} min · {c.strictness})
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-3 mb-6">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `${selectedCommitment?.color ?? '#10B981'}1A`,
                  color: selectedCommitment?.color ?? '#10B981',
                }}
              >
                <CommitmentIcon name={selectedCommitment?.icon ?? 'Target'} className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold">
                  {selectedCommitment?.name ?? 'Focus Session'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {activeSession.completionType === 'RECOVERY'
                    ? 'Recovery Challenge Mode'
                    : 'Daily Commitment Focus'}
                </div>
              </div>
            </div>
          )}

          {/* Circular Countdown */}
          <div className="relative h-64 w-64 flex items-center justify-center">
            <svg className="h-64 w-64 -rotate-90" viewBox="0 0 256 256">
              <circle
                cx="128"
                cy="128"
                r={radius}
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                className="text-slate-200 dark:text-slate-800"
              />
              <circle
                cx="128"
                cy="128"
                r={radius}
                stroke={
                  activeSession?.completionType === 'RECOVERY'
                    ? '#F59E0B'
                    : selectedCommitment?.color ?? '#10B981'
                }
                strokeWidth="12"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeOffset}
                className="transition-[stroke-dashoffset] duration-300"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {activeSession?.sessionStatus === 'PAUSED'
                  ? 'Paused'
                  : activeSession
                    ? 'Remaining'
                    : 'Target'}
              </span>
              <span className="mt-1 font-mono text-4xl sm:text-5xl font-bold tracking-tight tabular-nums">
                {formatSecondsClock(displayRemaining)}
              </span>
              <span className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Elapsed {formatSecondsClock(displayElapsed)} · Goal{' '}
                {Math.round(targetSeconds / 60)}m
              </span>
            </div>
          </div>

          {/* Recovery Notice if applicable */}
          {matchingChallenge && !activeSession && (
            <div className="mt-5 w-full max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-center">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Recovery Challenge Available
              </div>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                Complete a {matchingChallenge.requiredDurationMinutes}-minute recovery session to
                restore your {matchingChallenge.previousStreak}-day streak.
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 w-full">
            {!activeSession ? (
              <>
                {matchingChallenge ? (
                  <Button size="lg" onClick={() => void handleStartRecovery()}>
                    <RotateCcw className="h-4 w-4" />
                    <span>Start {matchingChallenge.requiredDurationMinutes}m Recovery</span>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    disabled={!selectedCommitment}
                    onClick={() => void handleStartRegular()}
                  >
                    <Play className="h-4 w-4" />
                    <span>Start Session</span>
                  </Button>
                )}
              </>
            ) : (
              <>
                {activeSession.sessionStatus === 'RUNNING' ? (
                  <Button size="lg" variant="secondary" onClick={() => void pauseFocusSession()}>
                    <Pause className="h-4 w-4" />
                    <span>Pause</span>
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => void resumeFocusSession()}>
                    <Play className="h-4 w-4" />
                    <span>Resume</span>
                  </Button>
                )}

                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => void stopFocusSession(true)}
                >
                  <Square className="h-4 w-4" />
                  <span>Stop &amp; Save</span>
                </Button>

                {!confirmDiscard ? (
                  <Button
                    size="lg"
                    variant="ghost"
                    className="text-red-600 dark:text-red-400"
                    onClick={() => setConfirmDiscard(true)}
                  >
                    Discard
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="destructive"
                    onClick={() => {
                      setConfirmDiscard(false);
                      void stopFocusSession(false);
                    }}
                  >
                    Confirm Discard
                  </Button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Right Column: PWA Reliability Note & Today's Sessions */}
        <section className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826]">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h2 className="text-sm font-semibold">Timestamp Recovery &amp; PWA Behavior</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Elapsed time is calculated from wall-clock timestamps (startedAt, pausedAt, and
                  accumulatedPausedDuration) stored in IndexedDB—never from interval ticks alone. If
                  Android suspends the browser or you close the tab, reopening reconciles exact
                  elapsed time and completes the session once without duplicate streak counting.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826]">
            <h2 className="text-sm font-semibold mb-3">Today&apos;s Sessions</h2>
            {todaysSessions.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No focus sessions recorded today yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {todaysSessions.map((ses) => {
                  const c = commitments.find((item) => item.id === ses.commitmentId);
                  return (
                    <li key={ses.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {c?.name ?? 'Deleted Commitment'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {ses.sessionStatus} · {ses.completionType}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums">
                        {formatSecondsClock(ses.actualDurationSeconds)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
