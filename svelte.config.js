import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// adapter-node: explicit self-hosted Node target for this local-first app
		// (avoids the adapter-auto "could not detect environment" build warning).
		adapter: adapter()
	}
};

export default config;
