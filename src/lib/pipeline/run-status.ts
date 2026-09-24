import type { IntakeRun } from '../server/mail-intake/state.js';
import type { ModelActivity } from '../server/worker-runner/live-status.js';

export interface PipelineStatus {
 id: string | null; account: string | null; state: string; active: boolean;
 phasesDone: number; phase: string; activity: ModelActivity | null;
 itemsDone: number; itemsTotal: number | null; error: string | null; endedAt: string | null;
}
/** Phase milestones, not a fabricated time or workload estimate. */
export function projectIntake(run: IntakeRun | null, enabled: boolean, live: ModelActivity | null): PipelineStatus {
 const active = run?.state === 'running';
 const phase = run?.phase ?? 'fetch';
 return {
  id:run?.id ?? null, account:run?.account ?? null,
  state:!run ? 'Bereit' : run.state === 'completed' ? 'Abgeschlossen' : run.state === 'failed' ? 'Fehlgeschlagen' : active ? 'Läuft' : enabled ? 'Wartet' : 'Pausiert',
  active, phasesDone:run?.state === 'completed' ? 3 : phase === 'memory'||phase === 'career' ? 2 : phase === 'validate' ? 1 : 0,
  phase:phase === 'fetch' ? 'Maileingang' : phase === 'validate' ? 'Modellprüfung' : phase === 'career' ? 'Bewerbungsabgleich' : 'Memory',
  activity:active ? phase === 'validate' ? live : phase === 'memory'||phase === 'career' ? run?.activity ?? null : null : null,
  itemsDone:run?.items.filter(i=>i.stage === 'done').length ?? 0,
  itemsTotal:!run || phase === 'fetch' ? null : run.items.length,
  error:run?.error ?? null, endedAt:run?.ended_at ?? null
 };
}
