<script lang="ts">
	let { size = 24 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<rect x="3" y="4" width="18" height="6" rx="1.5" />
	<rect x="3" y="14" width="18" height="6" rx="1.5" />
	<circle cx="7" cy="7" r="0.6" fill="currentColor" />
	<circle cx="7" cy="17" r="0.6" fill="currentColor" />
</svg>
