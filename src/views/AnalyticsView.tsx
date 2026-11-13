import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { analyticsService, type AnalyticsOverview, type AnalyticsRange } from '../services/analyticsService';
import { useAppStore } from '../store/useAppStore';
import { formatDateShort, formatMinutesHuman } from '../utils/dateUtils';

const RANGES: Array<{ id: AnalyticsRange; label: string }> = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
];

function heatmapColorClass(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0:
      return 'bg-slate-200/70 dark:bg-slate-800/80';
    case 1:
      return 'bg-emerald-500/25';
    case 2:
      return 'bg-emerald-500/50';
    case 3:
      return 'bg-emerald-500/75';
    case 4:
      return 'bg-emerald-500';
  }
}

export function AnalyticsView() {
  const { todayDateStr, commitments, dailyCompletions, streakRecords, recoveryChallenges } =
    useAppStore();

  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [commitmentFilter, setCommitmentFilter] = useState<string>('ALL');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    date: string;
    completedCount: number;
    scheduledCount: number;
    focusMinutes: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void analyticsService
      .computeOverview(
        todayDateStr,
        range,
        commitmentFilter === 'ALL' ? undefined : commitmentFilter
      )
      .then((res) => {
        if (active) setOverview(res);
      });
    return () => {
      active = false;
    };
  }, [todayDateStr, range, commitmentFilter, commitments, dailyCompletions, streakRecords, recoveryChallenges]);

  if (!overview) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics &amp; Calendar</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Derived directly from your local IndexedDB completion and session logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by commitment"
            value={commitmentFilter}
            onChange={(e) => setCommitmentFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-[#121826] dark:text-slate-100 min-h-[38px]"
          >
            <option value="ALL">All Commitments</option>
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  range === r.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Primary KPI Grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Daily Completion</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{overview.dailyCompletionPct}%</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Weekly Consistency</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {overview.weeklyConsistencyPct}%
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Monthly Consistency</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {overview.monthlyConsistencyPct}%
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Yearly Consistency</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {overview.yearlyConsistencyPct}%
          </div>
        </div>
      </section>

      {/* Secondary KPI Grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Total Focus ({overview.rangeLabel})
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">{overview.totalFocusHours}h</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Avg Daily Focus</div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {formatMinutesHuman(overview.avgDailyFocusMinutes)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Longest Streak</div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {overview.longestStreakOverall} days
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Recovery Success</div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {overview.totalRecoveries > 0
              ? `${overview.recoverySuccessRate}% (${overview.completedRecoveries}/${overview.totalRecoveries})`
              : 'No recoveries'}
          </div>
        </div>
      </section>

      {/* Best & Most Missed */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Best Performing Commitment
          </div>
          <div className="mt-1 text-base font-semibold">
            {overview.bestCommitment
              ? `${overview.bestCommitment.commitment.name} (${overview.bestCommitment.completionRate}%)`
              : 'Not enough data yet'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Most Frequently Missed
          </div>
          <div className="mt-1 text-base font-semibold">
            {overview.mostMissedCommitment
              ? `${overview.mostMissedCommitment.commitment.name} (${overview.mostMissedCommitment.missedDays} missed)`
              : 'Zero missed days recorded'}
          </div>
        </div>
      </section>

      {/* GitHub-Style Contribution Heatmap */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold">Consistency Heatmap</h2>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {hoveredCell
              ? `${hoveredCell.date}: ${hoveredCell.completedCount}/${hoveredCell.scheduledCount} completed · ${hoveredCell.focusMinutes}m`
              : 'Hover or tap a day to inspect'}
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div
            className="grid grid-flow-col grid-rows-7 gap-1.5 w-max"
            role="grid"
            aria-label="Contribution heatmap"
          >
            {overview.heatmap.map((cell) => (
              <button
                key={cell.date}
                type="button"
                onMouseEnter={() => setHoveredCell(cell)}
                onClick={() => setHoveredCell(cell)}
                title={`${cell.date}: ${cell.completedCount}/${cell.scheduledCount} (${cell.focusMinutes}m)`}
                className={`h-3.5 w-3.5 rounded-[3px] transition-transform hover:scale-125 cursor-pointer ${heatmapColorClass(
                  cell.level
                )}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span key={lvl} className={`h-3 w-3 rounded-[2px] ${heatmapColorClass(lvl)}`} />
          ))}
          <span>More</span>
        </div>
      </section>

      {/* Daily Focus Minutes Chart */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826]">
        <h2 className="text-sm font-semibold mb-4">Daily Focus Minutes ({overview.rangeLabel})</h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={overview.dailyTrend.slice(-30).map((d) => ({
                ...d,
                label: formatDateShort(d.date),
              }))}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#1E293B',
                  borderRadius: '12px',
                  color: '#F8FAFC',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="minutes" name="Focus Minutes" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Individual Commitment Breakdown Table */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-[#121826]">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Commitment Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Commitment</th>
                <th className="px-5 py-3 font-medium text-right">Rate</th>
                <th className="px-5 py-3 font-medium text-right">Focus Time</th>
                <th className="px-5 py-3 font-medium text-right">Completed</th>
                <th className="px-5 py-3 font-medium text-right">Missed</th>
                <th className="px-5 py-3 font-medium text-right">Best Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 tabular-nums">
              {overview.perCommitment.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                    No commitments recorded yet.
                  </td>
                </tr>
              ) : (
                overview.perCommitment.map((row) => (
                  <tr key={row.commitment.id}>
                    <td className="px-5 py-3 font-medium">{row.commitment.name}</td>
                    <td className="px-5 py-3 text-right">{row.completionRate}%</td>
                    <td className="px-5 py-3 text-right">
                      {formatMinutesHuman(row.totalMinutes)}
                    </td>
                    <td className="px-5 py-3 text-right">{row.completedDays}d</td>
                    <td className="px-5 py-3 text-right">{row.missedDays}d</td>
                    <td className="px-5 py-3 text-right">{row.streak?.longestStreak ?? 0}d</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
