import { Segment, Piece, RepertoireData } from './types';

export class RepertoireManager {
	private data: RepertoireData;
	private sessions: { [pieceId: string]: Segment[] } = {};
	private readonly STORAGE_KEY = 'elephant_soup_repertoire';
	private readonly STORAGE_KEY_SESSIONS = 'elephant_soup_sessions';
	private syncTimeout: number | null = null;
	private isSyncing = false;

	constructor() {
		this.data = this.loadFromStorage();
		this.migrateData();
		this.sessions = this.loadSessionsFromStorage();
		this.initServerSync();
	}

	private isServerMode(): boolean {
		// Detect if we are served by rp-server. 
		// Exclude port 5173 (Vite dev server) so tests run in local-only mode.
		return window.location.pathname.startsWith('/apps/elephantsoup/') && window.location.port !== '5173';
	}

	private async initServerSync() {
		if (this.isServerMode()) {
			await this.loadFromServer();
		}
	}

	private async loadFromServer() {
		try {
			const resp = await fetch('/apps/elephantsoup/repertoire/load');
			if (resp.ok) {
				const remoteData = await resp.json();
				if (remoteData && Array.isArray(remoteData.repertoire)) {
					console.log("Syncing with server data...");
					const result = this.importData(JSON.stringify(remoteData));
					if (result.status) {
						console.log(result.summary);
					}
				}
			}
		} catch (e) {
			console.error("Failed to load repertoire from server", e);
		}
	}

	private async syncWithServer() {
		if (!this.isServerMode() || this.isSyncing) return;

		// Debounce saves
		if (this.syncTimeout) {
			window.clearTimeout(this.syncTimeout);
		}

		this.syncTimeout = window.setTimeout(async () => {
			this.isSyncing = true;
			try {
				const resp = await fetch('/apps/elephantsoup/repertoire/save', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(this.data)
				});
				if (!resp.ok) {
					console.error("Server save failed", await resp.text());
				} else {
					console.log("Repertoire auto-saved to server");
				}
			} catch (e) {
				console.error("Error syncing with server", e);
			} finally {
				this.isSyncing = false;
				this.syncTimeout = null;
			}
		}, 5000); // 5 second debounce
	}

	private migrateData() {
		let changed = false;
		const now = new Date().toISOString();

		this.data.repertoire.forEach(piece => {
			// Migration 1: Ensure nextDate exists for mastered pieces (1 active segment)
			if (this.isMastered(piece.id) && !piece.nextDate) {
				piece.nextDate = now;
				changed = true;
			}

			// Migration 2: Ensure mediaType exists
			if (!piece.mediaType) {
				piece.mediaType = 'youtube';
				changed = true;
			}

			// Migration 3: Ensure updatedAt exists
			if (!piece.updatedAt) {
				piece.updatedAt = now;
				changed = true;
			}

			piece.segments.forEach(seg => {
				if (!seg.updatedAt) {
					seg.updatedAt = seg.lastPracticed || now;
					changed = true;
				}
			});
		});

		if (changed) {
			this.saveToStorage();
		}
	}

	private loadSessionsFromStorage(): { [pieceId: string]: Segment[] } {
		const stored = localStorage.getItem(this.STORAGE_KEY_SESSIONS);
		if (stored) {
			try {
				return JSON.parse(stored);
			} catch (e) {
				console.error("Failed to parse session data", e);
			}
		}
		return {};
	}

	private saveSessionsToStorage() {
		localStorage.setItem(this.STORAGE_KEY_SESSIONS, JSON.stringify(this.sessions));
	}

	// Session Management
	saveSession(pieceId: string, queue: Segment[]) {
		this.sessions[pieceId] = queue;
		this.saveSessionsToStorage();
	}

	getSession(pieceId: string): Segment[] | null {
		return this.sessions[pieceId] || null;
	}

	clearSession(pieceId: string) {
		if (this.sessions[pieceId]) {
			delete this.sessions[pieceId];
			this.saveSessionsToStorage();
		}
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
		this.syncWithServer();
	}

	// Export current data as JSON string
	exportData(): string {
		return JSON.stringify(this.data, null, 2);
	}

	// Export a 'clean' version with no progress/merges
	exportCleanData(): string {
		const cleanData: RepertoireData = {
			repertoire: this.data.repertoire.map(piece => {
				const startMeasure = (piece.segments.length > 0)
					? Math.min(...piece.segments.map(s => s.start))
					: 1;

				const cleanSegments: Segment[] = [];
				for (let i = 0; i < piece.totalMeasures; i++) {
					const m = startMeasure + i;
					cleanSegments.push({
						id: crypto.randomUUID(),
						start: m,
						end: m,
						readiness: 0,
						lastPracticed: null,
						updatedAt: new Date().toISOString()
					});
				}

				return {
					id: crypto.randomUUID(),
					name: piece.name,
					totalMeasures: piece.totalMeasures,
					segments: cleanSegments,
					youtubeId: piece.youtubeId,
					mediaType: piece.mediaType,
					audioFileName: piece.audioFileName,
					measureOffsets: piece.measureOffsets,
					updatedAt: new Date().toISOString()
				};
			})
		};
		return JSON.stringify(cleanData, null, 2);
	}

	// Import data with Smart Merge
	importData(json: string): { status: boolean, summary?: string } {
		try {
			const parsed = JSON.parse(json) as RepertoireData;
			if (!parsed || !Array.isArray(parsed.repertoire)) return { status: false };

			let piecesAdded = 0;
			let piecesUpdated = 0;
			let segmentsUpdated = 0;

			const now = new Date().toISOString();

			parsed.repertoire.forEach(importedPiece => {
				const localPiece = this.getPiece(importedPiece.id);

				if (!localPiece) {
					// New Piece
					this.data.repertoire.push(importedPiece);
					piecesAdded++;
				} else {
					// Existing Piece - Start Merge Logic
					let pieceModified = false;

					// Meta-data merge: If imported is newer, take its meta-data
					const importedTime = new Date(importedPiece.updatedAt || 0).getTime();
					const localTime = new Date(localPiece.updatedAt || 0).getTime();

					if (importedTime > localTime) {
						localPiece.name = importedPiece.name;
						localPiece.totalMeasures = importedPiece.totalMeasures;
						localPiece.mediaType = importedPiece.mediaType;
						localPiece.youtubeId = importedPiece.youtubeId;
						localPiece.audioFileName = importedPiece.audioFileName;
						localPiece.measureOffsets = importedPiece.measureOffsets;
						localPiece.nextDate = importedPiece.nextDate;
						localPiece.updatedAt = importedPiece.updatedAt;
						pieceModified = true;
						piecesUpdated++;
					}

					// Segment merge: Check each imported segment
					importedPiece.segments.forEach(importedSeg => {
						const localSeg = localPiece.segments.find(s => s.id === importedSeg.id);

						if (!localSeg) {
							// New segment (e.g. from a merge that happened on on the other device)
							localPiece.segments.push(importedSeg);
							segmentsUpdated++;
							pieceModified = true;
						} else {
							// Check which is newer
							const importedSegTime = Math.max(
								new Date(importedSeg.updatedAt || 0).getTime(),
								importedSeg.lastPracticed ? new Date(importedSeg.lastPracticed).getTime() : 0
							);
							const localSegTime = Math.max(
								new Date(localSeg.updatedAt || 0).getTime(),
								localSeg.lastPracticed ? new Date(localSeg.lastPracticed).getTime() : 0
							);

							if (importedSegTime > localSegTime) {
								localSeg.readiness = importedSeg.readiness;
								localSeg.lastPracticed = importedSeg.lastPracticed;
								localSeg.updatedAt = importedSeg.updatedAt;
								localSeg.start = importedSeg.start;
								localSeg.end = importedSeg.end;
								segmentsUpdated++;
								pieceModified = true;
							}
						}
					});

					if (pieceModified) {
						localPiece.updatedAt = importedTime > localTime ? importedPiece.updatedAt : now;
					}
				}
			});

			if (piecesAdded > 0 || piecesUpdated > 0 || segmentsUpdated > 0) {
				this.saveToStorage();
				const summary = `Import complete: ${piecesAdded} new, ${piecesUpdated} pieces updated, ${segmentsUpdated} segments synced.`;
				return { status: true, summary };
			}

			return { status: true, summary: "Already up to date." };

		} catch (e) {
			console.error("Import failed", e);
		}
		return { status: false };
	}

	getPieces(): Piece[] {
		return this.data.repertoire;
	}

	getPiece(id: string): Piece | undefined {
		return this.data.repertoire.find(p => p.id === id);
	}

	addPiece(name: string, totalMeasures: number, startMeasure: number = 1, youtubeId?: string, mediaType: 'youtube' | 'local' = 'youtube', audioFileName?: string): Piece {
		const now = new Date().toISOString();
		const newPiece: Piece = {
			id: crypto.randomUUID(),
			name,
			totalMeasures,
			segments: [],
			mediaType,
			youtubeId,
			audioFileName,
			updatedAt: now
		};

		// Generate initial 1-measure segments
		for (let i = 0; i < totalMeasures; i++) {
			const measureNum = startMeasure + i;
			newPiece.segments.push({
				id: crypto.randomUUID(),
				start: measureNum,
				end: measureNum,
				readiness: 0,
				lastPracticed: null,
				updatedAt: now
			});
		}

		this.data.repertoire.push(newPiece);
		this.saveToStorage();
		return newPiece;
	}

	updatePieceYoutube(pieceId: string, youtubeId: string, measureOffsets: Record<number, number>) {
		const piece = this.getPiece(pieceId);
		if (!piece) return;

		piece.youtubeId = youtubeId;
		piece.mediaType = 'youtube';
		piece.measureOffsets = measureOffsets;

		this.syncMeasureCount(piece, measureOffsets);
		piece.updatedAt = new Date().toISOString();
		this.saveToStorage();
	}

	updatePieceAudio(pieceId: string, fileName: string, measureOffsets: Record<number, number>) {
		const piece = this.getPiece(pieceId);
		if (!piece) return;

		piece.audioFileName = fileName;
		piece.mediaType = 'local';
		piece.measureOffsets = measureOffsets;

		this.syncMeasureCount(piece, measureOffsets);
		piece.updatedAt = new Date().toISOString();
		this.saveToStorage();
	}

	private syncMeasureCount(piece: Piece, measureOffsets: Record<number, number>) {
		const measureNums = Object.keys(measureOffsets).map(Number);
		if (measureNums.length > 0) {
			const maxMeasureMapped = Math.max(...measureNums);
			const startMeasure = (piece.segments.length > 0) ? Math.min(...piece.segments.map(s => s.start)) : 1;
			const mappedCount = maxMeasureMapped - startMeasure + 1;

			if (mappedCount > piece.totalMeasures) {
				const diff = mappedCount - piece.totalMeasures;
				// Add extra segments for the new measures
				for (let i = 0; i < diff; i++) {
					const m = piece.totalMeasures + startMeasure + i;
					piece.segments.push({
						id: crypto.randomUUID(),
						start: m,
						end: m,
						readiness: 0,
						lastPracticed: null,
						updatedAt: new Date().toISOString()
					});
				}
				piece.totalMeasures = mappedCount;
			}
		}
	}

	deletePiece(id: string) {
		this.data.repertoire = this.data.repertoire.filter(p => p.id !== id);
		this.saveToStorage();
		this.clearSession(id);
	}

	// Helper to get active segments (filtering out redundant ones)
	private getActiveSegments(piece: Piece): Segment[] {
		return piece.segments.filter(seg => {
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
		const filteredSegments = this.getActiveSegments(piece);

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

		const previousLastPracticed = segment.lastPracticed;
		segment.readiness = newReadiness;
		segment.lastPracticed = new Date().toISOString();

		// Spaced Repetition Logic for mastered pieces (1 active segment)
		if (this.getActiveSegments(piece).length === 1) {
			const now = new Date();
			const oneDayMs = 24 * 60 * 60 * 1000;
			let nextDateObj: Date;

			// Calculate elapsed
			let elapsedMs = oneDayMs; // Default fallback
			if (previousLastPracticed) {
				elapsedMs = now.getTime() - new Date(previousLastPracticed).getTime();
			}
			// Should we use Math.max(0, ...) to prevent negative elapsed?
			if (elapsedMs < 0) elapsedMs = 0;

			const elapsedDays = elapsedMs / oneDayMs;

			if (newReadiness === 0) {
				// today's date
				nextDateObj = now;
			} else if (newReadiness === 1) {
				// today + 1 day
				nextDateObj = new Date(now.getTime() + oneDayMs);
			} else if (newReadiness === 2) {
				// today + max(1 day, elapsed)
				const addDays = Math.max(1, elapsedDays);
				nextDateObj = new Date(now.getTime() + (addDays * oneDayMs));
			} else if (newReadiness === 3) {
				// today + max(2 days, 2 * elapsed)
				const addDays = Math.max(2, 2 * elapsedDays);
				nextDateObj = new Date(now.getTime() + (addDays * oneDayMs));
			} else {
				nextDateObj = now;
			}

			// Enforce 1 year cap
			const oneYearFromNow = new Date(now.getTime() + (365 * oneDayMs));
			if (nextDateObj > oneYearFromNow) {
				nextDateObj = oneYearFromNow;
			}

			piece.nextDate = nextDateObj.toISOString();
		}

		segment.updatedAt = new Date().toISOString();
		piece.updatedAt = new Date().toISOString();
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

				const now = new Date().toISOString();
				piece.segments.push({
					id: crypto.randomUUID(),
					start: newStart,
					end: newEnd,
					readiness: 0,
					lastPracticed: null,
					updatedAt: now
				});
				piece.updatedAt = now;
				console.log(`Merged\n[${newStart}-${newEnd}] 0`);
				this.saveToStorage();
			}
		}
	}

	calculateReadiness(pieceId: string): number {
		const piece = this.getPiece(pieceId);
		if (!piece || piece.totalMeasures === 0) return 0;

		const N = piece.totalMeasures;
		// Determine the actual start measure to calculate readiness correctly
		const startM = piece.segments.length > 0 ? Math.min(...piece.segments.map(s => s.start)) : 1;
		const maxScore = N * N;
		let currentScore = 0;

		for (let m = startM; m < startM + N; m++) {
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
	isMastered(pieceId: string): boolean {
		const piece = this.getPiece(pieceId);
		if (!piece) return false;
		return this.getActiveSegments(piece).length === 1;
	}
}
