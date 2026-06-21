// F.7 — Worker-Run Client-Store: form-state + active-run-state + log-buffer + SSE-subscribe.
// F.8 BUG-I1: triggeredBy field + auto-resubscribe nach Auto-Trigger
// F.8 BUG-I3: Summary-Toast statt Per-Mail (mailQueue defers toast to workerRun-end)
// F.8 BUG-J: Defensive Pipeline-End-Merge — Worker→Auto-Validator-Transition
//   produziert einen einzelnen kombinierten Sticky-Toast + ein invalidateAll am
//   Ende der ganzen Pipeline (Direktive D: zwei Runs, ein Toast). Plus Diagnose-Traces.

import { invalidateAll } from '$app/navigation';
import { toastStore } from './toast.svelte.js';
import { tlog, ttrace } from '$lib/util/debug-trace.js';

// F.8 BUG-J: wrapper für invalidateAll mit Source-Tag
function invalidate(source: string): Promise<void> {
	ttrace('invalidateAll', { source });
	return invalidateAll();
}

export interface RunLogLine {
	line: string;
	t: string;
	stream: 'stdout' | 'stderr';
}

export interface ActiveRunInfo {
	uuid: string;
	pid: number;
	account: string;
	board: string;
	mode: 'learning' | 'silent' | 'validator';
	trancheSize: number;
	startedAt: string;
	triggeredBy: 'manual' | 'auto'; // F.8 BUG-I1
}

// F.7-Bugfix: last-ended-run für Error-Summary-Banner nach exit.
export interface LastEndedRun {
	uuid: string;
	status: 'completed' | 'failed' | 'cancelled';
	exitCode: number | null;
	errorSummary: string | null;
	mailsProcessed: number;
	endedAt: string;
	account: string;
	mode: 'learning' | 'silent' | 'validator';
}

class WorkerRunStore {
	// Form-State (Cleanup 2026-05-27: board nicht mehr im Form; manager generiert intern)
	account = $state<'yahoo' | 'gmail' | 'mirhamed'>('yahoo');
	mode = $state<'learning' | 'silent'>('silent');
	// 2026-06-11 Bauteil Pipeline-Findings (F4): default 30 per directive.
	// Pipeline-Page hydrates from localStorage on mount.
	trancheSize = $state<number>(30);

	// Active-Run-State
	activeRun = $state<ActiveRunInfo | null>(null);
	logs = $state<RunLogLine[]>([]);
	error = $state<string | null>(null);
	submitting = $state(false);
	lastEndedRun = $state<LastEndedRun | null>(null);
	autoScroll = $state(true); // F.7-Bugfix: stop auto-scroll on run-end

	// F.8 BUG-J — Pipeline-End-Merge State.
	// `pipelineInTransition` ist true zwischen Worker-End und Auto-Validator-End (oder
	// Auto-Trigger-Probe-Timeout). Während dieser Zeit unterdrücken wir invalidateAll
	// + Toast und akkumulieren Stats. Am Ende ein einziger Summary-Toast + invalidateAll.
	pipelineInTransition = $state(false);
	private pendingPipelineStats: {
		workerMailsProcessed: number;
		workerAccount: string;
	} | null = null;

	// Setter so mailQueue.SSE (und andere Konsumenten) "transition" als Skip-Trigger
	// nutzen können, auch wenn activeRun temporär null ist zwischen Worker und Validator.
	get pipelineBusy(): boolean {
		return this.activeRun != null || this.pipelineInTransition;
	}

	private eventSource: EventSource | null = null;

	private setLogs(next: RunLogLine[]) {
		// Cap client-side at 800 to avoid Memory blow
		this.logs = next.length > 800 ? next.slice(-800) : next;
	}

	dismissLastEnded(): void {
		this.lastEndedRun = null;
	}

	async submit(): Promise<void> {
		this.error = null;
		this.lastEndedRun = null;
		this.autoScroll = true;
		this.submitting = true;
		try {
			const res = await fetch('/api/worker/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					account: this.account,
					mode: this.mode,
					tranche_size: this.trancheSize
				})
			});
			if (res.status === 409) {
				const data = await res.json().catch(() => ({}));
				this.error = `Busy: another run is active (${data.current_run?.uuid ?? '?'})`;
				return;
			}
			if (!res.ok) {
				const text = await res.text().catch(() => res.statusText);
				this.error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
				return;
			}
			const { run_uuid } = await res.json();
			await this.fetchStatus();
			// 2026-06-11 Pipeline-Findings live-reactivity fix: page-loader
			// needs invalidate so data.activeRun fills and the 5s polling
			// effect on /pipeline starts. Without this the entire live UI
			// stays frozen until manual refresh.
			await invalidate('workerRun.submit');
			this.subscribeLogs(run_uuid);
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.submitting = false;
		}
	}

	async cancel(): Promise<void> {
		if (!this.activeRun) return;
		try {
			await fetch(`/api/worker/run/${this.activeRun.uuid}`, { method: 'DELETE' });
		} catch {
			// ignore
		}
	}

	async fetchStatus(): Promise<void> {
		try {
			const res = await fetch('/api/worker/run');
			if (res.ok) {
				const data = await res.json();
				const prev = this.activeRun;
				this.activeRun = data.active ?? null;
				if (prev?.uuid !== this.activeRun?.uuid) {
					tlog('activeRun.change', {
						prev: prev ? { uuid: prev.uuid, mode: prev.mode, triggeredBy: prev.triggeredBy } : null,
						next: this.activeRun
							? { uuid: this.activeRun.uuid, mode: this.activeRun.mode, triggeredBy: this.activeRun.triggeredBy }
							: null
					});
				}
			}
		} catch {
			// ignore
		}
	}

	subscribeLogs(uuid: string): void {
		this.disconnectLogs();
		this.setLogs([]);
		const url = `/api/worker/run/${uuid}/log`;
		try {
			this.eventSource = new EventSource(url);
		} catch {
			return;
		}
		this.eventSource.onmessage = (e) => {
			try {
				const parsed = JSON.parse(e.data);
				if (parsed.event === 'end') {
					tlog('sse.end', { uuid, mode: this.activeRun?.mode, parsed });
					this.handleRunEnd(uuid, parsed);
					return;
				}
				if (parsed.line !== undefined) {
					this.setLogs([...this.logs, parsed as RunLogLine]);
				}
			} catch {
				// ignore parse errors
			}
		};
		this.eventSource.onerror = () => {
			tlog('sse.onerror', { uuid, activeRun: this.activeRun?.uuid ?? null });
			// SSE will auto-reconnect; but if run ended, server closes
			this.fetchStatus().then(() => {
				if (!this.activeRun && !this.pipelineInTransition) {
					this.disconnectLogs();
					invalidate('workerRun.sse.onerror');
				}
			});
		};
	}

	// F.8 BUG-J — Centralized end-handler implementing Pipeline-End-Merge.
	// For silent-worker-end with auto-trigger eligibility we defer the toast +
	// invalidateAll until the auto-validator also completes (or fails to start).
	// For validator-end we either flush the combined summary OR emit a regular
	// solo-summary when no prior worker is pending.
	private handleRunEnd(streamUuid: string, parsed: Record<string, unknown>): void {
		const active = this.activeRun;
		const endedMode = (active?.mode ?? 'silent') as 'learning' | 'silent' | 'validator';
		const endedAccount = active?.account ?? 'unknown';
		const triggeredBy = active?.triggeredBy ?? 'manual';
		const mailsProcessed: number = (parsed.mails_processed as number) ?? 0;
		const endStatus: 'completed' | 'failed' | 'cancelled' =
			(parsed.status as 'completed' | 'failed' | 'cancelled') ?? 'failed';

		this.lastEndedRun = {
			uuid: active?.uuid ?? streamUuid,
			status: endStatus,
			exitCode: (parsed.exit_code as number | null) ?? null,
			errorSummary: (parsed.error_summary as string | null) ?? null,
			mailsProcessed,
			endedAt: new Date().toISOString(),
			account: endedAccount,
			mode: endedMode
		};
		this.autoScroll = false;
		this.disconnectLogs();
		this.activeRun = null;

		const isWorker = endedMode === 'silent' || endedMode === 'learning';
		const isValidator = endedMode === 'validator';
		const autoTriggerEligible =
			isWorker &&
			endedMode === 'silent' &&
			endStatus === 'completed' &&
			mailsProcessed > 0;

		if (autoTriggerEligible) {
			// Defer toast + invalidateAll. Pipeline-End-Merge takes over.
			this.pipelineInTransition = true;
			this.pendingPipelineStats = {
				workerMailsProcessed: mailsProcessed,
				workerAccount: endedAccount
			};
			tlog('pipeline.transition.start', this.pendingPipelineStats);
			this.maybeResubscribeForAutoTrigger();
			return;
		}

		if (isValidator && this.pendingPipelineStats) {
			// Validator-end completes a Worker→Auto-Validator pipeline. Emit combined summary.
			const pend = this.pendingPipelineStats;
			this.pendingPipelineStats = null;
			this.pipelineInTransition = false;
			const validatorLabel =
				endStatus === 'completed' && mailsProcessed > 0
					? `, Validator: ${mailsProcessed} Opinion${mailsProcessed === 1 ? '' : 's'}`
					: endStatus === 'failed'
						? `, Validator fehlgeschlagen`
						: '';
			const label = `Worker: ${pend.workerMailsProcessed} neue Mail${pend.workerMailsProcessed === 1 ? '' : 's'} (${pend.workerAccount})${validatorLabel}`;
			tlog('pipeline.flush.combined', { label, triggeredBy });
			toastStore.show(label, 'sticky');
			invalidate('workerRun.pipeline.flush.combined');
			return;
		}

		// Standard solo-summary branch (manual validator, learning-mode worker, failed/cancelled runs)
		if (endStatus === 'completed' && mailsProcessed > 0) {
			const label = isValidator
				? `Validator: ${mailsProcessed} Opinion${mailsProcessed === 1 ? '' : 's'} geschrieben`
				: `Worker: ${mailsProcessed} neue Mail${mailsProcessed === 1 ? '' : 's'} klassifiziert (${endedAccount})`;
			toastStore.show(label, 'sticky');
		} else if (endStatus === 'failed') {
			toastStore.show(
				`${isValidator ? 'Validator' : 'Worker'}-Run fehlgeschlagen — siehe Log`,
				'sticky'
			);
		}
		invalidate('workerRun.solo-end');
	}

	// F.8 BUG-I1 + BUG-J — When a silent-Worker-Run ends, the server schedules an auto-
	// Validator via setImmediate. There is a microtask-gap between worker-close
	// and validator-spawn. We poll fetchStatus a few times so the UI can attach
	// to the new run without the user re-clicking. If no auto-run appears within
	// the budget, we flush the pending pipeline-summary (Worker-only).
	private async maybeResubscribeForAutoTrigger(): Promise<void> {
		const delaysMs = [120, 300, 600];
		for (const delay of delaysMs) {
			await new Promise((r) => setTimeout(r, delay));
			await this.fetchStatus();
			if (this.activeRun && this.activeRun.triggeredBy === 'auto') {
				tlog('pipeline.transition.resubscribed', { uuid: this.activeRun.uuid });
				this.autoScroll = true;
				this.subscribeLogs(this.activeRun.uuid);
				// 2026-06-11 Pipeline-Findings live-reactivity fix: page-loader
				// still holds the ended silent-run as data.activeRun. Without
				// invalidate the polling effect would drop on the next tick
				// and statusLabel/FlowDiagram-glow would stay "Worker" until
				// manual refresh, even though the auto-validator is now live.
				await invalidate('workerRun.auto-trigger.resubscribed');
				// pipelineInTransition stays true until validator-end fires
				return;
			}
			if (this.activeRun) {
				// Manual run started — abandon pipeline-merge, treat as solo.
				// flushPendingPipelineAsSoloWorker calls invalidate itself, but
				// emit an early one too so the new manual run's activeRun
				// reaches the loader before the toast race.
				await invalidate('workerRun.auto-trigger.manual');
				this.flushPendingPipelineAsSoloWorker();
				return;
			}
		}
		// Timeout: no auto-validator started. Flush Worker-only summary.
		this.flushPendingPipelineAsSoloWorker();
	}

	private flushPendingPipelineAsSoloWorker(): void {
		const pend = this.pendingPipelineStats;
		this.pendingPipelineStats = null;
		this.pipelineInTransition = false;
		if (!pend) return;
		tlog('pipeline.flush.worker-only', pend);
		const label = `Worker: ${pend.workerMailsProcessed} neue Mail${pend.workerMailsProcessed === 1 ? '' : 's'} klassifiziert (${pend.workerAccount})`;
		toastStore.show(label, 'sticky');
		invalidate('workerRun.pipeline.flush.worker-only');
	}

	disconnectLogs(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
	}

}

export const workerRunStore = new WorkerRunStore();
