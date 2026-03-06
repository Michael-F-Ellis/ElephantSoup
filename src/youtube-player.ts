import { MediaPlayer } from './player';

export class YoutubePlayer implements MediaPlayer {
	private player: any;
	private readyCallback: (() => void) | null = null;
	private isReady: boolean = false;

	constructor(containerId: string, videoId: string, options: any = {}) {
		// @ts-ignore
		this.player = new YT.Player(containerId, {
			height: options.height || '100%',
			width: options.width || '100%',
			videoId: videoId,
			playerVars: options.playerVars || {
				'playsinline': 1,
				'rel': 0
			},
			events: {
				'onReady': () => {
					this.isReady = true;
					if (this.readyCallback) {
						this.readyCallback();
					}
					if (options.events?.onReady) {
						options.events.onReady();
					}
				},
				...options.events
			}
		});
	}

	play(): void {
		this.player.playVideo();
	}

	pause(): void {
		this.player.pauseVideo();
	}

	stop(): void {
		this.player.stopVideo();
	}

	seekTo(seconds: number, allowSeekAhead: boolean = true): void {
		this.player.seekTo(seconds, allowSeekAhead);
	}

	getCurrentTime(): number {
		return this.player.getCurrentTime ? this.player.getCurrentTime() : 0;
	}

	getPlayerState(): number {
		return this.player.getPlayerState ? this.player.getPlayerState() : -1;
	}

	destroy(): void {
		if (this.player && this.player.destroy) {
			this.player.destroy();
		}
	}

	onReady(callback: () => void): void {
		if (this.isReady) {
			callback();
		} else {
			this.readyCallback = callback;
		}
	}
}
