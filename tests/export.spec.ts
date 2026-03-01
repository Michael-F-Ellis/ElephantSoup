import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Export Feature', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			(window as any).showSaveFilePicker = undefined;
			if (navigator.share) {
				(navigator as any).share = undefined;
			}
		});
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.reload();
	});

	test('can export full data with custom filename', async ({ page }) => {
		// Add a piece
		await page.click('#add-piece-btn');
		await page.fill('#new-piece-name', 'Export Test');
		await page.fill('#new-piece-measures', '2');
		await page.click('#save-piece-btn');

		// Open Export Modal
		await page.click('#export-btn');
		await expect(page.locator('#export-modal')).toBeVisible();

		// Set filename
		const customFilename = 'my_custom_export';
		await page.fill('#export-filename', customFilename);

		// Trigger Export
		const downloadPromise = page.waitForEvent('download');
		await page.click('#export-confirm-btn');
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toBe(customFilename + '.json');

		// Verify content (optional but good)
		const filePath = path.join(process.cwd(), 'tests', 'export_test_full.json');
		await download.saveAs(filePath);
		const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		expect(content.repertoire[0].name).toBe('Export Test');

		// Clean up
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	});

	test('can export clean data (no progress)', async ({ page }) => {
		// Add a piece and give it some progress
		await page.click('#add-piece-btn');
		await page.fill('#new-piece-name', 'Clean Test');
		await page.fill('#new-piece-measures', '1');
		await page.click('#save-piece-btn');

		// Enter practice and rate it 3 (Ready)
		await page.click('.piece-item');
		await page.click('#recordButton');
		await page.waitForTimeout(1000); // Record for 1s
		await page.click('#recordButton', { force: true }); // Stop without waiting for stability
		await page.waitForTimeout(1000); // Wait for processing
		await page.click('#playButton');
		// Wait for rating buttons
		await page.waitForSelector('#readiness-controls', { state: 'visible' });
		// Handle session complete alert
		page.on('dialog', async dialog => {
			if (dialog.message().includes('Session complete')) {
				await dialog.dismiss();
			}
		});

		await page.click('.rate-btn[data-level="3"]');

		// Wait for return to Repertoire View (auto-triggered by session completion)
		await expect(page.locator('#repertoire-view')).toBeVisible();

		// Open Export Modal
		await page.click('#export-btn');
		await page.check('#export-clean-checkbox');

		const downloadPromise = page.waitForEvent('download');
		await page.click('#export-confirm-btn');
		const download = await downloadPromise;

		const filePath = path.join(process.cwd(), 'tests', 'clean_export.json');
		await download.saveAs(filePath);
		const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

		// Pieces in clean export should have readiness 0
		expect(content.repertoire[0].segments[0].readiness).toBe(0);
		expect(content.repertoire[0].segments[0].lastPracticed).toBeNull();

		// Clean up
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
	});
});
