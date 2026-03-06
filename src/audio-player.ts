import { MediaPlayer } from './player';

export class LocalAudioPlayer implements MediaPlayer {
	private audio: HTMLAudioElement;
	private isReady: boolean = false;
	private readyCallback: (() => void) | null = null;
	private currentState: number = -1; // Unstarted

	constructor(blob: Blob) {
		const url = URL.createObjectURL(blob);
		this.audio = new Audio(url);

		this.audio.oncanplaythrough = () => {
			if (!this.isReady) {
				this.isReady = true;
				this.currentState = 5; // Cued
				if (this.readyCallback) this.readyCallback();
			}
		};

		this.audio.onplay = () => {
			this.currentState = 1; // Playing
		};

		this.audio.onpause = () => {
			if (this.audio.ended) {
				this.currentState = 0; // Ended
			} else {
				this.currentState = 2; // Paused
			}
		};

		this.audio.onended = () => {
			this.currentState = 0; // Ended
		};
	}

	play(): void {
		this.audio.play().catch(console.error);
	}

	pause(): void {
		this.audio.pause();
	}

	stop(): void {
		this.audio.pause();
		this.audio.currentTime = 0;
		this.currentState = 5; // Cued
	}

	seekTo(seconds: number, _allowSeekAhead: boolean = true): void {
		this.audio.currentTime = seconds;
	}

	getCurrentTime(): number {
		return this.audio.currentTime;
	}

	getPlayerState(): number {
		return this.currentState;
	}

	destroy(): void {
		this.audio.pause();
		URL.revokeObjectURL(this.audio.src);
		this.audio.remove();
	}

	onReady(callback: () => void): void {
		if (this.isReady) {
			callback();
		} else {
			this.readyCallback = callback;
		}
	}
}
