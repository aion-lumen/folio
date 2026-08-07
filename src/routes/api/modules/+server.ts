import { json } from '@sveltejs/kit';
import { getModuleRegistrySnapshot } from '$lib/server/modules/index.js';
import type { RequestHandler } from './$types.js';

/** Public-to-the-local-app registry view. Runtime filesystem paths are deliberately absent. */
export const GET: RequestHandler = async () => json({ modules: getModuleRegistrySnapshot() });
