import { Piece } from './types';

/**
 * Generates an SVG string representing the progress of a given piece.
 * The SVG is a horizontal bar chart where each measure is a segment.
 * 
 * Returns an empty string if:
 * - The piece has 0 measures
 * - The piece has > 200 measures (to prevent excessive DOM/compute)
 */
export function renderProgressGraph(piece: Piece): string {
	if (!piece || piece.totalMeasures === 0 || piece.totalMeasures > 200) {
		return '';
	}

	const T = piece.totalMeasures;
	const segments = piece.segments || [];

	// Determine the actual start measure based on segments or default to 1
	const startM = segments.length > 0 ? Math.min(...segments.map(s => s.start)) : 1;

	// We build a 1D array of readiness (0-3) for each measure
	// initialized to 0. 
	// m runs from startM to startM + T - 1, meaning we need an array of size T.
	const measureReadiness = new Array(T).fill(0);
	const isMerged = new Array(T).fill(false);

	// Populate measureReadiness based on segments
	// Priority:
	// 1. Ready blocks (3)
	// 2. Exact match (0, 1, 2)
	segments.forEach(seg => {
		// Only process segments within our expected range
		if (seg.start < startM || seg.end >= startM + T) return;

		const isBlock = seg.end > seg.start;
		const readiness = seg.readiness;

		for (let m = seg.start; m <= seg.end; m++) {
			const idx = m - startM;
			if (idx >= 0 && idx < T) {
				// If the measure is part of a merged block, mark it
				// We assume blocks are level 3, but apply generally
				if (isBlock) {
					isMerged[idx] = true;
				}

				// Keep highest readiness seen for a measure
				if (readiness > measureReadiness[idx]) {
					measureReadiness[idx] = readiness;
				}
			}
		}
	});

	// 100% total width. Height is arbitrary since viewBox scales.
	const viewBoxWidth = 100;
	const viewBoxHeight = 8;
	const measureWidth = viewBoxWidth / T;

	let svgContent = '';

	// We run through measures and group them by readiness/merged status 
	// to draw fewer SVG rects (optimal approach, but simple 1-rect-per-measure works too).
	// Given T <= 200, 1 rect per measure is fine.

	// Draw base level blocks first
	for (let i = 0; i < T; i++) {
		const readiness = measureReadiness[i];
		if (readiness === 0) continue; // Transparent

		const x = Number((i * measureWidth).toFixed(2));
		const width = Number(measureWidth.toFixed(2));

		let className = 'level-0';
		if (readiness === 1) className = 'level-1';
		if (readiness === 2) className = 'level-2';
		if (readiness === 3) className = 'level-3';

		svgContent += `<rect x="${x}" y="0" width="${width}" height="${viewBoxHeight}" class="${className}"></rect>`;
	}

	// Draw individual measure grid lines
	let gridLinesPath = '';
	for (let i = 0; i < T; i++) {
		if (!isMerged[i]) {
			// Draw a left border or center tick?
			// Usually right-side border for each segment
			if (i < T - 1) { // dont need line at extreme right
				// Is right neighbor also unmerged? If they are diff readiness? 
				// Always draw grid line to distinguish measures except within merged blocks
				// Wait: if measure `i` is unmerged, but `i+1` is merged, draw line? Yes.
				if (!isMerged[i] || !isMerged[i + 1]) {
					const lineX = Number(((i + 1) * measureWidth).toFixed(2));
					gridLinesPath += `M${lineX},0 v${viewBoxHeight} `;
				}
			}
		}
	}
	if (gridLinesPath.trim().length > 0) {
		svgContent += `<path d="${gridLinesPath.trim()}" stroke="#1e1e1e" stroke-width="0.5"></path>`;
	}

	// Draw borders/outlines for Merged level-3 blocks
	// We scan continuously for `isMerged === true`
	let mergeStartIdx = -1;
	for (let i = 0; i <= T; i++) {
		if (i < T && isMerged[i]) {
			if (mergeStartIdx === -1) mergeStartIdx = i;
		} else {
			// End of a merged block
			if (mergeStartIdx !== -1) {
				const blockLen = i - mergeStartIdx;
				// Only draw outline if length > 1 (true merges)
				if (blockLen > 1) {
					const bx = Number((mergeStartIdx * measureWidth).toFixed(2)) + 0.5; // slight inset 
					const bw = Number((blockLen * measureWidth).toFixed(2)) - 1; // slight inset width
					const bh = viewBoxHeight - 1;

					svgContent += `<rect x="${bx}" y="0.5" width="${bw}" height="${bh}" fill="none" class="merged-segment" stroke="#ffffff" stroke-width="0.5"></rect>`;
				}
				mergeStartIdx = -1;
			}
		}
	}

	return `
    <svg class="progress-graph" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="none">
        ${svgContent}
    </svg>
    `;
}
