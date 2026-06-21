/**
 * Mid-run screenshots — captures shots #3 (validator mid-run) and #4 (lens
 * persona-progress) against synthetic running-states.
 *
 * Each test independently adds its midrun snapshot via the multi-agent helper
 * `add_midrun_snapshot.py`, takes the shot, then cleans. This isolates state
 * so shot 4 doesn't see the validator's "Validator läuft" pill from shot 3.
 *
 * Run with normal demo-server live on 5174.
 */
import { test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const OUTPUT_DIR = join(process.cwd(), 'docs/screenshots/release');
const DATE_STAMP = '20260611';
const HELPER = join(
	process.cwd(),
	'..',
	'aion-lumen',
	'multi-agent',
	'scripts',
	'add_midrun_snapshot.py'
);

function shotPath(n: number, area: string): string {
	return join(OUTPUT_DIR, `${String(n).padStart(2, '0')}-${area}-${DATE_STAMP}.png`);
}

function runHelper(flag: '--add-validator' | '--add-lens' | '--clean'): void {
	// For lens midrun the lockfile PID must be alive at screenshot time.
	// Pass the Playwright runner PID — lives throughout the test run.
	const pidArg = flag === '--add-lens' ? ` --pid ${process.pid}` : '';
	execSync(`python3 ${HELPER} ${flag}${pidArg}`, { stdio: 'inherit' });
}

async function settle(page: import('@playwright/test').Page, ms = 1200): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
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

test.describe.serial('Mid-run screenshots', () => {
	test.afterEach(() => {
		// Always clean to keep tests isolated.
		try {
			runHelper('--clean');
		} catch (e) {
			console.warn('Cleanup failed:', e);
		}
	});

	test('03 — pipeline mid-validator-run (WARTET/LÄUFT/FERTIG)', async ({ page }) => {
		runHelper('--add-validator');
		await page.goto('/pipeline', { waitUntil: 'domcontentloaded' });
		await settle(page, 1500);
		const panel = page.locator('section.panel').first();
		await panel.scrollIntoViewIfNeeded();
		await page.evaluate(() => window.scrollBy({ top: -120, behavior: 'instant' as ScrollBehavior }));
		await settle(page, 400);
		await page.screenshot({ path: shotPath(3, 'pipeline-validator'), fullPage: false });
	});

	test('04 — pipeline lens-run (persona cards)', async ({ page }) => {
		runHelper('--add-lens');
		await page.goto('/pipeline', { waitUntil: 'domcontentloaded' });
		await settle(page, 1500);
		// With ONLY lens active (no validator), panelStack switches to 'lens'.
		// ModelStatusPanel renders 3 persona cards (baumeister/rechner/ortskundige).
		const panel = page.locator('section.panel').first();
		await panel.scrollIntoViewIfNeeded();
		await page.evaluate(() => window.scrollBy({ top: -120, behavior: 'instant' as ScrollBehavior }));
		await settle(page, 400);
		await page.screenshot({ path: shotPath(4, 'pipeline-lens'), fullPage: false });
	});
});
