import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { CommitmentFormModal } from './components/CommitmentFormModal';
import { useAppStore } from './store/useAppStore';
import type { Commitment } from './types/models';
import { AnalyticsView } from './views/AnalyticsView';
import { CommitmentsView } from './views/CommitmentsView';
import { DashboardView } from './views/DashboardView';
import { FocusView } from './views/FocusView';
import { HistoryView } from './views/HistoryView';
import { RecoveryView } from './views/RecoveryView';
import { SettingsView } from './views/SettingsView';
import { StreaksView } from './views/StreaksView';

export default function App() {
  const { initialized, isLoading, activeSection, initializeApp, tickTimer } = useAppStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<Commitment | null>(null);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void tickTimer();
    }, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tickTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [tickTimer]);

  const handleOpenNew = () => {
    setEditingCommitment(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (commitment: Commitment) => {
    setEditingCommitment(commitment);
    setFormOpen(true);
  };

  if (!initialized && isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100">
        <div className="text-center space-y-2">
          <div className="text-lg font-bold tracking-tight">RJ Consistency</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading local vault...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell onNewCommitment={handleOpenNew}>
      {activeSection === 'dashboard' && <DashboardView onNewCommitment={handleOpenNew} />}
      {activeSection === 'commitments' && (
        <CommitmentsView
          onNewCommitment={handleOpenNew}
          onEditCommitment={handleOpenEdit}
        />
      )}
      {activeSection === 'focus' && <FocusView />}
      {activeSection === 'streaks' && <StreaksView />}
      {activeSection === 'recovery' && <RecoveryView />}
      {activeSection === 'analytics' && <AnalyticsView />}
      {activeSection === 'history' && <HistoryView />}
      {activeSection === 'settings' && <SettingsView />}

      <CommitmentFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        editingCommitment={editingCommitment}
      />
    </AppShell>
  );
}
