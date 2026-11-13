import type { Commitment, RecoveryChallenge, UserSettings } from '../types/models';
import { getLocalTimeHHMM } from '../utils/dateUtils';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

const REMINDER_SENT_KEY = 'consistency_reminders_sent_v1';

function getSentMarkers(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(REMINDER_SENT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function markReminderSent(key: string): void {
  try {
    const current = getSentMarkers();
    const keys = Object.keys(current);
    if (keys.length > 100) {
      // Prune old keys
      const next: Record<string, boolean> = {};
      for (const k of keys.slice(-40)) next[k] = true;
      next[key] = true;
      localStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(next));
      return;
    }
    current[key] = true;
    localStorage.setItem(REMINDER_SENT_KEY, JSON.stringify(current));
  } catch {
    // Ignore storage quota errors
  }
}

export const notificationService = {
  getPermissionStatus(): NotificationPermissionState {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  },

  async requestPermission(): Promise<NotificationPermissionState> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch {
      return 'denied';
    }
  },

  async showNotification(title: string, body: string, tag?: string): Promise<boolean> {
    if (this.getPermissionStatus() !== 'granted') return false;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag,
          });
          return true;
        }
      }
      new Notification(title, { body, icon: '/pwa-192x192.png', tag });
      return true;
    } catch {
      return false;
    }
  },

  playCompletionTone(soundEnabled: boolean, vibrationEnabled: boolean): void {
    if (vibrationEnabled && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([120, 60, 180]);
      } catch {
        // Ignore
      }
    }
    if (!soundEnabled || typeof window === 'undefined') return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5 crisp chime
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0.001, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.38);
      });
    } catch {
      // Ignore audio policy errors
    }
  },

  async checkScheduledReminders(params: {
    settings: UserSettings;
    todayDateStr: string;
    commitments: Commitment[];
    completedIdsToday: Set<string>;
    activeChallenges: RecoveryChallenge[];
  }): Promise<void> {
    const { settings, todayDateStr, commitments, completedIdsToday, activeChallenges } = params;
    if (!settings.notificationSettings.enabled || this.getPermissionStatus() !== 'granted') {
      return;
    }

    const currentHHMM = getLocalTimeHHMM(Date.now(), settings.timezone);
    const sent = getSentMarkers();

    // 1. Per-commitment daily reminders
    for (const c of commitments) {
      if (c.status !== 'ACTIVE' || !c.reminderEnabled || !c.reminderTime) continue;
      if (completedIdsToday.has(c.id)) continue;
      const marker = `rem_${todayDateStr}_${c.id}_${c.reminderTime}`;
      if (!sent[marker] && currentHHMM >= c.reminderTime) {
        markReminderSent(marker);
        await this.showNotification(
          `${c.name} — ${c.targetDurationMinutes}m target`,
          `Scheduled for ${c.preferredTime || c.reminderTime}. Start your focus session to protect your streak.`,
          marker
        );
      }
    }

    // 2. Recovery challenge reminder (once per day when active)
    if (settings.notificationSettings.recoveryRemindersEnabled && activeChallenges.length > 0) {
      const marker = `rec_rem_${todayDateStr}`;
      if (!sent[marker]) {
        markReminderSent(marker);
        const first = activeChallenges[0];
        const cName = commitments.find((c) => c.id === first.commitmentId)?.name ?? 'Commitment';
        await this.showNotification(
          `Recovery Challenge Active`,
          `Complete a ${first.requiredDurationMinutes}-minute ${cName} session before ${first.deadline} to restore your ${first.previousStreak}-day streak.`,
          marker
        );
      }
    }

    // 3. Daily summary notification
    if (
      settings.notificationSettings.dailySummaryEnabled &&
      settings.notificationSettings.dailySummaryTime &&
      currentHHMM >= settings.notificationSettings.dailySummaryTime
    ) {
      const marker = `summary_${todayDateStr}`;
      if (!sent[marker]) {
        markReminderSent(marker);
        const activeCount = commitments.filter((c) => c.status === 'ACTIVE').length;
        const doneCount = commitments.filter(
          (c) => c.status === 'ACTIVE' && completedIdsToday.has(c.id)
        ).length;
        await this.showNotification(
          'Daily Consistency Summary',
          `${doneCount} of ${activeCount} commitments completed today.`,
          marker
        );
      }
    }
  },
};
