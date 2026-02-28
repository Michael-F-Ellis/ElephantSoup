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
	nextDate?: string; // ISO Date
	youtubeId?: string;
	measureOffsets?: Record<number, number>; // Key: measure number, Value: seconds
}

export interface RepertoireData {
	repertoire: Piece[];
}
