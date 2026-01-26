import { test, expect } from '@playwright/test';

test.describe('Elephant Soup', () => {
	test.beforeEach(async ({ context, page }) => {
		// Grant microphone permission
		await context.grantPermissions(['microphone']);
		await page.goto('/');
	});

	test('has correct title', async ({ page }) => {
		await expect(page).toHaveTitle(/Elephant Soup/);
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

		// --- Record Flow ---
		// Start Recording
		const recordBtn = page.locator('#recordButton');
		await recordBtn.click();
		await expect(recordBtn).toHaveClass(/recording/);

		// Wait briefly (simulate recording)
		await page.waitForTimeout(1000); // 1s recording

		// Stop Recording
		await recordBtn.click({ force: true });
		await expect(recordBtn).not.toHaveClass(/recording/);

		// --- Play Flow ---
		const playBtn = page.locator('#playButton');
		await expect(playBtn).toBeEnabled();
		await playBtn.click();

		// Wait for playback to finish (it was 1s long ~ + buffer) or wait for rating controls
		const rateControls = page.locator('#readiness-controls');
		// Rating controls appear AFTER playback finishes
		await expect(rateControls).toBeVisible({ timeout: 5000 });

		// --- Rate Flow ---
		const rateOkay = rateControls.locator('.rate-btn[data-level="2"]');
		await rateOkay.click();

		// --- Verify Persistence ---
		// Should load next segment immediately.
		// We check localStorage to see if the PREVIOUS segment got saved with readiness 2.

		const localStorageData = await page.evaluate(() => {
			return localStorage.getItem('elephant_soup_repertoire');
		});

		expect(localStorageData).toBeTruthy();
		const data = JSON.parse(localStorageData!);
		const piece = data.repertoire.find((p: any) => p.name === 'Test Song');
		expect(piece).toBeTruthy();

		// Find the segment that has readiness === 2
		const practicedSegment = piece.segments.find((s: any) => s.readiness === 2);
		expect(practicedSegment).toBeTruthy();

	});

	test('can suspend and resume a session', async ({ page }) => {
		// 1. Setup: Add piece
		await page.locator('#add-piece-btn').click();
		await page.locator('#new-piece-name').fill('Suspend Song');
		await page.locator('#new-piece-measures').fill('4');
		await page.locator('#save-piece-btn').click();
		const pieceItem = page.locator('.piece-item', { hasText: 'Suspend Song' });

		// 2. Start Practice
		await pieceItem.click();
		await expect(page.locator('#practice-view')).toBeVisible();

		// 3. Rate one measure
		// Get current measure text
		const segmentDisplay = page.locator('#current-segment-display');
		const firstMeasureText = await segmentDisplay.textContent();
		console.log('First measure:', firstMeasureText);

		// Record -> Play -> Rate flow
		const recordBtn = page.locator('#recordButton');
		await recordBtn.click();
		await page.waitForTimeout(500); // short recording
		await recordBtn.click({ force: true });

		await page.locator('#playButton').click();
		const rateControls = page.locator('#readiness-controls');
		await expect(rateControls).toBeVisible({ timeout: 5000 });

		// Rate 2
		await rateControls.locator('.rate-btn[data-level="2"]').click();

		// 4. Suspend
		// Wait for next segment to load (display changes) or just click suspend immediately?
		// The previous flow loads next segment immediately.
		// Let's just click suspend.
		await page.locator('#back-to-repertoire').click();
		await expect(page.locator('#repertoire-view')).toBeVisible();

		// Verify "Resumable" indicator (optional, but good)
		await expect(pieceItem).toContainText('Resumable');

		// 5. Resume
		await pieceItem.click();
		const resumeModal = page.locator('#resume-modal');
		await expect(resumeModal).toBeVisible();
		await page.locator('#resume-btn').click();
		await expect(page.locator('#practice-view')).toBeVisible();

		// 6. Finish Session verification
		// We expect to see 3 MORE measures. All unique, and NOT the first one.
		const seenMeasures = new Set<string>();
		seenMeasures.add(firstMeasureText!);

		// Handle alert for session completion
		let sessionComplete = false;
		page.on('dialog', async dialog => {
			if (dialog.message().includes('Session complete')) {
				sessionComplete = true;
				await dialog.dismiss();
			}
		});

		// We expect 3 iterations
		for (let i = 0; i < 3; i++) {
			const text = await segmentDisplay.textContent();
			expect(seenMeasures.has(text!)).toBeFalsy(); // Should not be a repeat of the first one (or previous ones in this loop if unique)
			seenMeasures.add(text!);

			// Rate it
			await recordBtn.click();
			await page.waitForTimeout(100);
			await recordBtn.click({ force: true });
			await page.locator('#playButton').click();
			await expect(rateControls).toBeVisible({ timeout: 5000 });
			await rateControls.locator('.rate-btn[data-level="2"]').click();
		}

		// After 3rd rating, we should get session complete
		// Wait a bit for dialog handling or UI update
		await expect.poll(() => sessionComplete).toBeTruthy();

		// Should return to repertoire view
		await expect(page.locator('#repertoire-view')).toBeVisible();
	});

	test('can export, delete, and import data', async ({ page }) => {
		// 1. Setup: Add two pieces
		// Piece 1
		await page.locator('#add-piece-btn').click();
		await page.locator('#new-piece-name').fill('Export Piece 1');
		await page.locator('#new-piece-measures').fill('10');
		await page.locator('#save-piece-btn').click();

		// Piece 2
		await page.locator('#add-piece-btn').click();
		await page.locator('#new-piece-name').fill('Export Piece 2');
		await page.locator('#new-piece-measures').fill('5');
		await page.locator('#save-piece-btn').click();

		await expect(page.locator('.piece-item', { hasText: 'Export Piece 1' })).toBeVisible();
		await expect(page.locator('.piece-item', { hasText: 'Export Piece 2' })).toBeVisible();

		// 2. Export
		// Prepare for download
		const downloadPromise = page.waitForEvent('download');
		await page.locator('#export-btn').click();
		const download = await downloadPromise;

		// Read the stream
		const stream = await download.createReadStream();
		// Convert stream to buffer manually (node specific)
		const chunks = [];
		for await (const chunk of stream) {
			chunks.push(chunk);
		}
		const buffer = Buffer.concat(chunks);
		const jsonData = JSON.parse(buffer.toString('utf-8'));

		// Basic verification of export content
		expect(jsonData.repertoire).toHaveLength(2);
		expect(jsonData.repertoire.some((p: any) => p.name === 'Export Piece 1')).toBeTruthy();
		expect(jsonData.repertoire.some((p: any) => p.name === 'Export Piece 2')).toBeTruthy();

		// 3. Delete
		// Handle confirm dialogs
		page.on('dialog', async dialog => {
			if (dialog.message().includes('Delete')) {
				await dialog.accept();
			}
		});

		// Delete Piece 1
		await page.locator('.piece-item', { hasText: 'Export Piece 1' }).locator('.delete-btn').click();
		await expect(page.locator('.piece-item', { hasText: 'Export Piece 1' })).not.toBeVisible();

		// Delete Piece 2
		await page.locator('.piece-item', { hasText: 'Export Piece 2' }).locator('.delete-btn').click();
		await expect(page.locator('.piece-item', { hasText: 'Export Piece 2' })).not.toBeVisible();

		// Check Empty State
		await expect(page.locator('#piece-list')).toContainText('No pieces yet');

		const localStorageData = await page.evaluate(() => {
			return localStorage.getItem('elephant_soup_repertoire');
		});
		const parsed = JSON.parse(localStorageData!);
		expect(parsed.repertoire).toHaveLength(0);

		// 4. Import
		// Create a temporary file or just use the buffer. 
		// Playwright `setInputFiles` accepts buffer or path.
		// We can write buffer to a file in test output dir or use buffer directly.

		// We'll simulate file selection
		await page.locator('#import-file').setInputFiles({
			name: 'backup.json',
			mimeType: 'application/json',
			buffer: buffer
		});

		// Trigger the import (the example app uses a change listener on file input, 
		// but the test logic above might need to just set input files.
		// The previous app code: 
		// document.getElementById('import-btn')?.addEventListener('click', () => { document.getElementById('import-file')?.click(); });
		// document.getElementById('import-file')?.addEventListener('change', ...);

		// Since input is hidden, setInputFiles works on hidden inputs if we locate it.
		// However, setInputFiles triggers 'input' and 'change' events.

		// Handle success alert
		page.on('dialog', async dialog => {
			if (dialog.message().includes('imported successfully')) {
				await dialog.dismiss();
			}
		});

		// 5. Verify Restoration
		await expect(page.locator('.piece-item', { hasText: 'Export Piece 1' })).toBeVisible();
		await expect(page.locator('.piece-item', { hasText: 'Export Piece 2' })).toBeVisible();
	});
	test('can schedule spaced repetition', async ({ page }) => {
		// 1. Create a 1-measure piece (automatically 1 active segment)
		await page.locator('#add-piece-btn').click();
		await page.locator('#new-piece-name').fill('Spaced Repetition Song');
		await page.locator('#new-piece-measures').fill('1');
		await page.locator('#save-piece-btn').click();

		const pieceItem = page.locator('.piece-item', { hasText: 'Spaced Repetition Song' });
		await expect(pieceItem).toBeVisible();

		// 2. Start Practice
		await pieceItem.click();
		await expect(page.locator('#practice-view')).toBeVisible();

		// 3. Record & Rate 1 (Tomorrow)
		const recordBtn = page.locator('#recordButton');
		await recordBtn.click(); // Start
		await page.waitForTimeout(100);
		await recordBtn.click({ force: true }); // Stop

		await page.locator('#playButton').click();
		const rateControls = page.locator('#readiness-controls');
		await expect(rateControls).toBeVisible({ timeout: 5000 });

		// Rate 1 (Copable) -> Should schedule for tomorrow
		await rateControls.locator('.rate-btn[data-level="1"]').click();

		// Handle session complete alert
		page.on('dialog', async dialog => {
			await dialog.dismiss();
		});

		// Wait for return to Repertoire View
		await expect(page.locator('#repertoire-view')).toBeVisible();

		// 4. Verify Next Date
		// Get the stored data to verify nextDate
		const localStorageData = await page.evaluate(() => {
			return localStorage.getItem('elephant_soup_repertoire');
		});
		const data = JSON.parse(localStorageData!);
		const piece = data.repertoire.find((p: any) => p.name === 'Spaced Repetition Song');

		expect(piece.nextDate).toBeTruthy();
		const nextDate = new Date(piece.nextDate);
		const now = new Date();
		const oneDay = 24 * 60 * 60 * 1000;
		// Allow some delta for execution time, but basically should be >= now + 1 day - small buffer
		// Actually, logic is `new Date(now.getTime() + oneDayMs)`
		// So difference should be very close to oneDay
		const diff = nextDate.getTime() - now.getTime();
		expect(Math.abs(diff - oneDay)).toBeLessThan(5000); // within 5 seconds

		// 5. Verify UI indication
		// Since it is future, "Due:" should be visible
		// We might need to refresh or if `renderRepertoire` is called after session end (it is)
		await expect(pieceItem).toContainText('Due:');
	});
	test('schedules spaced repetition for fully merged piece', async ({ page }) => {
		// 1. Create a 2-measure piece
		await page.locator('#add-piece-btn').click();
		await page.locator('#new-piece-name').fill('Merged Song');
		await page.locator('#new-piece-measures').fill('2');
		await page.locator('#save-piece-btn').click();

		const pieceItem = page.locator('.piece-item', { hasText: 'Merged Song' });

		// 2. Start Practice -> Queue should have [1], [2] (shuffled)
		await pieceItem.click();
		await expect(page.locator('#practice-view')).toBeVisible();

		// We need to rate both measures 1 and 2 as "Ready" (3) to trigger a merge.

		// Loop until we have rated 2 active segments as 3
		for (let i = 0; i < 2; i++) {
			const recordBtn = page.locator('#recordButton');
			await recordBtn.click();
			await page.waitForTimeout(100);
			await recordBtn.click({ force: true });
			await page.locator('#playButton').click();
			const rateControls = page.locator('#readiness-controls');
			await expect(rateControls).toBeVisible({ timeout: 5000 });
			// Rate 3 (Ready)
			await rateControls.locator('.rate-btn[data-level="3"]').click();
			// Handled, next segment loads.
		}

		// Handle alert if it appears (queue empty)
		page.on('dialog', async dialog => {
			await dialog.dismiss();
		});

		// Wait for return to Repertoire View
		await expect(page.locator('#repertoire-view')).toBeVisible();

		// 3. Start Session AGAIN. Queue should now be merged [1-2].
		await pieceItem.click();
		await expect(page.locator('#practice-view')).toBeVisible();

		const segmentDisplay = page.locator('#current-segment-display');
		await expect(segmentDisplay).toContainText('1 - 2');

		// 4. Rate the merged segment [1-2] as 2 (Copable) -> Should trigger Spaced Repetition Logic
		const recordBtn = page.locator('#recordButton');
		await recordBtn.click();
		await page.waitForTimeout(100);
		await recordBtn.click({ force: true });
		await page.locator('#playButton').click();
		await page.locator('#readiness-controls').locator('.rate-btn[data-level="2"]').click();

		await expect(page.locator('#repertoire-view')).toBeVisible();

		// 5. Verify nextDate
		const localStorageData = await page.evaluate(() => {
			return localStorage.getItem('elephant_soup_repertoire');
		});
		const data = JSON.parse(localStorageData!);
		const piece = data.repertoire.find((p: any) => p.name === 'Merged Song');

		expect(piece.nextDate).toBeTruthy();
		await expect(pieceItem).toContainText('Due:');
	});
});
