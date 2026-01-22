export interface Segment {
	id: string;
	start: number;
	end: number;
	readiness: number; // 0..3
	lastPracticed: string | null; // ISO Date
}

export interface Piece {
	id: string;
	name: string;
	totalMeasures: number;
	segments: Segment[];
}

export interface RepertoireData {
	repertoire: Piece[];
}

export class RepertoireManager {
	private data: RepertoireData;
	private readonly STORAGE_KEY = 'simple_recorder_repertoire';

	constructor() {
		this.data = this.loadFromStorage();
	}

	private loadFromStorage(): RepertoireData {
		const stored = localStorage.getItem(this.STORAGE_KEY);
		if (stored) {
			try {
				return JSON.parse(stored);
			} catch (e) {
				console.error("Failed to parse repertoire data", e);
			}
		}
		return { repertoire: [] };
	}

	private saveToStorage() {
		localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
	}

	// Export current data as JSON string
	exportData(): string {
		return JSON.stringify(this.data, null, 2);
	}

	// Import data from JSON string
	importData(json: string): boolean {
		try {
			const parsed = JSON.parse(json);
			// Basic validation could go here
			if (parsed && Array.isArray(parsed.repertoire)) {
				this.data = parsed;
				this.saveToStorage();
				return true;
			}
		} catch (e) {
			console.error("Import failed", e);
		}
		return false;
	}

	getPieces(): Piece[] {
		return this.data.repertoire;
	}

	getPiece(id: string): Piece | undefined {
		return this.data.repertoire.find(p => p.id === id);
	}

	addPiece(name: string, totalMeasures: number): Piece {
		const newPiece: Piece = {
			id: crypto.randomUUID(),
			name,
			totalMeasures,
			segments: []
		};

		// Generate initial 1-measure segments
		for (let i = 1; i <= totalMeasures; i++) {
			newPiece.segments.push({
				id: crypto.randomUUID(),
				start: i,
				end: i,
				readiness: 0,
				lastPracticed: null
			});
		}

		this.data.repertoire.push(newPiece);
		this.saveToStorage();
		return newPiece;
	}

	deletePiece(id: string) {
		this.data.repertoire = this.data.repertoire.filter(p => p.id !== id);
		this.saveToStorage();
	}

	/**
	 * returns a shuffled list of segments to practice, sorted by readiness (0 first)
	 */
	getPracticeQueue(pieceId: string): Segment[] {
		const piece = this.getPiece(pieceId);
		if (!piece) return [];

		// Run merges before generating queue
		this.processMerges(piece);

		// Group by readiness
		// Filter redundant segments:
		// A segment is redundant if it is readiness 3 AND is contained in a larger segment
		const filteredSegments = piece.segments.filter(seg => {
			if (seg.readiness !== 3) return true; // Keep non-ready segments

			// Check if contained in a larger segment
			const isContainedInLarger = piece.segments.some(other =>
				other.id !== seg.id && // Not self
				other.start <= seg.start &&
				other.end >= seg.end &&
				// Ensure we are strictly smaller or it's a larger range
				((other.end - other.start) > (seg.end - seg.start))
			);

			return !isContainedInLarger;
		});

		// Group by readiness
		const groups: { [key: number]: Segment[] } = { 0: [], 1: [], 2: [], 3: [] };

		filteredSegments.forEach(seg => {
			// Ensure readiness is within bounds 0-3
			const r = Math.max(0, Math.min(3, seg.readiness));
			if (!groups[r]) groups[r] = []; // Just in case
			groups[r].push(seg);
		});

		// Shuffle within groups and concatenate 0 -> 1 -> 2 -> 3
		let queue: Segment[] = [];
		for (let r = 0; r <= 3; r++) {
			queue = queue.concat(this.shuffleArray(groups[r]));
		}

		return queue;
	}

	private shuffleArray<T>(array: T[]): T[] {
		const arr = [...array];
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	updateSegmentReadiness(pieceId: string, segmentId: string, newReadiness: number) {
		const piece = this.getPiece(pieceId);
		if (!piece) return;

		const segment = piece.segments.find(s => s.id === segmentId);
		if (!segment) return;

		segment.readiness = newReadiness;
		segment.lastPracticed = new Date().toISOString();

		this.saveToStorage();
	}

	private processMerges(piece: Piece) {
		// Debug Logging
		console.log("--- Process Merges: Current State ---");
		const fmt = (s: Segment) => s.start === s.end ? `[${s.start}]` : `[${s.start}-${s.end}]`;
		// Sort for display (not affecting main logic order yet)
		const sortedDisplay = [...piece.segments].sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
		sortedDisplay.forEach(s => {
			console.log(`${fmt(s)} ${s.readiness}`);
		});
		console.log("-------------------------------------");

		const readySegments = piece.segments
			.filter(s => s.readiness === 3)
			.sort((a, b) => a.start - b.start);

		for (const seg of readySegments) {
			// Find ALL possible neighbors (not just the first one found)
			const lefts = piece.segments.filter(s => s.end === seg.start - 1 && s.readiness === 3);
			const rights = piece.segments.filter(s => s.start === seg.end + 1 && s.readiness === 3);

			const candidates = [...lefts, ...rights];

			// Filter candidates: Only keep those that result in a VALID merge
			const validCandidates = candidates.filter(target => {
				const newStart = Math.min(seg.start, target.start);
				const newEnd = Math.max(seg.end, target.end);

				// 1. Check if exact exists
				const exactExists = piece.segments.some(s => s.start === newStart && s.end === newEnd);
				if (exactExists) return false;

				// 2. Check for staggered overlaps
				// A staggered overlap is a segment that starts or ends INSIDE the new range,
				// but is not fully contained.
				const staggeredExists = piece.segments.some(s => {
					// Ignore parents
					if (s.id === seg.id || s.id === target.id) return false;

					// Is s contained?
					const isContained = (s.start >= newStart && s.end <= newEnd);
					if (isContained) return false;

					// Does s contain new?
					const containsNew = (s.start <= newStart && s.end >= newEnd);
					if (containsNew) return false;

					// Does it overlap at all?
					const overlaps = (s.start <= newEnd && s.end >= newStart);
					if (!overlaps) return false;

					// If it overlaps but is neither contained nor containing -> STAGGERED.
					return true;
				});

				return !staggeredExists;
			});

			// Select the best candidate from VALID ones
			let mergeTarget: Segment | null = null;

			if (validCandidates.length > 0) {
				// Sort candidates:
				// 1. Prefer Shorter length
				// 2. Prefer Left (start < seg.start)
				validCandidates.sort((a, b) => {
					const lenA = a.end - a.start;
					const lenB = b.end - b.start;
					if (lenA !== lenB) return lenA - lenB;
					// If we are seg [3], left neighbor [2] has start < [3].start. 
					// right neighbor [4] has start > [3].start.
					// "Left wins" -> smaller start wins.
					return a.start - b.start;
				});

				mergeTarget = validCandidates[0];
			}

			if (mergeTarget) {
				const newStart = Math.min(seg.start, mergeTarget.start);
				const newEnd = Math.max(seg.end, mergeTarget.end);

				// Add the new segment
				piece.segments.push({
					id: crypto.randomUUID(),
					start: newStart,
					end: newEnd,
					readiness: 0,
					lastPracticed: null
				});
				console.log(`Merged\n[${newStart}-${newEnd}] 0`);
				this.saveToStorage();
			}
		}
	}

	calculateReadiness(pieceId: string): number {
		const piece = this.getPiece(pieceId);
		if (!piece || piece.totalMeasures === 0) return 0;

		const N = piece.totalMeasures;
		const maxScore = N * N;
		let currentScore = 0;

		for (let m = 1; m <= N; m++) {
			// Find longest segment containing m that is MASTERED (readiness === 3)
			const readySegments = piece.segments.filter(s =>
				s.start <= m && s.end >= m && s.readiness === 3
			);

			if (readySegments.length > 0) {
				// Find the longest length
				const maxLength = Math.max(...readySegments.map(s => s.end - s.start + 1));
				currentScore += maxLength;
			} else {
				// Not mastered in any form. Fallback to base measure readiness.
				const baseSegment = piece.segments.find(s => s.start === m && s.end === m);
				if (baseSegment) {
					// Level 0 = 0
					// Level 1 = 0.25
					// Level 2 = 0.5
					if (baseSegment.readiness === 1) currentScore += 0.25;
					else if (baseSegment.readiness === 2) currentScore += 0.5;
				}
			}
		}

		return Math.round((currentScore / maxScore) * 100);
	}
}
