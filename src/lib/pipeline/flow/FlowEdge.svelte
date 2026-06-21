<!--
  2026-06-07 FlowEdge: SVG-Pfeil zwischen zwei FlowNodes.
  lit=true → durchgezogen + farbig (Lane-Farbe via ember-Prop).
  lit=false → gestrichelt grau (default).
-->
<script lang="ts">
	let {
		lit = false,
		ember = false
	}: { lit?: boolean; ember?: boolean } = $props();
</script>

<div class="fedge" class:lit class:ember>
	<svg viewBox="0 0 34 12" preserveAspectRatio="none" aria-hidden="true">
		<path
			d="M0 6 H28"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-dasharray={lit ? '0' : '3 3'}
		/>
		<path
			d="M26 2 L32 6 L26 10"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
</div>

<style>
	.fedge {
		flex: 0 0 34px;
		height: 12px;
		align-self: center;
		margin-top: 22px; /* aufs Icon-Ring-Zentrum ausrichten */
		color: hsl(214 20% 80%);
	}
	.fedge.lit {
		color: hsl(217 80% 52%);
	}
	.fedge.lit.ember {
		color: hsl(22 90% 48%);
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
