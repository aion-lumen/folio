<!--
  2026-06-07 CurItem: aktuelles Item (Mail/Objekt) das gerade
  verarbeitet wird. Spinner + Primary (Subject) + Secondary (ID·Sender).
-->
<script lang="ts">
	let {
		primary,
		secondary
	}: { primary: string; secondary?: string | null } = $props();
</script>

<div class="curmail">
	<span class="spin" aria-hidden="true"></span>
	<div class="cm-txt">
		<div class="prm">{primary}</div>
		{#if secondary}
			<div class="sec">{secondary}</div>
		{/if}
	</div>
</div>

<style>
	.curmail {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 8px 0;
	}
	.spin {
		width: 13px;
		height: 13px;
		border-radius: 50%;
		border: 2px solid hsl(214 24% 88%);
		border-top-color: hsl(217 80% 52%);
		animation: spin 0.9s linear infinite;
		margin-top: 3px;
		flex-shrink: 0;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.cm-txt { flex: 1; min-width: 0; }
	.prm {
		font-size: 13px;
		font-weight: 500;
		color: hsl(222 47% 11%);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sec {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		color: hsl(215 16% 50%);
		margin-top: 1px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
