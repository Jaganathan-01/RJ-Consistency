import type {
  Commitment,
  DailyCompletion,
  RecoveryChallenge,
  StreakRecord,
} from '../types/models';
import {
  getDatesInRange,
  isScheduledOnDate,
  subDaysFromDateStr,
} from '../utils/dateUtils';
import { db } from './databaseService';
import { isQualifyingCompletion } from './streakEngine';

export type AnalyticsRange = '7d' | '30d' | '90d' | '1y' | 'all';

export interface HeatmapCell {
  date: string;
  completedCount: number;
  scheduledCount: number;
  focusMinutes: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface CommitmentAnalyticsSummary {
  commitment: Commitment;
  streak: StreakRecord | undefined;
  completionRate: number;
  totalMinutes: number;
  completedDays: number;
  missedDays: number;
}

export interface AnalyticsOverview {
  rangeLabel: string;
  dailyCompletionPct: number;
  weeklyConsistencyPct: number;
  monthlyConsistencyPct: number;
  yearlyConsistencyPct: number;
  rangeConsistencyPct: number;
  totalFocusHours: number;
  totalFocusMinutes: number;
  avgDailyFocusMinutes: number;
  bestCommitment?: CommitmentAnalyticsSummary;
  mostMissedCommitment?: CommitmentAnalyticsSummary;
  longestStreakOverall: number;
  recoverySuccessRate: number;
  completedRecoveries: number;
  totalRecoveries: number;
  perCommitment: CommitmentAnalyticsSummary[];
  heatmap: HeatmapCell[];
  dailyTrend: Array<{ date: string; minutes: number; completionPct: number }>;
}

function getRangeStartDate(todayStr: string, range: AnalyticsRange, earliestDate: string): string {
  switch (range) {
    case '7d':
      return subDaysFromDateStr(todayStr, 6);
    case '30d':
      return subDaysFromDateStr(todayStr, 29);
    case '90d':
      return subDaysFromDateStr(todayStr, 89);
    case '1y':
      return subDaysFromDateStr(todayStr, 364);
    case 'all':
      return earliestDate <= todayStr ? earliestDate : todayStr;
  }
}

function computeConsistencyForWindow(
  commitments: Commitment[],
  completionsByKey: Map<string, DailyCompletion>,
  startDate: string,
  endDate: string
): number {
  const dates = getDatesInRange(startDate, endDate);
  let scheduled = 0;
  let completed = 0;

  for (const c of commitments) {
    if (c.status === 'ARCHIVED') continue;
    for (const d of dates) {
      if (!isScheduledOnDate(c, d)) continue;
      const rec = completionsByKey.get(`${c.id}_${d}`);
      if (d < endDate || (rec && isQualifyingCompletion(c, rec))) {
        scheduled++;
        if (rec && isQualifyingCompletion(c, rec)) {
          completed++;
        }
      }
    }
  }
  return scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
}

export const analyticsService = {
  async computeOverview(
    todayDateStr: string,
    range: AnalyticsRange = '30d',
    filterCommitmentId?: string
  ): Promise<AnalyticsOverview> {
    const [allCommitments, allCompletions, allStreaks, allRecoveries] = await Promise.all([
      db.commitments.toArray(),
      db.dailyCompletions.toArray(),
      db.streakRecords.toArray(),
      db.recoveryChallenges.toArray(),
    ]);

    const commitments = filterCommitmentId
      ? allCommitments.filter((c) => c.id === filterCommitmentId)
      : allCommitments;

    const completionsByKey = new Map<string, DailyCompletion>(
      allCompletions.map((c) => [`${c.commitmentId}_${c.scheduledDate}`, c])
    );
    const streakByCommitment = new Map<string, StreakRecord>(
      allStreaks.map((s) => [s.commitmentId, s])
    );

    const earliestStart = commitments.reduce(
      (min, c) => (c.schedule.startDate < min ? c.schedule.startDate : min),
      todayDateStr
    );
    const rangeStart = getRangeStartDate(todayDateStr, range, earliestStart);
    const rangeDates = getDatesInRange(rangeStart, todayDateStr);

    // Today's completion %
    const dailyCompletionPct = computeConsistencyForWindow(
      commitments,
      completionsByKey,
      todayDateStr,
      todayDateStr
    );
    const weeklyConsistencyPct = computeConsistencyForWindow(
      commitments,
      completionsByKey,
      subDaysFromDateStr(todayDateStr, 6),
      todayDateStr
    );
    const monthlyConsistencyPct = computeConsistencyForWindow(
      commitments,
      completionsByKey,
      subDaysFromDateStr(todayDateStr, 29),
      todayDateStr
    );
    const yearlyConsistencyPct = computeConsistencyForWindow(
      commitments,
      completionsByKey,
      subDaysFromDateStr(todayDateStr, 364),
      todayDateStr
    );
    const rangeConsistencyPct = computeConsistencyForWindow(
      commitments,
      completionsByKey,
      rangeStart,
      todayDateStr
    );

    // Total focus minutes & daily trend inside selected range
    let totalFocusMinutes = 0;
    const dailyTrend: Array<{ date: string; minutes: number; completionPct: number }> = [];

    for (const dateStr of rangeDates) {
      let dayMinutes = 0;
      let dayScheduled = 0;
      let dayCompleted = 0;
      for (const c of commitments) {
        const rec = completionsByKey.get(`${c.id}_${dateStr}`);
        if (rec) {
          dayMinutes += rec.actualDurationMinutes;
        }
        if (c.status !== 'ARCHIVED' && isScheduledOnDate(c, dateStr)) {
          dayScheduled++;
          if (rec && isQualifyingCompletion(c, rec)) dayCompleted++;
        }
      }
      totalFocusMinutes += dayMinutes;
      dailyTrend.push({
        date: dateStr,
        minutes: dayMinutes,
        completionPct: dayScheduled > 0 ? Math.round((dayCompleted / dayScheduled) * 100) : 0,
      });
    }

    const avgDailyFocusMinutes =
      rangeDates.length > 0 ? Math.round(totalFocusMinutes / rangeDates.length) : 0;

    // GitHub-style contribution heatmap (always at least last 91 days or full selected range up to 365 days)
    const heatmapStart =
      range === '1y' || range === 'all'
        ? subDaysFromDateStr(todayDateStr, 363)
        : subDaysFromDateStr(todayDateStr, 111);
    const heatmapDates = getDatesInRange(heatmapStart, todayDateStr);
    const heatmap: HeatmapCell[] = heatmapDates.map((dateStr) => {
      let completedCount = 0;
      let scheduledCount = 0;
      let focusMinutes = 0;
      for (const c of commitments) {
        const rec = completionsByKey.get(`${c.id}_${dateStr}`);
        if (rec) focusMinutes += rec.actualDurationMinutes;
        if (c.status !== 'ARCHIVED' && isScheduledOnDate(c, dateStr)) {
          scheduledCount++;
          if (rec && isQualifyingCompletion(c, rec)) completedCount++;
        }
      }
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (completedCount > 0 && scheduledCount > 0) {
        const ratio = completedCount / scheduledCount;
        if (ratio >= 1) level = 4;
        else if (ratio >= 0.66) level = 3;
        else if (ratio >= 0.33) level = 2;
        else level = 1;
      } else if (focusMinutes > 0) {
        level = 1;
      }
      return { date: dateStr, completedCount, scheduledCount, focusMinutes, level };
    });

    // Per-commitment analytics
    const perCommitment: CommitmentAnalyticsSummary[] = commitments.map((c) => {
      const streak = streakByCommitment.get(c.id);
      const mins = allCompletions
        .filter((r) => r.commitmentId === c.id && r.scheduledDate >= rangeStart && r.scheduledDate <= todayDateStr)
        .reduce((sum, r) => sum + r.actualDurationMinutes, 0);
      const rate = computeConsistencyForWindow([c], completionsByKey, rangeStart, todayDateStr);
      return {
        commitment: c,
        streak,
        completionRate: rate,
        totalMinutes: mins,
        completedDays: streak?.totalCompletedDays ?? 0,
        missedDays: streak?.missedDays ?? 0,
      };
    });

    const activeSummaries = perCommitment.filter((s) => s.commitment.status !== 'ARCHIVED');
    const bestCommitment =
      activeSummaries.length > 0
        ? [...activeSummaries].sort((a, b) => b.completionRate - a.completionRate || b.completedDays - a.completedDays)[0]
        : undefined;
    const mostMissedCommitment =
      activeSummaries.filter((s) => s.missedDays > 0).length > 0
        ? [...activeSummaries].sort((a, b) => b.missedDays - a.missedDays)[0]
        : undefined;

    const longestStreakOverall = allStreaks.reduce(
      (max, s) => Math.max(max, s.longestStreak),
      0
    );

    const relevantRecoveries: RecoveryChallenge[] = filterCommitmentId
      ? allRecoveries.filter((r) => r.commitmentId === filterCommitmentId)
      : allRecoveries;
    const resolvedRecoveries = relevantRecoveries.filter(
      (r) => r.challengeStatus === 'COMPLETED' || r.challengeStatus === 'EXPIRED'
    );
    const completedRecoveries = resolvedRecoveries.filter(
      (r) => r.challengeStatus === 'COMPLETED'
    ).length;
    const recoverySuccessRate =
      resolvedRecoveries.length > 0
        ? Math.round((completedRecoveries / resolvedRecoveries.length) * 100)
        : 0;

    return {
      rangeLabel: range.toUpperCase(),
      dailyCompletionPct,
      weeklyConsistencyPct,
      monthlyConsistencyPct,
      yearlyConsistencyPct,
      rangeConsistencyPct,
      totalFocusHours: Number((totalFocusMinutes / 60).toFixed(1)),
      totalFocusMinutes,
      avgDailyFocusMinutes,
      bestCommitment,
      mostMissedCommitment,
      longestStreakOverall,
      recoverySuccessRate,
      completedRecoveries,
      totalRecoveries: resolvedRecoveries.length,
      perCommitment,
      heatmap,
      dailyTrend,
    };
  },
};
