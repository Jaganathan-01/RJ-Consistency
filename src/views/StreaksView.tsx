import { Flame, RotateCcw, Snowflake } from 'lucide-react';
import { CommitmentIcon } from '../components/CommitmentIcon';
import { Button } from '../components/ui/button';
import { useAppStore } from '../store/useAppStore';
import type { StreakStatus } from '../types/models';

function explainStreakStatus(status: StreakStatus, currentStreak: number): string {
  switch (status) {
    case 'ACTIVE':
      return currentStreak > 0
        ? 'Streak is active and healthy. Complete your next scheduled session on time to extend it.'
        : 'Ready to begin. Complete a scheduled focus session to start your streak.';
    case 'AT_RISK':
      return 'Inside grace period. Complete your commitment today to protect your streak before freeze activates.';
    case 'FROZEN':
      return 'Streak is frozen after missed scheduled days. Your previous streak count is preserved.';
    case 'RECOVERY_REQUIRED':
      return 'Streak is frozen and requires completing a recovery challenge session before the deadline.';
    case 'PAUSED':
      return 'Commitment is paused. Scheduled days are suspended without breaking or penalizing your streak.';
    case 'BROKEN':
      return 'Previous streak reset after missed days or an expired recovery deadline. Longest streak remains preserved.';
  }
}

export function StreaksView() {
  const { commitments, streakRecords, setActiveSection } = useAppStore();
  const visibleCommitments = commitments.filter((c) => c.status !== 'ARCHIVED');
  const streakMap = new Map(streakRecords.map((s) => [s.commitmentId, s]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Independent Streaks</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Each commitment tracks its own deterministic streak, missed days, freezes, and recoveries.
        </p>
      </header>

      {visibleCommitments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#121826]">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create a commitment first to start tracking independent streaks.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleCommitments.map((c) => {
            const s = streakMap.get(c.id);
            const status = s?.streakStatus ?? 'ACTIVE';
            const current = s?.currentStreak ?? 0;

            return (
              <article
                key={c.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                    >
                      <CommitmentIcon name={c.icon} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold truncate">{c.name}</h2>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {c.strictness} · {status.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-1 text-2xl font-bold tabular-nums">
                      {status === 'FROZEN' || status === 'RECOVERY_REQUIRED' ? (
                        <Snowflake className="h-5 w-5 text-cyan-500" />
                      ) : (
                        <Flame className="h-5 w-5 text-amber-500" />
                      )}
                      <span>{current}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      current days
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800/80 dark:bg-slate-900/50 tabular-nums">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Longest</div>
                    <div className="text-sm font-semibold">{s?.longestStreak ?? 0}d</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Completed</div>
                    <div className="text-sm font-semibold">{s?.totalCompletedDays ?? 0}d</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Consistency</div>
                    <div className="text-sm font-semibold">{s?.consistencyPercentage ?? 0}%</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Missed</div>
                    <div className="text-sm font-semibold">{s?.missedDays ?? 0}d</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Frozen</div>
                    <div className="text-sm font-semibold">{s?.frozenDays ?? 0}d</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Recovered</div>
                    <div className="text-sm font-semibold">{s?.recoveryDays ?? 0}d</div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {explainStreakStatus(status, current)}
                </p>

                {status === 'RECOVERY_REQUIRED' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActiveSection('recovery')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Go to Recovery Challenge</span>
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
