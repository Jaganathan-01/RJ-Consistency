import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { databaseService } from '../services/databaseService';

beforeEach(async () => {
  await databaseService.clearAllData();
});
