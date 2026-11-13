import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  History,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAppStore } from '../store/useAppStore';
import type { AppSection } from '../types/models';
import { formatSecondsClock } from '../utils/dateUtils';
import { PWAInstallButton } from './PWAInstallButton';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const NAV_ITEMS: Array<{ id: AppSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'commitments', label: 'My Commitments', icon: ListChecks },
  { id: 'focus', label: 'Focus Sessions', icon: Clock },
  { id: 'streaks', label: 'Streaks', icon: Flame },
  { id: 'recovery', label: 'Recovery Challenges', icon: RotateCcw },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const MOBILE_PRIMARY_TABS: Array<{ id: AppSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'commitments', label: 'Habits', icon: ListChecks },
  { id: 'focus', label: 'Focus', icon: Clock },
  { id: 'analytics', label: 'Stats', icon: BarChart3 },
];

export function AppShell({
  children,
  onNewCommitment,
}: {
  children: ReactNode;
  onNewCommitment: () => void;
}) {
  const {
    activeSection,
    setActiveSection,
    settings,
    updateSettings,
    activeSession,
    remainingSeconds,
    commitments,
    recoveryChallenges,
    completedBanner,
    dismissCompletedBanner,
    toastMessage,
    clearToast,
  } = useAppStore();

  const isOnline = useOnlineStatus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pendingRecoveryCount = recoveryChallenges.filter(
    (r) => r.challengeStatus === 'PENDING' || r.challengeStatus === 'IN_PROGRESS'
  ).length;

  const activeCommitmentName = activeSession
    ? commitments.find((c) => c.id === activeSession.commitmentId)?.name ?? 'Focus'
    : '';

  const toggleTheme = () => {
    void updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const handleSelectSection = (id: AppSection) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white dark:border-slate-800/80 dark:bg-[#0F1522]">
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => handleSelectSection('dashboard')}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <Activity className="h-5 w-5 text-emerald-500 shrink-0" />
            <span className="text-base font-bold tracking-tight whitespace-nowrap">RJ Consistency</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSection(item.id)}
                className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer min-h-[42px] ${
                  active
                    ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'recovery' && pendingRecoveryCount > 0 && (
                  <span className="text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {pendingRecoveryCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2.5">
          {activeSession && (
            <button
              type="button"
              onClick={() => handleSelectSection('focus')}
              className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left transition-colors hover:bg-emerald-500/15 cursor-pointer"
            >
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {activeSession.sessionStatus === 'PAUSED' ? 'Timer Paused' : 'Session Active'}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{activeCommitmentName}</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {formatSecondsClock(remainingSeconds)}
                </span>
              </div>
            </button>
          )}

          {!isOnline && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 px-1">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>Offline mode active</span>
            </div>
          )}

          <PWAInstallButton compact />

          <Button onClick={onNewCommitment} className="w-full">
            <Plus className="h-4 w-4" />
            <span>New Commitment</span>
          </Button>
        </div>
      </aside>

      {/* Mobile Sticky Top Header (compact <= 52px) */}
      <header className="sticky top-0 z-30 flex lg:hidden h-13 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0B0F17]/90 pt-safe">
        <button
          type="button"
          onClick={() => handleSelectSection('dashboard')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Activity className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-bold tracking-tight">RJ Consistency</span>
        </button>

        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <WifiOff className="h-3.5 w-3.5" />
              <span>Offline</span>
            </span>
          )}
          {activeSession && activeSection !== 'focus' && (
            <button
              type="button"
              onClick={() => handleSelectSection('focus')}
              className="rounded-lg bg-emerald-500/15 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 cursor-pointer"
            >
              {formatSecondsClock(remainingSeconds)}
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onNewCommitment}
            aria-label="New commitment"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 pb-24 lg:pb-10">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Mobile Fixed Bottom Navigation (compact 60px + safe-area) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#0F1522]/95 lg:hidden pb-safe"
      >
        {MOBILE_PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectSection(tab.id)}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                active
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
            ['streaks', 'recovery', 'history', 'settings'].includes(activeSection)
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          <Menu className="h-5 w-5" />
          <span className="whitespace-nowrap">More</span>
          {pendingRecoveryCount > 0 && (
            <span className="absolute right-3 top-2 text-[10px] font-bold tabular-nums text-amber-500">
              {pendingRecoveryCount}
            </span>
          )}
        </button>
      </nav>

      {/* Mobile Secondary Navigation Bottom Sheet */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden flex items-end"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl border-t border-slate-200 bg-white p-5 pb-8 dark:border-slate-800 dark:bg-[#121826]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">More Sections</h2>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {(
                [
                  { id: 'streaks', label: 'Streaks', icon: Flame },
                  { id: 'recovery', label: 'Recovery Challenges', icon: RotateCcw },
                  { id: 'history', label: 'History', icon: History },
                  { id: 'settings', label: 'Settings', icon: Settings },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSection(item.id)}
                    className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium min-h-[48px] ${
                      active
                        ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'recovery' && pendingRecoveryCount > 0 && (
                      <span className="text-xs font-semibold tabular-nums text-amber-500">
                        {pendingRecoveryCount} active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <PWAInstallButton />
            </div>
          </div>
        </div>
      )}

      {/* Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md lg:bottom-6 lg:left-auto lg:right-6">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={clearToast}
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Session Completed Success Modal */}
      <Dialog open={Boolean(completedBanner)} onOpenChange={(o) => !o && dismissCompletedBanner()}>
        <DialogContent className="max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 animate-bounce">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <DialogHeader className="items-center text-center pr-0 mt-3">
            <DialogTitle className="text-xl">
              {completedBanner?.isRecovery ? 'Streak Recovered' : 'Session Completed'}
            </DialogTitle>
            <DialogDescription>
              {completedBanner?.isRecovery
                ? `Your ${completedBanner.commitment.name} consistency is back on track.`
                : `You fulfilled your ${completedBanner?.commitment.name} commitment.`}
            </DialogDescription>
          </DialogHeader>

          {completedBanner && (
            <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Time Spent</div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {completedBanner.actualMinutes} min
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Current Streak</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {completedBanner.newStreak} days
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-center">
            <Button onClick={dismissCompletedBanner} className="w-full">
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
