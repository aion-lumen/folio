<!--
  Panel-C Werkstatt §1.1: Mail-Identitäts-Zeile (Mono xs, muted) + Subject
  (13.5px weight-500, bewusst gedämpft) + Close-Button.
-->
<script lang="ts">
	import type { UnifiedMailRow } from '$lib/stores/mailQueue.svelte.js';
	import { ACCOUNTS, ACCOUNT_CLASS } from '$lib/util/mail-account.js';

	let { row, onClose }: { row: UnifiedMailRow; onClose: () => void } = $props();

	function fmtDate(iso: string): string {
		try {
			const d = new Date(iso);
			const day = d.getDate();
			const monthNames = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
			const month = monthNames[d.getMonth()];
			const hh = String(d.getHours()).padStart(2, '0');
			const mm = String(d.getMinutes()).padStart(2, '0');
			return `${day}. ${month} · ${hh}:${mm}`;
		} catch {
			return iso;
		}
	}
</script>

<header class="panel-header">
	<div class="identity">
		<span class="dot {ACCOUNT_CLASS[row.account]?.dot ?? ''}"></span>
		<span class="meta">
			{(ACCOUNTS[row.account]?.label ?? row.account).toUpperCase()} · {fmtDate(row.received_at)} · {row.from_addr}
		</span>
		<button
			type="button"
			class="close-btn"
			aria-label="Schließen"
			onclick={onClose}
		>✕</button>
	</div>
	<div class="subject" title={row.subject}>{row.subject}</div>
</header>

<style>
	.panel-header {
		padding: 12px 16px 10px;
		border-bottom: 1px solid var(--color-border);
	}
	.identity {
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-muted-foreground);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		flex-shrink: 0;
	}
	.meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}
	.close-btn {
		margin-left: auto;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 14px;
		padding: 2px 6px;
		border-radius: 4px;
		transition: background 120ms, color 120ms;
	}
	.close-btn:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.subject {
		margin-top: 6px;
		font-size: 13.5px;
		font-weight: 500;
		color: var(--color-muted-foreground);
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
</style>
