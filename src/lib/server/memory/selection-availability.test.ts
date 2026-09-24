import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getMailSelectionRunnerConfig, readLatestMailSelectionResult, readMailSelectionRunStatus } from './selection-runner.js';
const isolated = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (original) => ({ ...await original<typeof import('node:os')>(), homedir: () => isolated.home }));
beforeEach(() => {
 isolated.home = mkdtempSync(join(tmpdir(), 'selection-no-runtime-'));
 vi.stubEnv('HERMES_PYTHON_BIN', '');
 vi.stubEnv('FOLIO_MEMORY_SELECTION_ROOT', join(isolated.home, 'selection'));
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(isolated.home, { recursive: true, force: true }); });
it('reads empty results and status without requiring an installed Hermes runtime', () => {
 expect(readLatestMailSelectionResult()).toBeNull();
 expect(readMailSelectionRunStatus()).toEqual({ state: 'idle' });
 expect(() => getMailSelectionRunnerConfig().pythonBin).toThrow('HERMES_PYTHON_BIN');
});
