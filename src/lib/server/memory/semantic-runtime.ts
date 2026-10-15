import { getFolioDbPath, isDemoVaultActive } from '../env.js';
import { embeddingConfig } from './embedding.js';
import { indexMemoryVectors } from './semantic.js';

const REFRESH_MS = 5 * 60_000;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | undefined;
let state: { source?: string; status: 'disabled' | 'excluded' | 'updating' | 'ready' | 'unavailable'; checked_at?: string; indexed?: number; facts?: number } = { status: 'disabled' };

export function semanticMaintenanceStatus() {
 if (isDemoVaultActive()) return { status: 'excluded' as const };
 if (process.env.FOLIO_MEMORY_SEMANTIC !== '1') return { status: 'disabled' as const };
 if (state.source !== getFolioDbPath()) return { status: 'pending' as const };
 const { source: _source, ...publicState } = state;
 return publicState;
}

/** One bounded job at a time. Only the disposable index is written. No chat-model lease needed. */
export function refreshMemoryVectors(): Promise<void> {
 if (running) return running;
 running = (async () => {
  const source = getFolioDbPath();
  if (isDemoVaultActive()) { state = { source, status: 'excluded' }; return; }
  try {
   const config = embeddingConfig();
   if (!config) { state = { source, status: 'disabled' }; return; }
   state = { source, status: 'updating' };
   const result = await indexMemoryVectors(config);
   if (getFolioDbPath() === source) state = { source, status: 'ready', checked_at: new Date().toISOString(), indexed: result.indexed, facts: result.facts };
  } catch {
   state = { source, status: 'unavailable', checked_at: new Date().toISOString() };
  }
 })().finally(() => { running = undefined; });
 return running;
}

/** App-owned maintenance: enabled with semantic retrieval, independent of mail processing. */
export function startMemorySemanticRuntime() {
 if (timer || process.env.FOLIO_MEMORY_SEMANTIC !== '1') return;
 const tick = async () => {
  await refreshMemoryVectors();
  if (timer) timer = setTimeout(tick, REFRESH_MS);
  timer?.unref();
 };
 timer = setTimeout(tick, 5_000);
 timer.unref();
}

export function stopMemorySemanticRuntime() {
 if (timer) clearTimeout(timer);
 timer = undefined;
}
