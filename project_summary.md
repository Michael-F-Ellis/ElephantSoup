# Elephant Soup v1.5.x - Project Summary & Context

This document consolidates the key features, fixes, and architecture refinements implemented during the v1.5.1 to v1.5.5 release cycles.

## 🚀 Version History & Key Features

### v1.5.5: iOS Playback Fix
- **Problem**: YouTube audio failed on iOS in Practice Mode.
- **Solution**: Made the YouTube iframe container technically visible (positioned off-screen with 0.01 opacity) and initialized with non-zero dimensions (200x200) to satisfy iOS media policies.

### v1.5.4: Layout Optimization
- **Calibration View Scrolling**: Enabled vertical scrolling for the measure marker list by constraining the container height (`max-height: 90vh`) and ensuring the grid handles overflow.
- **CSS Cleanup**: Removed significant redundant code from [style.css](file:///Users/mellis/repos/ElephantSoup/src/style.css).

### v1.5.3: YouTube Integration Convenience
- **ID Extraction**: Implemented automated extraction of 11-character YouTube IDs from full links (standard, youtu.be, embed, shorts) in the "Add Piece" form.
- **Validation**: Added alerts for invalid YouTube links to prevent broken calibration states.

### v1.5.2: Interaction Refinements
- **Calibration Shortcuts**: Mapped **Space** to Play/Pause and **Enter** to Taps (measure marking) in Calibration View.
- **Standardized Code**: Extracted playback logic into a central [togglePlayback](file:///Users/mellis/repos/ElephantSoup/src/main.ts#561-570) method in [CalibrationManager](file:///Users/mellis/repos/ElephantSoup/src/calibration.ts#3-319).

### v1.5.1: Export & YouTube Core
- **Advanced Export**: Added "Clean Export" checkbox (removes progress/merges for sharing) and a "Save As" filename input.
- **Platform Compatibility**: Implemented a multi-strategy export system (File System Access API -> Web Share API -> Fallback Download).
- **YouTube Pre-roll**: Implemented a 2-second pre-roll when playing samples in Practice/Calibration views.

## 🛠 Architecture Notes

### Export System
Stored in [src/main.ts](file:///Users/mellis/repos/ElephantSoup/src/main.ts), the [triggerExport](file:///Users/mellis/repos/ElephantSoup/src/main.ts#190-243) method uses:
1. `showSaveFilePicker` (Native Save As)
2. `navigator.share` (Mobile/macOS Share Sheet)
3. Fallback `<a>` download element.

### YouTube Mapping
- **CalibrationManager** ([src/calibration.ts](file:///Users/mellis/repos/ElephantSoup/src/calibration.ts)): Handles mapping YouTube timestamps to musical measures.
- **Data Structure**: `piece.measureOffsets` stores a mapping of `{ measureNumber: youtubeOffsetSeconds }`.

### Test Suite robustness
- **Native API Bypass**: Playwright tests undefine `showSaveFilePicker` and `navigator.share` in `beforeEach` to force the fallback download, making export testing reliable.
- **Mocking**: YouTube API is mocked in UI tests to avoid external dependencies.

## 📝 Future Context
- **Testing**: All 21 tests (app, data layer, export, youtube_ui, youtube_parsing) are passing.
- **iOS Caveat**: Always ensure YouTube players have non-zero dimensions and are not `display: none` to maintain audio playback compatibility.
