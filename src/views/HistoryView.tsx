import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { HistoryEventType } from '../types/models';
import { formatDateReadable } from '../utils/dateUtils';

function formatEventLabel(type: HistoryEventType): string {
  switch (type) {
    case 'DAY_COMPLETED':
      return 'Completed';
    case 'SESSION_COMPLETED':
      return 'Session Logged';
    case 'DAY_PARTIAL':
      return 'Partial Progress';
    case 'DAY_MISSED':
      return 'Missed Day';
    case 'STREAK_FROZEN':
      return 'Streak Frozen';
    case 'RECOVERY_CREATED':
      return 'Recovery Generated';
    case 'RECOVERY_COMPLETED':
      return 'Streak Recovered';
    case 'RECOVERY_EXPIRED':
      return 'Recovery Expired';
    case 'COMMITMENT_PAUSED':
      return 'Paused';
    case 'COMMITMENT_RESUMED':
      return 'Resumed';
  }
}

function getEventTone(type: HistoryEventType): string {
  switch (type) {
    case 'DAY_COMPLETED':
    case 'RECOVERY_COMPLETED':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'STREAK_FROZEN':
      return 'text-cyan-600 dark:text-cyan-400';
    case 'RECOVERY_CREATED':
      return 'text-amber-600 dark:text-amber-400';
    case 'DAY_MISSED':
    case 'RECOVERY_EXPIRED':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-slate-600 dark:text-slate-300';
  }
}

export function HistoryView() {
  const { historyEvents, commitments } = useAppStore();
  const [commitmentFilter, setCommitmentFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const filtered = historyEvents.filter((ev) => {
    if (commitmentFilter !== 'ALL' && ev.commitmentId !== commitmentFilter) return false;
    if (fromDate && ev.date < fromDate) return false;
    if (toDate && ev.date > toDate) return false;
    return true;
  });

  // Group by date
  const grouped = new Map<string, typeof filtered>();
  for (const ev of filtered) {
    const arr = grouped.get(ev.date) ?? [];
    arr.push(ev);
    grouped.set(ev.date, arr);
  }
  const dates = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Activity History</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Immutable log of completed sessions, missed days, streak freezes, and recovery events.
        </p>
      </header>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#121826]">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Commitment
          </label>
          <select
            value={commitmentFilter}
            onChange={(e) => setCommitmentFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="ALL">All Commitments (incl. Archived)</option>
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.status === 'ARCHIVED' ? '(Archived)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            From Date
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            To Date
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {dates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#121826]">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No historical events match the current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {dates.map((dateStr) => {
            const events = grouped.get(dateStr) ?? [];
            return (
              <section key={dateStr} className="space-y-2">
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatDateReadable(dateStr)}
                </h2>
                <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 dark:border-slate-800 dark:bg-[#121826] dark:divide-slate-800/80">
                  {events.map((ev) => (
                    <div key={ev.id} className="p-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-semibold">{ev.commitmentName}</span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className={`font-medium ${getEventTone(ev.type)}`}>
                            {formatEventLabel(ev.type)}
                          </span>
                          {ev.durationMinutes !== undefined && (
                            <>
                              <span aria-hidden="true" className="text-slate-400">·</span>
                              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                                {ev.durationMinutes} min
                              </span>
                            </>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {ev.details}
                        </p>
                      </div>

                      {ev.streakBefore !== undefined && ev.streakAfter !== undefined && (
                        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          Streak {ev.streakBefore}d → {ev.streakAfter}d
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
