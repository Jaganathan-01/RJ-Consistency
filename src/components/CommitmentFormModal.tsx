import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
import { COLOR_OPTIONS, CommitmentIcon, ICON_OPTIONS } from './CommitmentIcon';
import { useAppStore } from '../store/useAppStore';
import type { Commitment, ScheduleType, StrictnessLevel } from '../types/models';
import { WEEKDAY_LABELS } from '../utils/dateUtils';

interface CommitmentFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCommitment?: Commitment | null;
}

export function CommitmentFormModal({
  open,
  onOpenChange,
  editingCommitment,
}: CommitmentFormModalProps) {
  const { settings, todayDateStr, createCommitment, updateCommitment } = useAppStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Discipline');
  const [icon, setIcon] = useState('Target');
  const [color, setColor] = useState<string>(COLOR_OPTIONS[0]);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(20);
  const [minimumDurationMinutes, setMinimumDurationMinutes] = useState(10);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState(todayDateStr);
  const [endDate, setEndDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('08:00');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('07:50');
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [strictness, setStrictness] = useState<StrictnessLevel>(settings.defaultStrictness);

  // Freeze & Recovery
  const [freezeEnabled, setFreezeEnabled] = useState(true);
  const [gracePeriodDays, setGracePeriodDays] = useState(settings.defaultGracePeriodDays);
  const [maxFrozenDays, setMaxFrozenDays] = useState(settings.defaultMaxFrozenDays);
  const [freezeDurationDays, setFreezeDurationDays] = useState(settings.defaultFreezeDurationDays);
  const [recoveryEnabled, setRecoveryEnabled] = useState(true);
  const [recoveryDeadlineDays, setRecoveryDeadlineDays] = useState(
    settings.defaultRecoveryDeadlineDays
  );
  const [recoveryMultiplier, setRecoveryMultiplier] = useState(
    settings.defaultRecoveryMultiplier
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingCommitment) {
      setName(editingCommitment.name);
      setDescription(editingCommitment.description);
      setCategory(editingCommitment.category);
      setIcon(editingCommitment.icon);
      setColor(editingCommitment.color);
      setTargetDurationMinutes(editingCommitment.targetDurationMinutes);
      setMinimumDurationMinutes(editingCommitment.minimumDurationMinutes);
      setScheduleType(editingCommitment.schedule.type);
      setWeekdays(editingCommitment.schedule.weekdays);
      setStartDate(editingCommitment.schedule.startDate);
      setEndDate(editingCommitment.schedule.endDate ?? '');
      setPreferredTime(editingCommitment.preferredTime);
      setReminderEnabled(editingCommitment.reminderEnabled);
      setReminderTime(editingCommitment.reminderTime || '08:00');
      setAllowMultiple(editingCommitment.allowMultipleSessionsPerDay);
      setStrictness(editingCommitment.strictness);
      setFreezeEnabled(editingCommitment.freezeSettings.enabled);
      setGracePeriodDays(editingCommitment.freezeSettings.gracePeriodDays);
      setMaxFrozenDays(editingCommitment.freezeSettings.maxFrozenDays);
      setFreezeDurationDays(editingCommitment.freezeSettings.freezeDurationDays);
      setRecoveryEnabled(editingCommitment.recoverySettings.enabled);
      setRecoveryDeadlineDays(editingCommitment.recoverySettings.recoveryDeadlineDays);
      setRecoveryMultiplier(editingCommitment.recoverySettings.recoveryMultiplier);
    } else {
      setName('');
      setDescription('');
      setCategory('Discipline');
      setIcon('Target');
      setColor(COLOR_OPTIONS[0]);
      setTargetDurationMinutes(20);
      setMinimumDurationMinutes(10);
      setScheduleType('daily');
      setWeekdays([1, 2, 3, 4, 5]);
      setStartDate(todayDateStr);
      setEndDate('');
      setPreferredTime('08:00');
      setReminderEnabled(true);
      setReminderTime('07:50');
      setAllowMultiple(true);
      setStrictness(settings.defaultStrictness);
      setFreezeEnabled(true);
      setGracePeriodDays(settings.defaultGracePeriodDays);
      setMaxFrozenDays(settings.defaultMaxFrozenDays);
      setFreezeDurationDays(settings.defaultFreezeDurationDays);
      setRecoveryEnabled(true);
      setRecoveryDeadlineDays(settings.defaultRecoveryDeadlineDays);
      setRecoveryMultiplier(settings.defaultRecoveryMultiplier);
    }
  }, [open, editingCommitment, todayDateStr, settings]);

  const toggleWeekday = (dayIdx: number) => {
    setWeekdays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Commitment name is required.');
      return;
    }
    if (scheduleType === 'custom' && weekdays.length === 0) {
      setError('Select at least one weekday for a custom schedule.');
      return;
    }
    if (targetDurationMinutes < 1) {
      setError('Target duration must be at least 1 minute.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || 'General',
        icon,
        color,
        targetDurationMinutes,
        minimumDurationMinutes: Math.min(targetDurationMinutes, Math.max(1, minimumDurationMinutes)),
        schedule: {
          type: scheduleType,
          weekdays: scheduleType === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : weekdays,
          startDate,
          endDate: endDate || undefined,
        },
        preferredTime,
        reminderTime: reminderEnabled ? reminderTime : '',
        reminderEnabled,
        allowMultipleSessionsPerDay: allowMultiple,
        strictness,
        freezeSettings: {
          enabled: freezeEnabled,
          gracePeriodDays: strictness === 'STRICT' ? 0 : Math.max(0, gracePeriodDays),
          maxFrozenDays: Math.max(1, maxFrozenDays),
          freezeDurationDays: Math.max(1, freezeDurationDays),
        },
        recoverySettings: {
          enabled: recoveryEnabled,
          recoveryDeadlineDays: Math.max(1, recoveryDeadlineDays),
          recoveryMultiplier: Math.max(1, recoveryMultiplier),
        },
      };

      if (editingCommitment) {
        await updateCommitment(editingCommitment.id, payload);
      } else {
        await createCommitment(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save commitment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingCommitment ? 'Edit Commitment' : 'New Commitment'}</DialogTitle>
          <DialogDescription>
            Configure schedule, discipline strictness, streak freeze rules, and recovery targets.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Commitment Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Meditation, DSA Practice"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Mindfulness, Engineering"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Define what counts as genuine focus for this commitment..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
            />
          </div>

          {/* Icon and Color */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Icon
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_OPTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-label={`Select ${key} icon`}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                      icon === key
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CommitmentIcon name={key} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Accent Color
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColor(hex)}
                    aria-label={`Select color ${hex}`}
                    className={`h-9 w-9 rounded-full border-2 transition-transform cursor-pointer ${
                      color === hex ? 'scale-110 border-white ring-2 ring-emerald-500' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Daily Target Duration (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={720}
                value={targetDurationMinutes}
                onChange={(e) => setTargetDurationMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Minimum Qualifying Duration (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={targetDurationMinutes}
                value={minimumDurationMinutes}
                onChange={(e) => setMinimumDurationMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm tabular-nums text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Schedule Frequency
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                {(['daily', 'custom'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setScheduleType(t)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                      scheduleType === t
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {t === 'daily' ? 'Every Day' : 'Custom Weekdays'}
                  </button>
                ))}
              </div>
            </div>

            {scheduleType === 'custom' && (
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((label, idx) => {
                  const selected = weekdays.includes(idx);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(idx)}
                      className={`min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        selected
                          ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm tabular-nums text-slate-900 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm tabular-nums text-slate-900 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Discipline Personality */}
          <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Discipline Personality
            </span>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    id: 'STRICT',
                    title: 'Strict',
                    desc: 'Full target required. Any missed day freezes streak and triggers recovery.',
                  },
                  {
                    id: 'NORMAL',
                    title: 'Normal',
                    desc: 'Configurable grace period before freeze & recovery challenge activate.',
                  },
                  {
                    id: 'FLEXIBLE',
                    title: 'Flexible',
                    desc: 'Minimum duration qualifies daily. Partial progress counted cleanly.',
                  },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setStrictness(mode.id)}
                  className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                    strictness === mode.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="text-sm font-semibold">{mode.title}</div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {mode.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Timing & Reminders */}
          <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3 dark:border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Preferred Time
              </label>
              <input
                type="time"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums text-slate-900 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Reminder Time
              </label>
              <input
                type="time"
                value={reminderTime}
                disabled={!reminderEnabled}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums text-slate-900 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between sm:flex-col sm:items-start sm:justify-center gap-1.5">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Daily Reminder
              </span>
              <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
            </div>
          </div>

          {/* Freeze & Recovery Config */}
          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Multiple Sessions Per Day</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Accumulate focus duration across multiple sessions in one day.
                </div>
              </div>
              <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Streak Freeze Protection</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Preserve prior streak during missed days until recovery or expiry.
                </div>
              </div>
              <Switch checked={freezeEnabled} onCheckedChange={setFreezeEnabled} />
            </div>

            {freezeEnabled && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Grace Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={7}
                    disabled={strictness === 'STRICT'}
                    value={strictness === 'STRICT' ? 0 : gracePeriodDays}
                    onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/70"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Max Frozen Days
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={maxFrozenDays}
                    onChange={(e) => setMaxFrozenDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900/70"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Freeze Duration (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={freezeDurationDays}
                    onChange={(e) => setFreezeDurationDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900/70"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-sm font-medium">Recovery Challenge</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Require a scaled focus session to restore a frozen streak.
                </div>
              </div>
              <Switch checked={recoveryEnabled} onCheckedChange={setRecoveryEnabled} />
            </div>

            {recoveryEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Recovery Multiplier (e.g. 1.35x)
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    min={1.05}
                    max={3}
                    value={recoveryMultiplier}
                    onChange={(e) => setRecoveryMultiplier(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900/70"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Recovery Deadline (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={recoveryDeadlineDays}
                    onChange={(e) => setRecoveryDeadlineDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm tabular-nums dark:border-slate-800 dark:bg-slate-900/70"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingCommitment ? 'Save Changes' : 'Create Commitment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
