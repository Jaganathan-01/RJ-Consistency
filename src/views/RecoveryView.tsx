import { CheckCircle2, Clock, RotateCcw, Snowflake, XCircle } from 'lucide-react';
import { CommitmentIcon } from '../components/CommitmentIcon';
import { Button } from '../components/ui/button';
import { useAppStore } from '../store/useAppStore';
import { formatDateReadable } from '../utils/dateUtils';

export function RecoveryView() {
  const {
    commitments,
    recoveryChallenges,
    freezeRecords,
    activeSession,
    startFocusSession,
    setActiveSection,
    showToast,
  } = useAppStore();

  const commitmentMap = new Map(commitments.map((c) => [c.id, c]));

  const activeChallenges = recoveryChallenges.filter(
    (r) => r.challengeStatus === 'PENDING' || r.challengeStatus === 'IN_PROGRESS'
  );
  const pastChallenges = recoveryChallenges.filter(
    (r) => r.challengeStatus === 'COMPLETED' || r.challengeStatus === 'EXPIRED'
  );

  const handleStartRecovery = async (challengeId: string, commitmentId: string, mins: number) => {
    if (activeSession) {
      showToast('Another focus session is currently running.');
      setActiveSection('focus');
      return;
    }
    await startFocusSession({
      commitmentId,
      targetDurationMinutes: mins,
      completionType: 'RECOVERY',
      recoveryChallengeId: challengeId,
    });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Recovery Challenges</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Restore frozen streaks by completing a dedicated recovery focus session before the deadline.
        </p>
      </header>

      {/* Active Challenges */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Active Challenges ({activeChallenges.length})</h2>
        {activeChallenges.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#121826]">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No streaks are currently frozen. Stay consistent with your daily schedule to keep your
              momentum intact.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeChallenges.map((ch) => {
              const c = commitmentMap.get(ch.commitmentId);
              const activeFreeze = freezeRecords.find(
                (f) => f.commitmentId === ch.commitmentId && f.status === 'ACTIVE'
              );
              return (
                <article
                  key={ch.id}
                  className="rounded-2xl border border-amber-500/30 bg-white p-5 dark:bg-[#121826] space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `${c?.color ?? '#F59E0B'}1A`,
                          color: c?.color ?? '#F59E0B',
                        }}
                      >
                        <CommitmentIcon name={c?.icon ?? 'Target'} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold truncate">
                          {c?.name ?? 'Commitment'}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400">
                          <Snowflake className="h-3.5 w-3.5" />
                          <span>{ch.previousStreak}-day streak frozen</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right tabular-nums shrink-0">
                      <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                        {ch.requiredDurationMinutes}m
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">required</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-sm dark:border-slate-800 dark:bg-slate-900/60 space-y-1.5">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      Your {ch.previousStreak}-day {c?.name.toLowerCase()} streak is frozen.
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Complete a {ch.requiredDurationMinutes}-minute session to bring your
                      consistency back.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>Missed days: {ch.missedDates.length}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Deadline: {formatDateReadable(ch.deadline)}
                    </span>
                  </div>

                  {activeFreeze && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {activeFreeze.reason}
                    </p>
                  )}

                  <Button
                    className="w-full"
                    onClick={() =>
                      void handleStartRecovery(ch.id, ch.commitmentId, ch.requiredDurationMinutes)
                    }
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Start {ch.requiredDurationMinutes}-Minute Recovery Session</span>
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Past Recovery History */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Past Recovery Outcomes</h2>
        {pastChallenges.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No completed or expired recovery challenges yet.
          </p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 dark:border-slate-800 dark:bg-[#121826] dark:divide-slate-800/80">
            {pastChallenges.map((ch) => {
              const c = commitmentMap.get(ch.commitmentId);
              const completed = ch.challengeStatus === 'COMPLETED';
              return (
                <div key={ch.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {completed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {c?.name ?? 'Deleted Commitment'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {completed
                          ? `Restored ${ch.previousStreak}-day streak (${ch.actualDurationMinutes}m completed)`
                          : `Expired on ${ch.deadline} (${ch.previousStreak}-day streak reset)`}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-medium shrink-0 ${
                      completed
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {completed ? 'Recovered' : 'Expired'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
