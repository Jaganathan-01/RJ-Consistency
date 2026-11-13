import { Bell, Flame, Play, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { CommitmentIcon } from '../components/CommitmentIcon';
import { Button } from '../components/ui/button';
import { useAppStore } from '../store/useAppStore';
import type { Commitment, TodayDashboardStatus } from '../types/models';
import {
  formatDateReadable,
  formatDateShort,
  formatMinutesHuman,
  getDatesInRange,
  getLocalTimeHHMM,
  isScheduledOnDate,
  subDaysFromDateStr,
} from '../utils/dateUtils';
import { isQualifyingCompletion } from '../services/streakEngine';

function getGreeting(timezone: string): string {
  const hhmm = getLocalTimeHHMM(Date.now(), timezone);
  const hour = Number(hhmm.split(':')[0] ?? 12);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getStatusColorClass(status: TodayDashboardStatus): string {
  switch (status) {
    case 'Completed':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'In Progress':
      return 'text-blue-600 dark:text-blue-400';
    case 'Recovery Required':
      return 'text-amber-600 dark:text-amber-400';
    case 'Frozen':
      return 'text-cyan-600 dark:text-cyan-400';
    case 'Paused':
      return 'text-slate-500 dark:text-slate-400';
    default:
      return 'text-slate-600 dark:text-slate-300';
  }
}

export function DashboardView({
  onNewCommitment,
}: {
  onNewCommitment: () => void;
}) {
  const {
    settings,
    todayDateStr,
    commitments,
    dailyCompletions,
    streakRecords,
    recoveryChallenges,
    activeSession,
    elapsedSeconds,
    setActiveSection,
    setSelectedFocusCommitmentId,
    startFocusSession,
    importSamples,
    showToast,
  } = useAppStore();

  const nonArchived = commitments.filter((c) => c.status !== 'ARCHIVED');
  const activeCommitments = nonArchived.filter((c) => c.status === 'ACTIVE');

  const completionMap = new Map(
    dailyCompletions
      .filter((d) => d.scheduledDate === todayDateStr)
      .map((d) => [d.commitmentId, d])
  );
  const streakMap = new Map(streakRecords.map((s) => [s.commitmentId, s]));
  const activeChallengeByCommitment = new Map(
    recoveryChallenges
      .filter((r) => r.challengeStatus === 'PENDING' || r.challengeStatus === 'IN_PROGRESS')
      .map((r) => [r.commitmentId, r])
  );

  const scheduledToday = activeCommitments.filter((c) => isScheduledOnDate(c, todayDateStr));

  const getStatusForCommitment = (c: Commitment): TodayDashboardStatus => {
    if (c.status === 'PAUSED') return 'Paused';
    if (activeSession?.commitmentId === c.id) return 'In Progress';
    const challenge = activeChallengeByCommitment.get(c.id);
    if (challenge) return 'Recovery Required';
    const streak = streakMap.get(c.id);
    if (streak?.streakStatus === 'FROZEN') return 'Frozen';

    const todayRec = completionMap.get(c.id);
    if (todayRec && isQualifyingCompletion(c, todayRec)) return 'Completed';
    if (todayRec && todayRec.actualDurationSeconds > 0) return 'In Progress';
    if (!isScheduledOnDate(c, todayDateStr)) return 'Rest Day';
    return 'Pending';
  };

  const completedTodayCount = scheduledToday.filter((c) => {
    const rec = completionMap.get(c.id);
    return Boolean(rec && isQualifyingCompletion(c, rec));
  }).length;

  const pendingTodayCount = Math.max(0, scheduledToday.length - completedTodayCount);

  const totalFocusMinutesToday = dailyCompletions
    .filter((d) => d.scheduledDate === todayDateStr)
    .reduce((sum, d) => sum + d.actualDurationMinutes, 0) +
    (activeSession ? Math.floor(elapsedSeconds / 60) : 0);

  const totalTargetMinutesToday = scheduledToday.reduce(
    (sum, c) => sum + c.targetDurationMinutes,
    0
  );

  const activeStreaksCount = streakRecords.filter(
    (s) => s.currentStreak > 0 && nonArchived.some((c) => c.id === s.commitmentId && c.status === 'ACTIVE')
  ).length;

  const accountabilityScore =
    scheduledToday.length > 0
      ? Math.round((completedTodayCount / scheduledToday.length) * 100)
      : nonArchived.length > 0
        ? 100
        : 0;

  // Daily progress ring
  const ringRadius = 52;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = Math.min(1, accountabilityScore / 100);
  const ringOffset = ringCircumference * (1 - ringProgress);

  // Weekly 7-day consistency
  const weekDates = getDatesInRange(subDaysFromDateStr(todayDateStr, 6), todayDateStr);
  const allCompletionsMap = new Map(
    dailyCompletions.map((d) => [`${d.commitmentId}_${d.scheduledDate}`, d])
  );
  const weeklyBars = weekDates.map((d) => {
    let sched = 0;
    let done = 0;
    for (const c of nonArchived) {
      if (!isScheduledOnDate(c, d)) continue;
      const rec = allCompletionsMap.get(`${c.id}_${d}`);
      if (d < todayDateStr || (rec && isQualifyingCompletion(c, rec))) {
        sched++;
        if (rec && isQualifyingCompletion(c, rec)) done++;
      } else if (d === todayDateStr) {
        sched++;
      }
    }
    const pct = sched > 0 ? Math.round((done / sched) * 100) : 0;
    return { date: d, pct, done, sched };
  });

  // Upcoming reminders
  const currentHHMM = getLocalTimeHHMM(Date.now(), settings.timezone);
  const upcomingReminders = scheduledToday
    .filter((c) => {
      if (!c.reminderEnabled || !c.reminderTime) return false;
      const rec = completionMap.get(c.id);
      if (rec && isQualifyingCompletion(c, rec)) return false;
      return true;
    })
    .sort((a, b) => a.reminderTime.localeCompare(b.reminderTime));

  const handleStartOrResume = async (c: Commitment) => {
    if (activeSession) {
      if (activeSession.commitmentId === c.id) {
        setActiveSection('focus');
        return;
      }
      showToast('Another focus session is currently active. Stop or finish it first.');
      setActiveSection('focus');
      return;
    }

    const challenge = activeChallengeByCommitment.get(c.id);
    if (challenge) {
      await startFocusSession({
        commitmentId: c.id,
        targetDurationMinutes: challenge.requiredDurationMinutes,
        completionType: 'RECOVERY',
        recoveryChallengeId: challenge.id,
      });
      return;
    }

    const todayRec = completionMap.get(c.id);
    const completedMins = todayRec?.actualDurationMinutes ?? 0;
    const remainingTarget = Math.max(1, c.targetDurationMinutes - completedMins);

    await startFocusSession({
      commitmentId: c.id,
      targetDurationMinutes:
        completedMins > 0 && completedMins < c.targetDurationMinutes
          ? remainingTarget
          : c.targetDurationMinutes,
      completionType: 'REGULAR',
    });
  };

  const handleImportSamples = async () => {
    const count = await importSamples();
    showToast(
      count > 0
        ? `Imported ${count} sample commitments. Start whenever you are ready.`
        : 'Sample commitments are already present.'
    );
  };

  if (nonArchived.length === 0) {
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatDateReadable(todayDateStr)}
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {getGreeting(settings.timezone)}
          </h1>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-[#121826]">
          <div className="max-w-xl space-y-3">
            <h2 className="text-xl font-semibold">Build your daily discipline system</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              RJ Consistency tracks your focus sessions, enforces per-commitment discipline modes,
              protects earned streaks with configurable freezes, and generates recovery challenges
              when life interrupts. Everything lives locally on your device.
            </p>
            <div className="flex flex-wrap gap-3 pt-3">
              <Button onClick={onNewCommitment}>
                <Plus className="h-4 w-4" />
                <span>Create First Commitment</span>
              </Button>
              <Button variant="outline" onClick={handleImportSamples}>
                <Sparkles className="h-4 w-4" />
                <span>Import 5 Sample Commitments</span>
              </Button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
              Sample set includes Meditation (15m), DSA Practice (60m), English Practice (20m),
              Reading (20m), and Exercise (30m) with zero fake historical data.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {formatDateReadable(todayDateStr)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {getGreeting(settings.timezone)}
          </h1>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Accountability Score
          </span>
          <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {accountabilityScore}%
          </span>
        </div>
      </header>

      {/* Overview Stats Grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Commitments</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">{nonArchived.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Completed Today</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {completedTodayCount}
            <span className="text-sm font-normal text-slate-400">/{scheduledToday.length}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Pending Today</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">{pendingTodayCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Focus Today</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">
            {formatMinutesHuman(totalFocusMinutesToday)}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Streaks</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">{activeStreaksCount}</div>
        </div>
      </section>

      {/* Progress Ring + Weekly Overview + Upcoming Reminders */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Daily Progress Circle */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] flex items-center gap-5">
          <div className="relative h-32 w-32 shrink-0 flex items-center justify-center">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                stroke="currentColor"
                strokeWidth="10"
                fill="none"
                className="text-slate-200 dark:text-slate-800"
              />
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                stroke="#10B981"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className="transition-[stroke-dashoffset] duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{accountabilityScore}%</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Daily Goal</span>
            </div>
          </div>

          <div className="space-y-1.5 min-w-0">
            <h2 className="text-sm font-semibold">Today&apos;s Progress</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {formatMinutesHuman(totalFocusMinutesToday)} logged of{' '}
              {formatMinutesHuman(totalTargetMinutesToday)} scheduled
            </p>
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveSection('focus')}
              >
                Open Focus Timer
              </Button>
            </div>
          </div>
        </div>

        {/* Weekly Consistency Overview */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Weekly Consistency</h2>
            <button
              type="button"
              onClick={() => setActiveSection('analytics')}
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Details
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2 items-end h-24">
            {weeklyBars.map((bar) => (
              <div key={bar.date} className="flex flex-col items-center gap-1.5 h-full justify-end">
                <div className="w-full max-w-[24px] flex-1 flex items-end rounded-md bg-slate-100 dark:bg-slate-800/70 overflow-hidden">
                  <div
                    className="w-full rounded-md bg-emerald-500 transition-all"
                    style={{ height: `${Math.max(bar.pct > 0 ? 10 : 0, bar.pct)}%` }}
                  />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatDateShort(bar.date).split(' ')[1]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Reminders */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Upcoming Reminders</h2>
            <Bell className="h-4 w-4 text-slate-400" />
          </div>
          {upcomingReminders.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              No pending reminders remaining today.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {upcomingReminders.slice(0, 3).map((c) => {
                const passed = currentHHMM > c.reminderTime;
                return (
                  <li key={c.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {c.targetDurationMinutes} min target
                      </div>
                    </div>
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        passed
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {c.reminderTime}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Today's Commitments */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Today&apos;s Commitments</h2>
          <button
            type="button"
            onClick={() => setActiveSection('commitments')}
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            Manage All
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {nonArchived.map((c) => {
            const status = getStatusForCommitment(c);
            const todayRec = completionMap.get(c.id);
            const streak = streakMap.get(c.id);
            const challenge = activeChallengeByCommitment.get(c.id);
            const isActiveTimer = activeSession?.commitmentId === c.id;

            const completedSeconds =
              (todayRec?.actualDurationSeconds ?? 0) + (isActiveTimer ? elapsedSeconds : 0);
            const completedMinutes = Math.floor(completedSeconds / 60);
            const progressPct = Math.min(
              100,
              Math.round((completedSeconds / Math.max(1, c.targetDurationMinutes * 60)) * 100)
            );

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-[#121826] flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                    >
                      <CommitmentIcon name={c.icon} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold truncate">{c.name}</h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className={getStatusColorClass(status)}>{status}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {completedMinutes}/{c.targetDurationMinutes}m
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Flame className="h-3.5 w-3.5 text-amber-500" />
                          {streak?.currentStreak ?? 0}d streak
                        </span>
                      </div>
                    </div>
                  </div>

                  {c.status === 'ACTIVE' && (
                    <Button
                      size="sm"
                      variant={
                        status === 'Recovery Required'
                          ? 'secondary'
                          : status === 'Completed'
                            ? 'outline'
                            : 'default'
                      }
                      onClick={() => {
                        setSelectedFocusCommitmentId(c.id);
                        void handleStartOrResume(c);
                      }}
                    >
                      {status === 'Recovery Required' ? (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Recover ({challenge?.requiredDurationMinutes}m)</span>
                        </>
                      ) : isActiveTimer ? (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          <span>Resume</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          <span>{completedMinutes > 0 ? 'Continue' : 'Start'}</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${progressPct}%`,
                        backgroundColor: status === 'Completed' ? '#10B981' : c.color,
                      }}
                    />
                  </div>
                  {challenge && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {challenge.previousStreak}-day streak frozen — complete a{' '}
                      {challenge.requiredDurationMinutes}-minute recovery session by{' '}
                      {formatDateShort(challenge.deadline)}.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
