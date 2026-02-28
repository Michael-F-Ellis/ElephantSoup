import { test, expect } from '@playwright/test';

test.describe('Elephant Soup Data Layer - YouTube Mapping', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('can import and export old data (backward compatibility)', async ({ page }) => {
		const oldData = {
			repertoire: [
				{
					id: "old-123",
					name: "Old Piece",
					totalMeasures: 2,
					segments: [
						{ id: "s1", start: 1, "end": 1, readiness: 0, lastPracticed: null },
						{ id: "s2", start: 2, "end": 2, readiness: 0, lastPracticed: null }
					]
				}
			]
		};

		const buffer = Buffer.from(JSON.stringify(oldData));

		// Import
		page.on('dialog', async dialog => {
			if (dialog.message().includes('imported successfully')) {
				await dialog.dismiss();
			}
		});

		await page.locator('#import-file').setInputFiles({
			name: 'old_backup.json',
			mimeType: 'application/json',
			buffer: buffer
		});

		// Verify it appears in the list
		await expect(page.locator('.piece-item', { hasText: 'Old Piece' })).toBeVisible();

		// Export and verify
		const downloadPromise = page.waitForEvent('download');
		await page.locator('#export-btn').click();
		const download = await downloadPromise;
		const stream = await download.createReadStream();
		const chunks = [];
		for await (const chunk of stream) {
			chunks.push(chunk);
		}
		const exportedData = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

		expect(exportedData.repertoire).toHaveLength(1);
		expect(exportedData.repertoire[0].name).toBe('Old Piece');
		expect(exportedData.repertoire[0].youtubeId).toBeUndefined();
		expect(exportedData.repertoire[0].measureOffsets).toBeUndefined();
	});

	test('can import and export data with YouTube mapping', async ({ page }) => {
		const newData = {
			repertoire: [
				{
					id: "new-456",
					name: "YouTube Piece",
					totalMeasures: 2,
					segments: [
						{ id: "s3", start: 1, "end": 1, readiness: 0, lastPracticed: null },
						{ id: "s4", start: 2, "end": 2, readiness: 0, lastPracticed: null }
					],
					youtubeId: "dQw4w9WgXcQ",
					measureOffsets: { "1": 10.5, "2": 25.0 }
				}
			]
		};

		const buffer = Buffer.from(JSON.stringify(newData));

		// Import
		page.on('dialog', async dialog => {
			if (dialog.message().includes('imported successfully')) {
				await dialog.dismiss();
			}
		});

		await page.locator('#import-file').setInputFiles({
			name: 'new_backup.json',
			mimeType: 'application/json',
			buffer: buffer
		});

		// Verify it appears in the list
		await expect(page.locator('.piece-item', { hasText: 'YouTube Piece' })).toBeVisible();

		// Export and verify
		const downloadPromise = page.waitForEvent('download');
		await page.locator('#export-btn').click();
		const download = await downloadPromise;
		const stream = await download.createReadStream();
		const chunks = [];
		for await (const chunk of stream) {
			chunks.push(chunk);
		}
		const exportedData = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

		expect(exportedData.repertoire).toHaveLength(1);
		expect(exportedData.repertoire[0].name).toBe('YouTube Piece');
		expect(exportedData.repertoire[0].youtubeId).toBe('dQw4w9WgXcQ');
		// JSON.parse converts numeric keys in objects to strings, which is expected behavior for Record<number, number>
		expect(exportedData.repertoire[0].measureOffsets).toEqual({ "1": 10.5, "2": 25.0 });
	});
});
