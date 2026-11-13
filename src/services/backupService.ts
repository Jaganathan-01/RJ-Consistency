import type { BackupPayload } from '../types/models';
import { db, databaseService } from './databaseService';

export const BACKUP_SCHEMA_VERSION = 1;

export interface ImportSummary {
  commitmentsImported: number;
  sessionsImported: number;
  completionsImported: number;
  streaksImported: number;
  challengesImported: number;
  freezesImported: number;
  historyImported: number;
}

export const backupService = {
  async exportJson(): Promise<BackupPayload> {
    const [
      commitments,
      focusSessions,
      dailyCompletions,
      streakRecords,
      recoveryChallenges,
      freezeRecords,
      historyEvents,
      settings,
    ] = await Promise.all([
      db.commitments.toArray(),
      db.focusSessions.toArray(),
      db.dailyCompletions.toArray(),
      db.streakRecords.toArray(),
      db.recoveryChallenges.toArray(),
      db.freezeRecords.toArray(),
      db.historyEvents.toArray(),
      db.settings.toArray(),
    ]);

    return {
      app: 'CONSISTENCY',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        commitments,
        focusSessions,
        dailyCompletions,
        streakRecords,
        recoveryChallenges,
        freezeRecords,
        historyEvents,
        settings,
      },
    };
  },

  validateBackup(raw: unknown): { valid: true; payload: BackupPayload } | { valid: false; error: string } {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Backup file must be a JSON object.' };
    }
    const obj = raw as Partial<BackupPayload>;
    if (obj.app !== 'CONSISTENCY') {
      return { valid: false, error: 'Invalid backup signature: expected CONSISTENCY export file.' };
    }
    if (typeof obj.schemaVersion !== 'number' || obj.schemaVersion > BACKUP_SCHEMA_VERSION) {
      return { valid: false, error: 'Unsupported backup schema version.' };
    }
    if (!obj.data || typeof obj.data !== 'object') {
      return { valid: false, error: 'Backup file is missing data payload.' };
    }

    const requiredArrays: Array<keyof BackupPayload['data']> = [
      'commitments',
      'focusSessions',
      'dailyCompletions',
      'streakRecords',
      'recoveryChallenges',
      'freezeRecords',
      'historyEvents',
      'settings',
    ];
    for (const key of requiredArrays) {
      if (!Array.isArray(obj.data[key])) {
        return { valid: false, error: `Backup payload is missing array "${key}".` };
      }
    }

    return { valid: true, payload: obj as BackupPayload };
  },

  /**
   * Imports a validated backup.
   * mode = 'merge' skips existing record IDs (never silently overwrites existing data).
   * mode = 'replace' clears existing database only after explicit user confirmation.
   */
  async importBackup(
    payload: BackupPayload,
    mode: 'merge' | 'replace'
  ): Promise<ImportSummary> {
    if (mode === 'replace') {
      await databaseService.clearAllData();
    }

    const summary: ImportSummary = {
      commitmentsImported: 0,
      sessionsImported: 0,
      completionsImported: 0,
      streaksImported: 0,
      challengesImported: 0,
      freezesImported: 0,
      historyImported: 0,
    };

    await db.transaction(
      'rw',
      [
        db.commitments,
        db.focusSessions,
        db.dailyCompletions,
        db.streakRecords,
        db.recoveryChallenges,
        db.freezeRecords,
        db.historyEvents,
        db.settings,
      ],
      async () => {
        const existingCmtIds = new Set((await db.commitments.toCollection().primaryKeys()) as string[]);
        const existingSesIds = new Set((await db.focusSessions.toCollection().primaryKeys()) as string[]);
        const existingCmpIds = new Set((await db.dailyCompletions.toCollection().primaryKeys()) as string[]);
        const existingStrIds = new Set((await db.streakRecords.toCollection().primaryKeys()) as string[]);
        const existingRecIds = new Set((await db.recoveryChallenges.toCollection().primaryKeys()) as string[]);
        const existingFrzIds = new Set((await db.freezeRecords.toCollection().primaryKeys()) as string[]);
        const existingHisIds = new Set((await db.historyEvents.toCollection().primaryKeys()) as string[]);

        const newCmts = payload.data.commitments.filter((c) => !existingCmtIds.has(c.id));
        const newSes = payload.data.focusSessions.filter((s) => !existingSesIds.has(s.id));
        const newCmp = payload.data.dailyCompletions.filter((d) => !existingCmpIds.has(d.id));
        const newStr = payload.data.streakRecords.filter((s) => !existingStrIds.has(s.id));
        const newRec = payload.data.recoveryChallenges.filter((r) => !existingRecIds.has(r.id));
        const newFrz = payload.data.freezeRecords.filter((f) => !existingFrzIds.has(f.id));
        const newHis = payload.data.historyEvents.filter((h) => !existingHisIds.has(h.id));

        if (newCmts.length) await db.commitments.bulkPut(newCmts);
        if (newSes.length) await db.focusSessions.bulkPut(newSes);
        if (newCmp.length) await db.dailyCompletions.bulkPut(newCmp);
        if (newStr.length) await db.streakRecords.bulkPut(newStr);
        if (newRec.length) await db.recoveryChallenges.bulkPut(newRec);
        if (newFrz.length) await db.freezeRecords.bulkPut(newFrz);
        if (newHis.length) await db.historyEvents.bulkPut(newHis);

        if (mode === 'replace' && payload.data.settings.length > 0) {
          await db.settings.put(payload.data.settings[0]);
        }

        summary.commitmentsImported = newCmts.length;
        summary.sessionsImported = newSes.length;
        summary.completionsImported = newCmp.length;
        summary.streaksImported = newStr.length;
        summary.challengesImported = newRec.length;
        summary.freezesImported = newFrz.length;
        summary.historyImported = newHis.length;
      }
    );

    return summary;
  },
};
