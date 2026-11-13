import { Archive, ArchiveRestore, Edit3, Pause, Play, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CommitmentIcon } from '../components/CommitmentIcon';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useAppStore } from '../store/useAppStore';
import type { Commitment } from '../types/models';
import { WEEKDAY_SHORT } from '../utils/dateUtils';

export function CommitmentsView({
  onNewCommitment,
  onEditCommitment,
}: {
  onNewCommitment: () => void;
  onEditCommitment: (commitment: Commitment) => void;
}) {
  const {
    commitments,
    streakRecords,
    pauseCommitment,
    resumeCommitment,
    archiveCommitment,
    unarchiveCommitment,
    deleteCommitment,
    startFocusSession,
    importSamples,
    showToast,
    activeSession,
    setActiveSection,
  } = useAppStore();

  const [filter, setFilter] = useState<'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Commitment | null>(null);

  const streakMap = new Map(streakRecords.map((s) => [s.commitmentId, s]));

  const filtered = commitments.filter((c) => {
    if (filter !== 'ALL' && c.status !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleImportSamples = async () => {
    const count = await importSamples();
    showToast(
      count > 0 ? `Imported ${count} sample commitments.` : 'All sample commitments already exist.'
    );
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    await deleteCommitment(confirmDelete.id);
    showToast(`Deleted "${confirmDelete.name}".`);
    setConfirmDelete(null);
  };

  const handleStartFocus = async (c: Commitment) => {
    if (activeSession) {
      showToast('A focus session is already running.');
      setActiveSection('focus');
      return;
    }
    await startFocusSession({ commitmentId: c.id });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Commitments</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure daily targets, schedules, and individual discipline modes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleImportSamples}>
            <Sparkles className="h-4 w-4" />
            <span>Import Samples</span>
          </Button>
          <Button onClick={onNewCommitment}>
            <Plus className="h-4 w-4" />
            <span>New Commitment</span>
          </Button>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          {(['ACTIVE', 'PAUSED', 'ARCHIVED', 'ALL'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                filter === tab
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.toLowerCase()}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commitments..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-[#121826] dark:text-slate-100"
          />
        </div>
      </div>

      {/* Commitments List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#121826]">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No commitments match this filter.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Button onClick={onNewCommitment}>Create Commitment</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((c) => {
            const streak = streakMap.get(c.id);
            const scheduleSummary =
              c.schedule.type === 'daily'
                ? 'Every day'
                : c.schedule.weekdays.map((w) => WEEKDAY_SHORT[w]).join(' · ');

            return (
              <article
                key={c.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                      >
                        <CommitmentIcon name={c.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold truncate">{c.name}</h2>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                          <span>{c.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{c.strictness}</span>
                          <span aria-hidden="true">·</span>
                          <span>{c.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-sm font-semibold">{c.targetDurationMinutes}m</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        min {c.minimumDurationMinutes}m
                      </div>
                    </div>
                  </div>

                  {c.description && (
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                      {c.description}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>Schedule: {scheduleSummary}</span>
                    <span aria-hidden="true">·</span>
                    <span>Streak: {streak?.currentStreak ?? 0}d</span>
                    <span aria-hidden="true">·</span>
                    <span>Best: {streak?.longestStreak ?? 0}d</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                  {c.status === 'ACTIVE' && (
                    <Button size="sm" onClick={() => void handleStartFocus(c)}>
                      <Play className="h-3.5 w-3.5" />
                      <span>Start</span>
                    </Button>
                  )}

                  <Button size="sm" variant="outline" onClick={() => onEditCommitment(c)}>
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </Button>

                  {c.status === 'ACTIVE' && (
                    <Button size="sm" variant="outline" onClick={() => void pauseCommitment(c.id)}>
                      <Pause className="h-3.5 w-3.5" />
                      <span>Pause</span>
                    </Button>
                  )}

                  {c.status === 'PAUSED' && (
                    <Button size="sm" variant="outline" onClick={() => void resumeCommitment(c.id)}>
                      <Play className="h-3.5 w-3.5" />
                      <span>Resume</span>
                    </Button>
                  )}

                  {c.status !== 'ARCHIVED' ? (
                    <Button size="sm" variant="ghost" onClick={() => void archiveCommitment(c.id)}>
                      <Archive className="h-3.5 w-3.5" />
                      <span>Archive</span>
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => void unarchiveCommitment(c.id)}>
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      <span>Restore</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 ml-auto"
                    onClick={() => setConfirmDelete(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Commitment</DialogTitle>
            <DialogDescription>
              Permanently delete &ldquo;{confirmDelete?.name}&rdquo; and all associated sessions,
              streaks, and history? To keep historical data, choose Archive instead.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirmed}>
              Delete Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
