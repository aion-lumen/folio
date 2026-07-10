// Leuchtfeuer detail view — per-site top paths + referrers, door measurement, GitHub snapshot.
// Read-only from ~/.folio/metrics/ (same source as the Heute-hub card).
import { readLeuchtfeuer } from '$lib/server/leuchtfeuer/reader.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => ({ leuchtfeuer: readLeuchtfeuer() });
