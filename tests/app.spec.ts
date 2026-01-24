import { test, expect } from '@playwright/test';

test.describe('Simple Music Recorder', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('has correct title', async ({ page }) => {
		await expect(page).toHaveTitle(/Simple Music Recorder/);
	});

	test('shows repertoire view by default', async ({ page }) => {
		const repertoireView = page.locator('#repertoire-view');
		await expect(repertoireView).toBeVisible();

		// Check for the "Add New Piece" button
		const addPieceBtn = page.locator('#add-piece-btn');
		await expect(addPieceBtn).toBeVisible();
		await expect(addPieceBtn).toHaveText('Add New Piece');
	});

	test('can open add piece form', async ({ page }) => {
		await page.locator('#add-piece-btn').click();

		const form = page.locator('#new-piece-form');
		await expect(form).toBeVisible();

		await expect(page.locator('#new-piece-name')).toBeVisible();
		await expect(page.locator('#new-piece-measures')).toBeVisible();
		await expect(page.locator('#save-piece-btn')).toBeVisible();
		await expect(page.locator('#cancel-piece-btn')).toBeVisible();
	});

	test('can add a piece and start practice', async ({ page }) => {
		// Open form
		await page.locator('#add-piece-btn').click();

		// Fill form
		await page.locator('#new-piece-name').fill('Test Song');
		await page.locator('#new-piece-measures').fill('4');

		// Save
		await page.locator('#save-piece-btn').click();

		// Verify piece appears in list
		const pieceItem = page.locator('.piece-item', { hasText: 'Test Song' });
		await expect(pieceItem).toBeVisible();

		// Start practice
		await pieceItem.click();

		// Verify practice view
		await expect(page.locator('#practice-view')).toBeVisible();
		await expect(page.locator('#repertoire-view')).not.toBeVisible();

		// Verify random measure prompt (1-4)
		const segmentDisplay = page.locator('#current-segment-display');
		await expect(segmentDisplay).toBeVisible();
		const text = await segmentDisplay.textContent();
		expect(text).toMatch(/Measure [1-4]/);
	});
});
