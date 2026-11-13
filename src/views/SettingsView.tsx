import { Download, Info, Trash2, Upload, Volume2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { backupService } from '../services/backupService';
import { databaseService } from '../services/databaseService';
import { notificationService } from '../services/notificationService';
import { useAppStore } from '../store/useAppStore';
import type { BackupPayload, StrictnessLevel } from '../types/models';
import { getBrowserTimezone } from '../utils/dateUtils';

const COMMON_TIMEZONES = Array.from(
  new Set([
    getBrowserTimezone(),
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Kolkata',
    'Asia/Tokyo',
    'Australia/Sydney',
  ])
);

export function SettingsView() {
  const { settings, updateSettings, refreshAllData, showToast } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [permissionState, setPermissionState] = useState(
    notificationService.getPermissionStatus()
  );
  const [pendingImport, setPendingImport] = useState<BackupPayload | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const perm = await notificationService.requestPermission();
      setPermissionState(perm);
      if (perm !== 'granted') {
        showToast(
          'Notification permission was not granted. The app remains fully functional without notifications.'
        );
        await updateSettings({
          notificationSettings: { ...settings.notificationSettings, enabled: false },
        });
        return;
      }
    }
    await updateSettings({
      notificationSettings: { ...settings.notificationSettings, enabled },
    });
  };

  const handleExportJson = async () => {
    const payload = await backupService.exportJson();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consistency-backup-${payload.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON exported.');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = backupService.validateBackup(parsed);
      if (result.valid === false) {
        showToast(result.error);
        return;
      }
      setPendingImport(result.payload);
    } catch {
      showToast('Invalid JSON file. Could not read backup.');
    }
  };

  const handleConfirmImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    const summary = await backupService.importBackup(pendingImport, mode);
    setPendingImport(null);
    await refreshAllData();
    showToast(
      `Backup restored (${summary.commitmentsImported} commitments, ${summary.completionsImported} daily records imported).`
    );
  };

  const handleResetAll = async () => {
    await databaseService.clearAllData();
    setConfirmResetOpen(false);
    await refreshAllData();
    showToast('All local application data has been reset.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings &amp; Backup</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Customize theme, timezone boundaries, discipline defaults, notifications, and local JSON backups.
        </p>
      </header>

      {/* Appearance & Time */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] space-y-4">
        <h2 className="text-sm font-semibold">Appearance &amp; Day Boundaries</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Theme</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Switch between Premium Dark and Light mode.
            </div>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {(['dark', 'light'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => void updateSettings({ theme: t })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize cursor-pointer ${
                  settings.theme === t
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Timezone
            </label>
            <select
              value={settings.timezone}
              onChange={(e) => void updateSettings({ timezone: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Daily Reset Time
            </label>
            <input
              type="time"
              value={settings.dayResetTime}
              onChange={(e) => void updateSettings({ dayResetTime: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
        </div>
      </section>

      {/* Default Discipline Rules */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] space-y-4">
        <h2 className="text-sm font-semibold">Default Discipline &amp; Recovery Settings</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Default Strictness
            </label>
            <select
              value={settings.defaultStrictness}
              onChange={(e) =>
                void updateSettings({ defaultStrictness: e.target.value as StrictnessLevel })
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="STRICT">STRICT</option>
              <option value="NORMAL">NORMAL</option>
              <option value="FLEXIBLE">FLEXIBLE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Default Freeze Duration (Days)
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={settings.defaultFreezeDurationDays}
              onChange={(e) =>
                void updateSettings({ defaultFreezeDurationDays: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              Default Recovery Multiplier
            </label>
            <input
              type="number"
              step={0.05}
              min={1.05}
              max={3}
              value={settings.defaultRecoveryMultiplier}
              onChange={(e) =>
                void updateSettings({ defaultRecoveryMultiplier: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
        </div>
      </section>

      {/* Sound, Vibration & Notifications */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] space-y-4">
        <h2 className="text-sm font-semibold">Alerts, Sound &amp; Notifications</h2>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Completion Sound</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Play an audio chime when a focus timer finishes.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => notificationService.playCompletionTone(true, false)}
            >
              <Volume2 className="h-4 w-4" />
              <span>Test</span>
            </Button>
            <Switch
              checked={settings.soundSettings.enabled}
              onCheckedChange={(v) =>
                void updateSettings({
                  soundSettings: { ...settings.soundSettings, enabled: v },
                })
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Haptic Vibration</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Vibrate supported mobile devices on timer completion.
            </div>
          </div>
          <Switch
            checked={settings.soundSettings.vibrationEnabled}
            onCheckedChange={(v) =>
              void updateSettings({
                soundSettings: { ...settings.soundSettings, vibrationEnabled: v },
              })
            }
          />
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Browser Notifications</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Permission status: {permissionState}
              </div>
            </div>
            <Switch
              checked={settings.notificationSettings.enabled && permissionState === 'granted'}
              onCheckedChange={(v) => void handleToggleNotifications(v)}
            />
          </div>

          {settings.notificationSettings.enabled && permissionState === 'granted' && (
            <div className="space-y-3 pl-1 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Timer Completion Notifications
                </span>
                <Switch
                  checked={settings.notificationSettings.timerCompletionEnabled}
                  onCheckedChange={(v) =>
                    void updateSettings({
                      notificationSettings: {
                        ...settings.notificationSettings,
                        timerCompletionEnabled: v,
                      },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Recovery Challenge Reminders
                </span>
                <Switch
                  checked={settings.notificationSettings.recoveryRemindersEnabled}
                  onCheckedChange={(v) =>
                    void updateSettings({
                      notificationSettings: {
                        ...settings.notificationSettings,
                        recoveryRemindersEnabled: v,
                      },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Daily Summary Reminder
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={settings.notificationSettings.dailySummaryTime}
                    onChange={(e) =>
                      void updateSettings({
                        notificationSettings: {
                          ...settings.notificationSettings,
                          dailySummaryTime: e.target.value,
                        },
                      })
                    }
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs tabular-nums dark:border-slate-800 dark:bg-slate-900"
                  />
                  <Switch
                    checked={settings.notificationSettings.dailySummaryEnabled}
                    onCheckedChange={(v) =>
                      void updateSettings({
                        notificationSettings: {
                          ...settings.notificationSettings,
                          dailySummaryEnabled: v,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Locally scheduled browser notifications are platform-dependent and may be deferred
              when Android suspends background tabs. Reliable background push delivery requires an
              internet-connected push service; core tracking works completely offline without
              notifications.
            </p>
          </div>
        </div>
      </section>

      {/* Backup & Restore */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Backup, Restore &amp; Data Reset</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            All data lives locally in IndexedDB. Export regular JSON backups to protect your history.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void handleExportJson()}>
            <Download className="h-4 w-4" />
            <span>Export JSON Backup</span>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            <span>Import JSON Backup</span>
          </Button>

          <Button
            variant="destructive"
            className="sm:ml-auto"
            onClick={() => setConfirmResetOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            <span>Reset All Data</span>
          </Button>
        </div>
      </section>

      {/* App Info & Install */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121826] space-y-3">
        <h2 className="text-sm font-semibold">Application &amp; Offline PWA</h2>
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div>RJ Consistency · Offline-First Personal Discipline PWA</div>
          <div>Storage: IndexedDB (Dexie.js) · Zero external servers or API keys</div>
        </div>
        <div className="max-w-xs pt-1">
          <PWAInstallButton />
        </div>
      </section>

      {/* Import Choice Dialog (Never silently overwrites) */}
      <Dialog open={Boolean(pendingImport)} onOpenChange={(o) => !o && setPendingImport(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Backup</DialogTitle>
            <DialogDescription>
              Backup created {pendingImport?.exportedAt.slice(0, 10)}. Choose how to apply{' '}
              {pendingImport?.data.commitments.length ?? 0} commitments and{' '}
              {pendingImport?.data.dailyCompletions.length ?? 0} daily records.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex flex-col gap-2.5">
            <Button onClick={() => void handleConfirmImport('merge')}>
              Merge (Keep Existing &amp; Skip Duplicates)
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmImport('replace')}>
              Replace Existing Data Completely
            </Button>
            <Button variant="outline" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset All Local Data</DialogTitle>
            <DialogDescription>
              This permanently deletes every commitment, focus session, streak, recovery challenge,
              and history record on this device. Export a JSON backup first if you want a copy.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleResetAll()}>
              Confirm Full Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
