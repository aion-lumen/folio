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
	<path d="M6 4v6c0 3 3 4 6 4s6-1 6 4v2" />
	<path d="M15 17l3 3 3-3" />
</svg>
