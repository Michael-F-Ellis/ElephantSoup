import { Piece } from './types';

export class CalibrationManager {
	private piece: Piece;
	private player: any;
	private entryMode: boolean = false;
	private offsets: number[] = []; // Raw array of timestamps
	private onSave: (offsets: Record<number, number>) => void;
	private onExit: () => void;

	// UI Elements
	private container: HTMLElement;
	private dotGrid: HTMLElement;
	private playBtn: HTMLElement;
	private pauseBtn: HTMLElement;
	private entryBtn: HTMLElement;
	private nudgePopup: HTMLElement;
	private nudgeSlider: HTMLInputElement;
	private nudgeVal: HTMLElement;
	private nudgeMeasureNum: HTMLElement;

	private selectedIndex: number | null = null;
	private startMeasure: number = 1;

	constructor(piece: Piece, onSave: (offsets: Record<number, number>) => void, onExit: () => void) {
		this.piece = piece;
		this.onSave = onSave;
		this.onExit = onExit;
		this.startMeasure = (piece.segments.length > 0) ? Math.min(...piece.segments.map(s => s.start)) : 1;

		// Initialize offsets from piece if available
		if (piece.measureOffsets) {
			const sortedKeys = Object.keys(piece.measureOffsets).map(Number).sort((a, b) => a - b);
			this.offsets = sortedKeys.map(k => piece.measureOffsets![k]);
		}

		this.container = document.getElementById('calibration-view')!;
		this.dotGrid = document.getElementById('dot-grid')!;
		this.playBtn = document.getElementById('cal-play')!;
		this.pauseBtn = document.getElementById('cal-pause')!;
		this.entryBtn = document.getElementById('cal-entry-mode')!;

		this.nudgePopup = document.getElementById('nudge-popup')!;
		this.nudgeSlider = document.getElementById('nudge-slider') as HTMLInputElement;
		this.nudgeVal = document.getElementById('nudge-offset-val')!;
		this.nudgeMeasureNum = document.getElementById('nudge-measure-num')!;

		this.setupUI();
	}

	private setupUI() {
		document.getElementById('cal-piece-name')!.textContent = `Calibration: ${this.piece.name}`;

		// Back Button
		document.getElementById('cal-back-btn')!.onclick = () => {
			if (this.offsets.length > 0 && confirm("Exit without saving?")) {
				this.onExit();
			} else if (this.offsets.length === 0) {
				this.onExit();
			}
		};

		// Entry Mode
		this.entryBtn.onclick = () => this.toggleEntryMode();

		// Save
		document.getElementById('cal-save')!.onclick = () => this.save();

		// Seek
		document.getElementById('cal-seek-prev')!.onclick = () => this.seekByMeasure(-1);
		document.getElementById('cal-seek-next')!.onclick = () => this.seekByMeasure(1);

		// Nudge Popup Controls
		document.getElementById('nudge-save-btn')!.onclick = () => this.applyNudge();
		document.getElementById('nudge-cancel-btn')!.onclick = () => this.closeNudge();
		document.getElementById('nudge-delete-btn')!.onclick = () => this.deleteMeasure();

		this.nudgeSlider.oninput = () => {
			this.nudgeVal.textContent = `${parseFloat(this.nudgeSlider.value).toFixed(2)}s`;
		};

		this.renderGrid();
	}

	public initPlayer() {
		// @ts-ignore
		this.player = new YT.Player('youtube-player', {
			height: '100%',
			width: '100%',
			videoId: this.piece.youtubeId,
			playerVars: {
				'playsinline': 1,
				'rel': 0
			},
			events: {
				'onReady': () => {
					this.playBtn.onclick = () => {
						if (this.selectedIndex !== null && this.offsets[this.selectedIndex] !== undefined) {
							const startTime = Math.max(0, this.offsets[this.selectedIndex] - 2);
							this.player.seekTo(startTime, true);
						}
						this.player.playVideo();
						this.playBtn.style.display = 'none';
						this.pauseBtn.style.display = 'flex';
					};
					this.pauseBtn.onclick = () => {
						this.player.pauseVideo();
						this.playBtn.style.display = 'flex';
						this.pauseBtn.style.display = 'none';
					};
					document.getElementById('cal-stop')!.onclick = () => {
						this.player.stopVideo();
						this.playBtn.style.display = 'flex';
						this.pauseBtn.style.display = 'none';
					};
					this.startStatusPoller();
				}
			}
		});
	}

	private startStatusPoller() {
		const poll = () => {
			if (this.container.style.display !== 'none' && this.player && this.player.getCurrentTime) {
				const time = this.player.getCurrentTime();
				this.updatePlayhead(time);
			}
			requestAnimationFrame(poll);
		};
		poll();
	}

	private updatePlayhead(time: number) {
		this.offsets.forEach((offset, index) => {
			const dot = document.querySelector(`.dot[data-index="${index}"]`);
			if (dot) {
				if (Math.abs(time - offset) < 0.2) {
					dot.classList.add('now-playing');
				} else {
					dot.classList.remove('now-playing');
				}
			}
		});
	}

	private toggleEntryMode() {
		this.entryMode = !this.entryMode;
		this.entryBtn.classList.toggle('active', this.entryMode);

		if (this.entryMode) {
			// Listen for taps
			window.addEventListener('keydown', this.handleKey);
			this.dotGrid.addEventListener('click', this.handleTap);
		} else {
			window.removeEventListener('keydown', this.handleKey);
			this.dotGrid.removeEventListener('click', this.handleTap);
		}
	}

	private handleKey = (e: KeyboardEvent) => {
		if (e.code === 'Space' || e.code === 'Enter') {
			e.preventDefault();
			this.recordTap();
		}
	}

	private handleTap = (e: MouseEvent) => {
		// Only record if we didn't click on an existing dot
		if ((e.target as HTMLElement).classList.contains('dot')) return;
		this.recordTap();
	}

	private recordTap() {
		if (!this.player) return;
		// Only record if playing (State 1 = Playing)
		if (this.player.getPlayerState() !== 1) return;

		const time = this.player.getCurrentTime();
		this.offsets.push(time);
		this.offsets.sort((a, b) => a - b);
		this.renderGrid();
	}

	private renderGrid() {
		this.dotGrid.innerHTML = '';
		const itemsPerRow = 8;

		// Calculate row durations to find max duration for scaling
		const rowDurations: number[] = [];
		for (let i = 0; i < this.offsets.length; i += itemsPerRow) {
			const rowStart = this.offsets[i];
			const nextRowStart = this.offsets[i + itemsPerRow] || (this.offsets[this.offsets.length - 1] + 5);
			rowDurations.push(nextRowStart - rowStart);
		}
		const maxDuration = Math.max(...rowDurations, 5);

		for (let i = 0; i < this.offsets.length; i += itemsPerRow) {
			const line = document.createElement('div');
			line.className = 'measure-line';

			const label = document.createElement('div');
			label.className = 'measure-num-label';
			label.textContent = (this.startMeasure + i).toString();
			line.appendChild(label);

			const dotsContainer = document.createElement('div');
			dotsContainer.className = 'dots-container';

			const rowStartTime = this.offsets[i];

			for (let j = i; j < Math.min(i + itemsPerRow, this.offsets.length); j++) {
				const dot = document.createElement('div');
				dot.className = 'dot captured';
				if (this.selectedIndex === j) dot.classList.add('selected');
				dot.setAttribute('data-index', j.toString());

				// Position proportionally
				if (this.entryMode) {
					dot.style.marginRight = 'auto'; // Even spacing during capture
				} else {
					const offsetInRow = this.offsets[j] - rowStartTime;
					const percent = (offsetInRow / maxDuration) * 100;
					dot.style.position = 'absolute';
					dot.style.left = `${percent}%`;
				}

				dot.onclick = (e) => {
					e.stopPropagation();
					this.selectedIndex = j;
					this.player.seekTo(this.offsets[j], true);
					this.renderGrid();
				};

				dot.ondblclick = (e) => {
					e.stopPropagation();
					this.openNudge(j);
				};

				dotsContainer.appendChild(dot);
			}
			line.appendChild(dotsContainer);
			this.dotGrid.appendChild(line);
		}
	}

	private seekByMeasure(delta: number) {
		if (this.offsets.length === 0 || !this.player) return;
		const currentTime = this.player.getCurrentTime();

		// Find nearest measure
		let targetIndex = 0;
		let minDiff = Infinity;

		this.offsets.forEach((off, idx) => {
			const diff = Math.abs(currentTime - off);
			if (diff < minDiff) {
				minDiff = diff;
				targetIndex = idx;
			}
		});

		targetIndex = Math.max(0, Math.min(this.offsets.length - 1, targetIndex + delta));
		this.player.seekTo(this.offsets[targetIndex], true);
	}

	private openNudge(index: number) {
		if (this.entryMode) return;
		this.selectedIndex = index;
		this.nudgeMeasureNum.textContent = (this.startMeasure + index).toString();
		this.nudgeSlider.value = "0";
		this.nudgeVal.textContent = "0.00s";

		// Set min/max based on neighbors
		const min = (index > 0) ? this.offsets[index - 1] - this.offsets[index] + 0.1 : -10;
		const max = (index < this.offsets.length - 1) ? this.offsets[index + 1] - this.offsets[index] - 0.1 : 10;

		this.nudgeSlider.min = Math.max(-5, min).toString();
		this.nudgeSlider.max = Math.min(5, max).toString();

		this.nudgePopup.style.display = 'flex';
	}

	private applyNudge() {
		if (this.selectedIndex !== null) {
			this.offsets[this.selectedIndex] += parseFloat(this.nudgeSlider.value);
			this.renderGrid();
		}
		this.closeNudge();
	}

	private deleteMeasure() {
		if (this.selectedIndex !== null && confirm("Delete this measure start?")) {
			this.offsets.splice(this.selectedIndex, 1);
			this.selectedIndex = null;
			this.renderGrid();
		}
		this.closeNudge();
	}

	private closeNudge() {
		this.nudgePopup.style.display = 'none';
	}

	private save() {
		const record: Record<number, number> = {};
		this.offsets.forEach((off, i) => {
			record[this.startMeasure + i] = off;
		});
		this.onSave(record);
	}

	public destroy() {
		if (this.player) {
			this.player.destroy();
		}
		window.removeEventListener('keydown', this.handleKey);
	}
}
