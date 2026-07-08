import { test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const OUTPUT_DIR = join(process.cwd(), 'docs/screenshots/release');
const DATE_STAMP = '20260708';
const SEED_SCRIPT = join(process.cwd(), 'scripts', 'seed-demo-inbox.sh');
const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5174';

function shotPath(n: number, area: string): string {
	return join(OUTPUT_DIR, `${String(n).padStart(2, '0')}-${area}-${DATE_STAMP}.png`);
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

test.describe.serial('Import evidence screenshots (demo only)', () => {
	test.beforeAll(() => {
		execSync(`bash "${SEED_SCRIPT}"`, { stdio: 'inherit' });
	});

	test('05 — import inbox with triage result', async ({ page }) => {
		await page.goto(`${BASE_URL}/inbox`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('h1:has-text("Import-Inbox")', { timeout: 10_000 });
		await settle(page, 900);

		const triageButton = page.getByRole('button', { name: 'LLM-Triage ausführen' });
		await triageButton.click();
		await page.waitForSelector('.msg.ok', { timeout: 20_000 });
		await settle(page, 1000);
		await page.screenshot({ path: shotPath(5, 'import-inbox'), fullPage: false });
	});

	test('06 — heute-hub with import card', async ({ page }) => {
		await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('button:has-text("Import-Inbox")', { timeout: 10_000 });
		await settle(page, 900);

		const card = page.locator('button:has(.title:has-text("Import-Inbox"))').first();
		const box = await card.boundingBox();
		if (!box) throw new Error('Import-Inbox card not found on Heute-Hub');
		const clip = {
			x: Math.max(0, box.x - 24),
			y: Math.max(0, box.y - 24),
			width: Math.min(1600 - Math.max(0, box.x - 24), box.width + 48),
			height: Math.min(1000 - Math.max(0, box.y - 24), box.height + 80)
		};
		await page.screenshot({ path: shotPath(6, 'heute-import'), clip });
	});
});
