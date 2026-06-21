import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — used primarily for capturing public-release screenshots
 * against the isolated demo-server (port 5174). NOT used for CI test execution.
 *
 * Run before each capture:
 *   1. (multi-agent) make demo-force      # seed isolated demo-DBs
 *   2. (folio)       bash scripts/demo-server.sh  # serve on port 5174
 *   3. (folio)       npx playwright test tests/e2e/screenshots.spec.ts
 */
export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	retries: 0,
	workers: 1,
	reporter: [['list']],

	use: {
		baseURL: 'http://localhost:5174',
		locale: 'de-DE',
		colorScheme: 'light',
		// 1600×1000 logical (wide-laptop layout area), 2x DPR → 3200×2000 output.
		// Earlier 800×500@2x rendered only HALF the layout width, cramping content.
		viewport: { width: 1600, height: 1000 },
		deviceScaleFactor: 2,
		screenshot: 'off',
		video: 'off',
		trace: 'off'
	},

	projects: [
		{
			name: 'chromium',
			use: {
				// Don't spread Desktop Chrome — it overrides viewport with 1280x720.
				// We want explicit 800x500 logical + DPR=2 → 1600x1000 rendered.
				browserName: 'chromium',
				channel: undefined
			}
		}
	]
});
