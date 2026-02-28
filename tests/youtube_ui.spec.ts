import { test, expect } from '@playwright/test';

test.describe('YouTube Mapping UI', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:5173');
		// Clear storage
		await page.evaluate(() => localStorage.clear());
		await page.reload();
	});

	test('should allow adding a piece with YouTube ID and entering calibration', async ({ page }) => {
		await page.click('#add-piece-btn');
		await page.fill('#new-piece-name', 'YouTube Test');
		await page.fill('#new-piece-measures', '16');
		await page.fill('#new-piece-youtube', 'dQw4w9WgXcQ');
		await page.click('#save-piece-btn');

		const pieceItem = page.locator('.piece-item', { hasText: 'YouTube Test' });
		await expect(pieceItem).toBeVisible();

		// Click calibrate button
		await pieceItem.locator('.cal-btn').click();

		// Verify Calibration View
		await expect(page.locator('#calibration-view')).toBeVisible();
		await expect(page.locator('#cal-piece-name')).toContainText('Calibration: YouTube Test');

		// Check for YouTube iframe (mocked for this test as we can't easily wait for real YT in CI)
		// But we can check if the container is there
		await expect(page.locator('#youtube-player-container')).toBeVisible();
	});

	test('should toggle entry mode and record taps', async ({ page }) => {
		// Setup piece
		await page.evaluate(() => {
			localStorage.setItem('elephant_soup_repertoire', JSON.stringify({
				repertoire: [{
					id: 'test-id',
					name: 'Cal Test',
					totalMeasures: 8,
					segments: [],
					youtubeId: 'dQw4w9WgXcQ'
				}],
				lastSync: new Date().toISOString()
			}));
		});
		await page.reload();

		// Mock YouTube API
		await page.evaluate(() => {
			(window as any).YT = {
				Player: class {
					constructor(id: string, config: any) {
						setTimeout(() => config.events.onReady(), 100);
					}
					getCurrentTime() { return 10.5; }
					playVideo() { }
					pauseVideo() { }
					stopVideo() { }
					seekTo() { }
					destroy() { }
				}
			};
		});

		await page.locator('.cal-btn').click();

		// Toggle Entry Mode
		const entryBtn = page.locator('#cal-entry-mode');
		await entryBtn.click();
		await expect(entryBtn).toHaveClass(/active/);

		// Simulate space bar for tap (we need to focus or just emit on window as the app does)
		await page.keyboard.press('Space');
		await page.keyboard.press('Space');

		// Verify dots appeared in grid
		const dots = page.locator('.dot.captured');
		await expect(dots).toHaveCount(2);
	});

	test('should show nudge popup on double click', async ({ page }) => {
		// Setup piece with offsets
		await page.evaluate(() => {
			localStorage.setItem('elephant_soup_repertoire', JSON.stringify({
				repertoire: [{
					id: 'test-id',
					name: 'Nudge Test',
					totalMeasures: 8,
					segments: [],
					youtubeId: 'dQw4w9WgXcQ',
					measureOffsets: { 1: 10, 2: 15 }
				}],
				lastSync: new Date().toISOString()
			}));
		});
		await page.reload();

		await page.locator('.cal-btn').click();

		const dot = page.locator('.dot').first();
		await dot.dblclick();

		await expect(page.locator('#nudge-popup')).toBeVisible();
		await expect(page.locator('#nudge-measure-num')).toContainText('1');
	});

	test('should show play sample button in practice mode', async ({ page }) => {
		await page.evaluate(() => {
			localStorage.setItem('elephant_soup_repertoire', JSON.stringify({
				repertoire: [{
					id: 'test-id',
					name: 'Practice Test',
					totalMeasures: 4,
					segments: [{ id: 's1', start: 1, end: 1, readiness: 0, lastPracticed: null }],
					youtubeId: 'dQw4w9WgXcQ',
					measureOffsets: { 1: 10, 2: 20 }
				}],
				lastSync: new Date().toISOString()
			}));
		});
		await page.reload();

		await page.locator('.piece-item').click();

		// Verify Play Sample button is visible
		await expect(page.locator('#play-sample-btn')).toBeVisible();
	});
});
