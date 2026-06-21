<script lang="ts">
	import { chatStore } from '$lib/stores/chat.svelte.js';
</script>

{#if chatStore.context.selectedItem}
	<p class="text-xs text-muted-foreground truncate max-w-48">
		{chatStore.context.selectedItem}
	</p>
{:else}
	<p class="text-xs text-muted-foreground">
		View: {chatStore.context.view}
	</p>
{/if}
