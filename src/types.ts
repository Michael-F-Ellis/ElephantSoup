export interface Segment {
	id: string;
	start: number;
	end: number;
	readiness: number; // 0..3
	lastPracticed: string | null; // ISO Date
	updatedAt: string; // ISO Date
}

export interface Piece {
	id: string;
	name: string;
	totalMeasures: number;
	segments: Segment[];
	nextDate?: string; // ISO Date
	mediaType: 'youtube' | 'local';
	updatedAt: string; // ISO Date
	youtubeId?: string;
	audioFileName?: string;
	measureOffsets?: Record<number, number>; // Key: measure number, Value: seconds
}

export interface RepertoireData {
	repertoire: Piece[];
}
