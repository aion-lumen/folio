import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { error } from '@sveltejs/kit';
import { getVaultPath } from '$lib/server/env.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get('name');
	if (!name) throw error(400, 'name required');

	const imagesDir = join(getVaultPath(), '_campaign', 'images');

	// Support both "chapter_1.png" and "chapter 1.png" naming
	const normalized = name.replace(/_/g, ' ');
	const files = await readdir(imagesDir).catch(() => []);
	const match = files.find(
		(f) => f === name || f === normalized || f.toLowerCase() === name.toLowerCase()
	);

	if (!match) throw error(404, `Image ${name} not found`);

	const data = await readFile(join(imagesDir, match));
	return new Response(data, {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' }
	});
};
