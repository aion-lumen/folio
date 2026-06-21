<!--
  Mobile 1a (2026-05-30): tiny header row. App name + current tab + user avatar.
-->
<script lang="ts">
	let {
		where,
		userInitials
	}: {
		where: string;
		userInitials: string;
	} = $props();
</script>

<header class="head">
	<span class="crest" aria-hidden="true"></span>
	<span class="name">Folio</span>
	<span class="where">{where}</span>
	<span class="me"><span class="av">{userInitials}</span></span>
</header>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--wf-line, hsl(214 20% 88%));
		background: white;
	}
	.crest {
		width: 18px;
		height: 18px;
		border-radius: 5px;
		background: var(--color-lumen-corona);
	}
	.name {
		font-weight: 600;
		font-size: 13px;
		letter-spacing: -0.02em;
	}
	.where {
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--wf-muted, hsl(215 16% 50%));
		margin-left: 4px;
	}
	.me {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.av {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: hsl(220 35% 80%);
		font-size: 10px;
		color: hsl(222 47% 22%);
		font-weight: 500;
	}
</style>
