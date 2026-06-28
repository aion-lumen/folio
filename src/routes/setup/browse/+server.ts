import { json, error } from '@sveltejs/kit';
import { readdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import type { RequestHandler } from './$types.js';

// Read-only directory browser for the setup wizard. Folio is a plain browser
// SvelteKit app (no Electron/Tauri), and the browser's File System Access API
// yields a sandbox handle — not the server-side absolute path the vault reader
// needs. So directory selection is served here: Node lists folders, the UI
// renders a picker, and the chosen ABSOLUTE path flows to /setup/existing.
//
// Single-user local tool: listing the user's own directories is the intended
// capability. We only ever LIST directories (never read file contents), and a
// folder is flagged as a vault when it contains _campaign/campaign.md.

async function isVault(dir: string): Promise<boolean> {
	try {
		await access(join(dir, '_campaign', 'campaign.md'));
		return true;
	} catch {
		return false;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const home = process.env.HOME!;
	const raw = url.searchParams.get('path');
	// Default to the user's home dir; expand a leading ~.
	const path = (raw && raw.trim() ? raw.trim() : home).replace(/^~/, home);

	let dirents;
	try {
		dirents = await readdir(path, { withFileTypes: true });
	} catch {
		throw error(400, JSON.stringify({ message: `Verzeichnis nicht lesbar: ${path}` }));
	}

	const dirs = dirents
		.filter((d) => d.isDirectory() && !d.name.startsWith('.'))
		.map((d) => d.name)
		.sort((a, b) => a.localeCompare(b, 'de'));

	const entries = await Promise.all(
		dirs.map(async (name) => {
			const full = join(path, name);
			return { name, path: full, isVault: await isVault(full) };
		})
	);

	const parent = dirname(path);
	return json({
		path,
		parent: parent === path ? null : parent, // null at filesystem root
		isVault: await isVault(path),
		entries
	});
};
