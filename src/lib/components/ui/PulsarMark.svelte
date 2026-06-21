<script lang="ts">
	let { size = 20, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 64 64"
	fill="none"
	class={className}
	aria-hidden="true"
>
	<!-- Outer diamond frame -->
	<path d="M32 4 L60 32 L32 60 L4 32 Z" stroke="currentColor" stroke-width="0.5" opacity="0.3" />
	<!-- Main circle -->
	<circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="1" fill="none" opacity="0.7" />
	<!-- Pulsar rays -->
	<line x1="32" y1="6" x2="32" y2="58" stroke="currentColor" stroke-width="0.5" opacity="0.4" />
	<line x1="6" y1="32" x2="58" y2="32" stroke="currentColor" stroke-width="0.3" opacity="0.3" />
	<!-- Central glow -->
	<circle cx="32" cy="32" r="3" fill="currentColor" />
	<circle cx="32" cy="32" r="6" fill="currentColor" opacity="0.4" />
	<circle cx="32" cy="32" r="10" fill="currentColor" opacity="0.15" />
</svg>
