/**
 * Public-release screenshot capture — runs against the isolated demo-server
 * on port 5174 (NOT the real folio dev server on 5173).
 *
 * Prerequisites (see docs/quickstart.md):
 *   1. (multi-agent) make demo-force      — seed isolated demo-DBs
 *   2. (folio)       bash scripts/demo-server.sh
 *   3. (folio)       npx playwright test tests/e2e/screenshots.spec.ts
 *
 * Output: docs/screenshots/release/<NN>-<area>-<YYYYMMDD>.png
 *
 * Eight shots per directive-mock-data-screenshots.md §3:
 *   1. Mail-Queue with filters visible
 *   2. Pipeline idle (model panel dimmed, last run visible)
 *   3. Pipeline mid-validator run (WARTET/LÄUFT/FERTIG cards) — requires mid-run snapshot
 *   4. Pipeline lens run (persona cards) — requires mid-run snapshot
 *   5. Verlauf detail expanded (Lauf-Spur, Block-Gründe bars)
 *   6. Council object list with cluster/provenance
 *   7. Hauskauf campaign kanban
 *   8. LIFE dashboard (Heute)
 */
import { test, expect } from '@playwright/test';
import { join } from 'node:path';

const OUTPUT_DIR = join(process.cwd(), 'docs/screenshots/release');
const DATE_STAMP = '20260611';

function shotPath(n: number, area: string): string {
	return join(OUTPUT_DIR, `${String(n).padStart(2, '0')}-${area}-${DATE_STAMP}.png`);
}

// Common settle: wait for fonts + animations to finish before capture.
async function settle(page: import('@playwright/test').Page, ms = 1200): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	// Wait for images to be (roughly) decoded.
	await page
		.evaluate(() =>
			Promise.all(
				Array.from(document.images)
					.filter((img) => !img.complete)
					.map(
						(img) =>
							new Promise<void>((res) => {
								img.addEventListener('load', () => res(), { once: true });
								img.addEventListener('error', () => res(), { once: true });
							})
					)
			)
		)
		.catch(() => undefined);
	await page.waitForTimeout(ms);
}

test.describe('Public-release screenshots', () => {
	test('01 — mail-queue with filters', async ({ page }) => {
		await page.goto('/mail-queue', { waitUntil: 'domcontentloaded' });
		await settle(page);
		await page.screenshot({ path: shotPath(1, 'mail-queue'), fullPage: false });
	});

	test('02 — pipeline idle (last run dimmed)', async ({ page }) => {
		await page.goto('/pipeline', { waitUntil: 'domcontentloaded' });
		await settle(page);
		await page.screenshot({ path: shotPath(2, 'pipeline-idle'), fullPage: false });
	});

	test('05 — verlauf detail expanded', async ({ page }) => {
		await page.goto('/pipeline', { waitUntil: 'domcontentloaded' });
		await settle(page);
		// PipelineRunList opens the first non-running run with summary by
		// default (PipelineRunList.svelte:16-19 defaultOpen). For our demo state
		// that's the silent-worker-20260610 row — already expanded on mount.
		// Just scroll the expanded detail into view.
		await page.waitForSelector('.rundetail', { timeout: 5000 });
		await page.waitForSelector('.rundetail .ld-status', { state: 'hidden', timeout: 8000 }).catch(() => undefined);
		await settle(page, 1200);
		const detail = page.locator('.rundetail').first();
		await detail.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }));
		await settle(page, 400);
		await page.screenshot({ path: shotPath(5, 'verlauf-detail'), fullPage: false });
	});

	test('06 — council with cluster + provenance', async ({ page }) => {
		await page.goto('/council', { waitUntil: 'domcontentloaded' });
		await settle(page);
		await page.screenshot({ path: shotPath(6, 'council'), fullPage: false });
	});

	test('07 — hauskauf kanban', async ({ page }) => {
		// Hauskauf-Kanban lebt auf /pipeline unter dem FlowDiagram. At 1600×1000
		// viewport the whole page fits, so a viewport screenshot is identical to
		// shot 02. Clip to the kanban region (with its eyebrow header) so the
		// kanban is the obvious focus.
		await page.goto('/pipeline', { waitUntil: 'domcontentloaded' });
		await settle(page);
		// Find the ÜBERGANG → KAMPAGNE eyebrow + kgate + kboard block.
		// The eyebrow lives just above kgate; capture both.
		const eyebrow = page.locator('.eyebrow', { hasText: 'KAMPAGNE' }).first();
		const kboard = page.locator('.kboard').first();
		const eyebrowBox = await eyebrow.boundingBox();
		const kboardBox = await kboard.boundingBox();
		if (!eyebrowBox || !kboardBox) {
			throw new Error('Kanban locators not found');
		}
		const clip = {
			x: Math.max(0, eyebrowBox.x - 8),
			y: eyebrowBox.y - 8,
			width: Math.min(1600 - Math.max(0, eyebrowBox.x - 8), kboardBox.x + kboardBox.width + 16 - Math.max(0, eyebrowBox.x - 8)),
			height: kboardBox.y + kboardBox.height + 16 - eyebrowBox.y
		};
		await page.screenshot({ path: shotPath(7, 'hauskauf'), clip });
	});

	test('08 — heute dashboard', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await settle(page);
		await page.screenshot({ path: shotPath(8, 'heute'), fullPage: false });
	});
});

// Mid-run shots (3 + 4) live in a separate spec because they require
// `add_midrun_snapshot.py` to have mutated the demo DBs first. See
// tests/e2e/screenshots-midrun.spec.ts.
