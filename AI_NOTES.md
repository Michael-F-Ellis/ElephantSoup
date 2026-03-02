# ElephantSoup (formerly tsfqs) Architecture & Context

## Core Application
ElephantSoup is a web-based music practice and spaced repetition app. It allows users to:
1. Break down long musical pieces into smaller logical "measure segments" (e.g., Measure 1, Measures 20-32).
2. Practice segments by recording audio locally in the browser.
3. Listen back to the recording and assign a "Readiness" level from 0 to 3.
4. Schedule future practice dynamically through a spaced repetition algorithm.

### Key Abstractions
- **Piece**: A top-level song object containing multiple parts. It defines a `totalMeasures` count and a collection of `segments`.
- **Segment**: Tracks a specific measure or range of measures (e.g., `start: 1`, `end: 1`). Has a Readiness level (0 = New/Unplayed, 1 = Hard, 2 = Okay, 3 = Ready). 
    - **Merging Logic**: Adjacent segments both rated at level 3 ("Ready") will merge together into a larger block to practice moving forward (e.g., if Measure 1 and Measure 2 both reach 3, they become a single segment covering `start: 1, end: 2`).

### Stack
- **Frontend**: HTML, Vanilla CSS (`src/style.css`), TypeScript (`src/main.ts`).
- **Persistence**: `localStorage` (via `RepertoireManager` in `src/repertoire.ts`).
- **Media**: `MediaRecorder` API to capture and play back microphone audio without a backend (`src/recorder.ts`).
- **Tests**: Playwright end-to-end testing (`tests/app.spec.ts`). Ensure to test any DOM structure changes thoroughly, as Playwright checks very strict layout visibility (e.g., `pointer-events`).

### Important UI Mechanisms
- **Progress Graph (`src/statusgraph.ts`)**: Generates an inline horizontal `<svg>` bar chart reflecting readiness states for pieces <= 200 measures. Segments are sorted by size so larger merged blocks correctly paint their unified readiness status over their inner constituent measures.
- **Session Suspensions**: If a practice session is exited early, remaining queued pieces are saved to localStorage so the session can resume cleanly precisely where it left off, including updating dynamic "Suspend (X remaining)" buttons.
- **Action Bar & Printing**: The app supports cleanly exporting/importing JSON backups and rendering print-friendly PDF views by stripping buttons natively via `@media print` CSS directives.

### AI Assistant Instructions
- When adding features, strive for **maximum locality** (make changes isolated rather than restructuring multiple modules when possible).
- Rely on **test-driven development** and always verify Playwright tests (`npx playwright test`) after layout changes.
- Prioritize clear structure and console logging where state transitions occur to simplify future debugging.

## 🛠 Release & Development Recipes

### Workflow Commands
- **Test**: `npx playwright test` (full suite) or `npx playwright test tests/filename.spec.ts`
- **Build**: `npm run build` (transpiles TS and runs Vite build)
- **Deploy**: `python3 deploy.py` (syncs `dist/` to the GitHub Pages repository)

### Standard Release Recipe
To release a new version (e.g., v1.5.5):
1. **Version Bump**: Update version string in `index.html` (header & footer) and `package.json`.
2. **Verify**: Run `npx playwright test`.
3. **Commit**: `git add . && git commit -m "Release v1.5.5: Summary of changes"`
4. **Tag**: `git tag v1.5.5`
5. **Push**: `git push origin main --tags`
6. **Deploy**: `python3 deploy.py`
