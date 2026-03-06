export interface MediaPlayer {
	play(): void;
	pause(): void;
	stop(): void;
	seekTo(seconds: number, allowSeekAhead?: boolean): void;
	getCurrentTime(): number;
	getPlayerState(): number; // 1: Playing, 2: Paused, 0: Ended, 5: Cued
	destroy(): void;
	onReady(callback: () => void): void;
}
