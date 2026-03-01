import './style.css'
import { RepertoireManager } from './repertoire';
import { Segment, Piece } from './types'; // Added Piece to import
import { MusicRecorder } from './recorder';
import { renderProgressGraph } from './statusgraph';
import { CalibrationManager } from './calibration';

import { extractYouTubeId } from './utils';

// --- App Logic ---

class App {
	manager: RepertoireManager;
	recorder: MusicRecorder;
	calibration: CalibrationManager | null = null;
	practicePlayer: any = null;

	// UI Elements
	repertoireView: HTMLElement;
	practiceView: HTMLElement;
	calibrationView: HTMLElement;
	pieceList: HTMLElement;
	newPieceForm: HTMLElement;
	readinessControls: HTMLElement;
	status: HTMLElement;
	error: HTMLElement;

	recordButton: HTMLButtonElement;
	playButton: HTMLButtonElement;
	playSampleBtn: HTMLButtonElement;

	// State
	currentPieceId: string | null = null;
	practiceQueue: Segment[] = [];
	currentSegment: Segment | null = null;

	// Modal Elements
	resumeModal: HTMLElement;
	resumePieceName: HTMLElement;
	resumeBtn: HTMLElement;
	discardBtn: HTMLElement;
	cancelResumeBtn: HTMLElement;

	constructor() {
		this.manager = new RepertoireManager();
		this.recorder = new MusicRecorder();

		// Bind DOM elements
		this.repertoireView = document.getElementById('repertoire-view')!;
		this.practiceView = document.getElementById('practice-view')!;
		this.calibrationView = document.getElementById('calibration-view')!;
		this.pieceList = document.getElementById('piece-list')!;
		this.newPieceForm = document.getElementById('new-piece-form')!;
		this.readinessControls = document.getElementById('readiness-controls')!;
		this.status = document.getElementById('status')!;
		this.error = document.getElementById('error')!;

		this.recordButton = document.getElementById('recordButton') as HTMLButtonElement;
		this.playButton = document.getElementById('playButton') as HTMLButtonElement;
		this.playSampleBtn = document.getElementById('play-sample-btn') as HTMLButtonElement;

		// Modal
		this.resumeModal = document.getElementById('resume-modal')!;
		this.resumePieceName = document.getElementById('resume-piece-name')!;
		this.resumeBtn = document.getElementById('resume-btn')!;
		this.discardBtn = document.getElementById('discard-btn')!;
		this.cancelResumeBtn = document.getElementById('cancel-resume-btn')!;

		this.init();
	}

	init() {
		this.setupRepertoireUI();
		this.setupPracticeUI();
		this.setupRecorderCallbacks();
		this.setupModalCallbacks();
		this.renderRepertoire();
	}

	setupModalCallbacks() {
		this.resumeBtn.addEventListener('click', () => {
			if (this.currentPieceId) {
				this.resumeSession(this.currentPieceId);
				this.resumeModal.style.display = 'none';
			}
		});

		this.discardBtn.addEventListener('click', () => {
			if (this.currentPieceId) {
				this.discardAndStartSession(this.currentPieceId);
				this.resumeModal.style.display = 'none';
			}
		});

		this.cancelResumeBtn.addEventListener('click', () => {
			this.currentPieceId = null;
			this.resumeModal.style.display = 'none';
		});
	}

	setupRepertoireUI() {
		// Add Piece Button
		document.getElementById('add-piece-btn')?.addEventListener('click', () => {
			this.newPieceForm.style.display = 'block';
			(document.getElementById('add-piece-btn') as HTMLElement).style.display = 'none';
		});

		// Cancel Add Piece
		document.getElementById('cancel-piece-btn')?.addEventListener('click', () => {
			this.newPieceForm.style.display = 'none';
			(document.getElementById('add-piece-btn') as HTMLElement).style.display = 'block';
			(document.getElementById('new-piece-name') as HTMLInputElement).value = '';
			(document.getElementById('new-piece-measures') as HTMLInputElement).value = '';
			(document.getElementById('new-piece-start-measure') as HTMLInputElement).value = '';
			(document.getElementById('new-piece-youtube') as HTMLInputElement).value = '';
		});

		// Save Piece
		document.getElementById('save-piece-btn')?.addEventListener('click', () => {
			const nameFn = document.getElementById('new-piece-name') as HTMLInputElement;
			const measuresFn = document.getElementById('new-piece-measures') as HTMLInputElement;
			const startMeasureFn = document.getElementById('new-piece-start-measure') as HTMLInputElement;
			const youtubeFn = document.getElementById('new-piece-youtube') as HTMLInputElement;

			if (nameFn.value && measuresFn.value) {
				const startVal = startMeasureFn.value ? parseInt(startMeasureFn.value) : 1;
				let ytId: string | undefined = undefined;

				if (youtubeFn.value.trim()) {
					const extracted = extractYouTubeId(youtubeFn.value);
					if (extracted) {
						ytId = extracted;
					} else {
						alert("Could not extract a valid YouTube ID from the provided link or ID. Please check the URL.");
						return;
					}
				}

				this.manager.addPiece(nameFn.value, parseInt(measuresFn.value), startVal, ytId);
				this.renderRepertoire();

				// Reset UI
				this.newPieceForm.style.display = 'none';
				(document.getElementById('add-piece-btn') as HTMLElement).style.display = 'block';
				nameFn.value = '';
				measuresFn.value = '';
				startMeasureFn.value = '';
				youtubeFn.value = '';
			}
		});

		// Import/Export
		const exportModal = document.getElementById('export-modal')!;
		const exportFilenameInput = document.getElementById('export-filename') as HTMLInputElement;
		const exportCleanCheckbox = document.getElementById('export-clean-checkbox') as HTMLInputElement;
		const exportConfirmBtn = document.getElementById('export-confirm-btn')!;
		const exportCancelBtn = document.getElementById('export-cancel-btn')!;

		document.getElementById('export-btn')?.addEventListener('click', () => {
			const dateStr = new Date().toISOString().slice(0, 10);
			const defaultFilename = `elephant_soup_backup_${dateStr}`;

			exportFilenameInput.value = defaultFilename;
			exportCleanCheckbox.checked = false;
			exportModal.style.display = 'flex';
		});

		exportCancelBtn.addEventListener('click', () => {
			exportModal.style.display = 'none';
		});

		exportConfirmBtn.addEventListener('click', async () => {
			const isClean = exportCleanCheckbox.checked;
			let filename = exportFilenameInput.value.trim();
			if (!filename) filename = 'elephant_soup_backup';
			if (!filename.endsWith('.json')) filename += '.json';

			exportModal.style.display = 'none';
			await this.triggerExport(isClean, filename);
		});

		document.getElementById('import-btn')?.addEventListener('click', () => {
			document.getElementById('import-file')?.click();
		});

		document.getElementById('import-file')?.addEventListener('change', (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (evt) => {
				if (evt.target?.result) {
					if (this.manager.importData(evt.target.result as string)) {
						this.renderRepertoire();
						alert('Data imported successfully');
					} else {
						alert('Failed to import data');
					}
				}
			};
			reader.readAsText(file);
		});
	}

	async triggerExport(isClean: boolean, filename: string) {
		const data = isClean ? this.manager.exportCleanData() : this.manager.exportData();
		if (!filename.endsWith('.json')) filename += '.json';

		// Strategy 1: File System Access API (Desktop Chrome/Edge/Opera)
		// Provides a true "Save As" dialog with directory selection.
		if ('showSaveFilePicker' in window) {
			try {
				const handle = await (window as any).showSaveFilePicker({
					suggestedName: filename,
					types: [{
						description: 'JSON File',
						accept: { 'application/json': ['.json'] },
					}],
				});
				const writable = await handle.createWritable();
				await writable.write(data);
				await writable.close();
				return;
			} catch (err: any) {
				// User cancelled or error occurred
				if (err.name === 'AbortError') return;
				console.error('File System Access API failed, falling back', err);
			}
		}

		// Strategy 2: Web Share API (iOS/Android/macOS Safari)
		// On iOS, this allows "Save to Files" which lets the user pick a directory.
		if (navigator.share && navigator.canShare) {
			try {
				const file = new File([data], filename, { type: 'application/json' });
				if (navigator.canShare({ files: [file] })) {
					await navigator.share({
						files: [file],
						title: 'Export Repertoire',
					});
					return;
				}
			} catch (err) {
				console.error('Web Share API failed, falling back', err);
			}
		}

		// Strategy 3: Traditional Download Fallback (Firefox, etc.)
		// Stores to default Downloads folder.
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	setupPracticeUI() {
		// Back/Suspend Button
		document.getElementById('back-to-repertoire')?.addEventListener('click', () => {
			this.suspendSession();
		});

		// Recorder Buttons
		this.recordButton.addEventListener('click', () => this.toggleRecording());
		this.playButton.addEventListener('click', () => this.togglePlayback());
		this.playSampleBtn.addEventListener('click', () => this.playYouTubeSample());

		// Readiness Buttons
		const btns = document.querySelectorAll('.rate-btn');
		btns.forEach(btn => {
			btn.addEventListener('click', (e) => {
				const level = parseInt((e.target as HTMLElement).getAttribute('data-level') || '0');
				this.handleReadiness(level);
			});
		});

		// Keyboard Shortcuts
		document.addEventListener('keydown', (event) => {
			if (this.practiceView.style.display === 'none') return;
			if (this.resumeModal.style.display === 'flex') return;

			if (event.code === 'Space') {
				event.preventDefault();
				if (!this.playButton.disabled) this.playButton.click();
			} else if (event.code === 'Enter') {
				event.preventDefault();
				if (!this.recordButton.disabled && this.readinessControls.style.display === 'none') {
					this.recordButton.click();
				}
			}
		});
	}

	setupRecorderCallbacks() {
		this.recorder.onRecordingFinished = () => {
			this.updateRecorderUI();
			this.readinessControls.style.display = 'none';
		};

		this.recorder.onPlaybackFinished = () => {
			this.updateRecorderUI();
			this.readinessControls.style.display = 'block';
			this.status.textContent = 'Rate this segment:';
		};

		this.recorder.onError = (msg) => {
			this.error.textContent = msg;
			this.error.style.display = 'block';
			setTimeout(() => { this.error.style.display = 'none'; }, 3000);
		};
	}

	// --- Core Flows ---

	getAllPiecesSorted(): { piece: Piece, score: number, isMastered: boolean, nextDate?: Date }[] {
		const pieces = this.manager.getPieces();
		const enriched = pieces.map(piece => ({
			piece,
			score: this.manager.calculateReadiness(piece.id),
			isMastered: this.manager.isMastered(piece.id),
			nextDate: piece.nextDate ? new Date(piece.nextDate) : undefined
		}));

		enriched.sort((a, b) => {
			if (a.isMastered !== b.isMastered) {
				return a.isMastered ? 1 : -1;
			}
			if (!a.isMastered) {
				return a.score - b.score;
			} else {
				const dateA = a.nextDate?.getTime() || Number.MAX_VALUE;
				const dateB = b.nextDate?.getTime() || Number.MAX_VALUE;
				return dateA - dateB;
			}
		});

		return enriched;
	}

	renderRepertoire() {
		this.pieceList.innerHTML = '';
		const sortedItems = this.getAllPiecesSorted();

		if (sortedItems.length === 0) {
			this.pieceList.innerHTML = '<div style="color:#666; padding:20px;">No pieces yet. Add one to start!</div>';
			return;
		}

		sortedItems.forEach(item => {
			const { piece, score } = item;
			const el = document.createElement('div');
			el.className = 'piece-item';

			const hasSession = !!this.manager.getSession(piece.id);
			const sessionIndicator = hasSession ? '<span style="color: #0a84ff; margin-right:8px; font-size:0.8em"><i class="fas fa-pause-circle"></i> Resumable</span>' : '';

			let dueDisplay = '';
			if (piece.nextDate) {
				const due = new Date(piece.nextDate);
				if (due > new Date()) {
					dueDisplay = `<br><span style="color: #888; font-size: 0.8em"><i class="fas fa-clock"></i> Due: ${due.toLocaleDateString()}</span>`;
				}
			}

			el.innerHTML = `
                <div class="piece-info">
                    <strong>${piece.name}</strong><br>
                    <span style="font-size:0.9em; color:#aaa">${piece.totalMeasures} measures</span>
					${hasSession ? '<br>' + sessionIndicator : ''}
					${dueDisplay}
                </div>
                <div style="font-weight:bold; color: ${this.getScoreColor(score)}; margin-right: 15px;">
                    ${score}%
                </div>
				<div class="piece-actions">
					<button class="cal-btn" data-id="${piece.id}" title="Calibrate YouTube"><i class="fas fa-cog"></i></button>
					<button class="delete-btn" data-id="${piece.id}"><i class="fas fa-trash"></i></button>
				</div>
                ${renderProgressGraph(piece)}
            `;

			el.querySelector('.delete-btn')?.addEventListener('click', (e) => {
				e.stopPropagation();
				if (confirm(`Delete "${piece.name}"?`)) {
					this.manager.deletePiece(piece.id);
					this.renderRepertoire();
				}
			});

			el.querySelector('.cal-btn')?.addEventListener('click', (e) => {
				e.stopPropagation();
				this.startCalibration(piece.id);
			});

			el.addEventListener('click', () => {
				this.startSession(piece.id);
			});

			this.pieceList.appendChild(el);
		});
	}

	startCalibration(pieceId: string) {
		const piece = this.manager.getPiece(pieceId);
		if (!piece) return;

		if (!piece.youtubeId) {
			const id = prompt("Please enter YouTube Video ID:");
			if (!id) return;
			piece.youtubeId = id;
		}

		this.repertoireView.style.display = 'none';
		this.calibrationView.style.display = 'flex';

		this.calibration = new CalibrationManager(piece, (offsets) => {
			this.manager.updatePieceYoutube(pieceId, piece.youtubeId!, offsets);
			this.stopCalibration();
		}, () => {
			this.stopCalibration();
		});

		this.calibration.initPlayer();
	}

	stopCalibration() {
		if (this.calibration) {
			this.calibration.destroy();
			this.calibration = null;
		}
		this.calibrationView.style.display = 'none';
		this.repertoireView.style.display = 'block';
		this.renderRepertoire();
	}

	startSession(pieceId: string) {
		this.currentPieceId = pieceId;
		const session = this.manager.getSession(pieceId);

		if (session) {
			const piece = this.manager.getPiece(pieceId);
			if (piece) {
				this.resumePieceName.textContent = piece.name;
				this.resumeModal.style.display = 'flex';
			}
		} else {
			this.discardAndStartSession(pieceId);
		}
	}

	discardAndStartSession(pieceId: string) {
		this.manager.clearSession(pieceId);
		this.practiceQueue = this.manager.getPracticeQueue(pieceId);
		this.activateSessionView(pieceId);
	}

	resumeSession(pieceId: string) {
		const queue = this.manager.getSession(pieceId);
		if (queue) {
			this.practiceQueue = queue;
			this.manager.clearSession(pieceId);
			this.activateSessionView(pieceId);
		} else {
			this.discardAndStartSession(pieceId);
		}
	}

	activateSessionView(pieceId: string) {
		const piece = this.manager.getPiece(pieceId);
		if (!piece) return;

		this.repertoireView.style.display = 'none';
		this.practiceView.style.display = 'block';
		document.getElementById('current-piece-name')!.textContent = piece.name;

		// Init YouTube Player if needed
		if (piece.youtubeId && piece.measureOffsets) {
			// @ts-ignore
			this.practicePlayer = new YT.Player('practice-youtube-player', {
				height: '0',
				width: '0',
				videoId: piece.youtubeId,
				playerVars: { 'playsinline': 1 },
				events: {
					'onReady': () => {
						this.loadNextSegment();
					}
				}
			});
		} else {
			this.loadNextSegment();
		}
	}

	suspendSession() {
		if (this.currentPieceId) {
			if (this.currentSegment) {
				this.practiceQueue.unshift(this.currentSegment);
			}
			if (this.practiceQueue.length > 0) {
				this.manager.saveSession(this.currentPieceId, this.practiceQueue);
			}
			this.stopSession();
		}
	}

	updateSuspendButton() {
		const btn = document.getElementById('back-to-repertoire');
		if (btn) {
			const count = this.practiceQueue.length + (this.currentSegment ? 1 : 0);
			btn.innerHTML = `<i class="fas fa-arrow-left"></i> Suspend (${count} remaining)`;
		}
	}

	stopSession() {
		this.recorder.stopPlaying();
		this.recorder.stopRecording();
		if (this.practicePlayer) {
			this.practicePlayer.destroy();
			this.practicePlayer = null;
		}
		this.repertoireView.style.display = 'block';
		this.practiceView.style.display = 'none';
		this.currentPieceId = null;
		this.currentSegment = null;
		const btn = document.getElementById('back-to-repertoire');
		if (btn) btn.innerHTML = '<i class="fas fa-arrow-left"></i> Suspend';
		this.renderRepertoire();
	}

	loadNextSegment() {
		if (this.practiceQueue.length === 0) {
			alert("Session complete! Great work.");
			this.stopSession();
			return;
		}

		this.currentSegment = this.practiceQueue.shift() || null;
		this.updateSuspendButton();

		if (this.currentSegment) {
			const display = document.getElementById('current-segment-display')!;
			display.textContent = (this.currentSegment.start === this.currentSegment.end)
				? `Measure ${this.currentSegment.start}`
				: `Measures ${this.currentSegment.start} - ${this.currentSegment.end}`;

			// Handle Sample Button visibility
			const piece = this.manager.getPiece(this.currentPieceId!)!;
			if (piece.measureOffsets && piece.measureOffsets[this.currentSegment.start]) {
				this.playSampleBtn.style.display = 'flex';
				this.playSampleBtn.disabled = false;
			} else {
				this.playSampleBtn.style.display = 'none';
			}

			this.readinessControls.style.display = 'none';
			this.recorder.hasRecording = false;
			this.recorder.audioChunks = [];
			this.status.textContent = 'Ready to record';
			this.updateRecorderUI();
		}
	}

	async toggleRecording() {
		if (this.recorder.isRecording) {
			this.recorder.stopRecording();
		} else {
			await this.recorder.startRecording();
			this.status.textContent = 'Recording...';
			this.updateRecorderUI();
		}
	}

	togglePlayback() {
		if (this.recorder.isPlaying) {
			this.recorder.stopPlaying();
		} else {
			this.recorder.playRecording();
			this.status.textContent = 'Playing...';
			this.updateRecorderUI();
		}
	}

	playYouTubeSample() {
		const piece = this.manager.getPiece(this.currentPieceId!)!;
		if (!this.currentSegment || !piece.measureOffsets || !this.practicePlayer) return;

		const startTime = piece.measureOffsets[this.currentSegment.start];
		const endTime = piece.measureOffsets[this.currentSegment.end + 1] || (startTime + 5); // Default 5s if last

		const preRoll = 2;
		const postRoll = 1;

		this.practicePlayer.seekTo(Math.max(0, startTime - preRoll), true);
		this.practicePlayer.playVideo();

		this.status.textContent = 'Playing YouTube sample...';
		this.playSampleBtn.disabled = true;

		// Monitor for stop
		const checkEnd = setInterval(() => {
			if (this.practicePlayer.getCurrentTime() >= endTime + postRoll) {
				this.practicePlayer.pauseVideo();
				clearInterval(checkEnd);
				this.playSampleBtn.disabled = false;
				this.status.textContent = 'Ready to record';
			}
		}, 100);
	}

	handleReadiness(level: number) {
		if (this.currentPieceId && this.currentSegment) {
			this.manager.updateSegmentReadiness(this.currentPieceId, this.currentSegment.id, level);
			this.loadNextSegment();
		}
	}

	updateRecorderUI() {
		const { isRecording, isPlaying, hasRecording } = this.recorder;
		if (isRecording) {
			this.recordButton.classList.add('recording');
			this.recordButton.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
			this.playButton.disabled = true;
		} else {
			this.recordButton.classList.remove('recording');
			this.recordButton.innerHTML = '<i class="fas fa-microphone"></i><span>Record</span>';
			this.recordButton.disabled = isPlaying;
		}

		if (isPlaying) {
			this.playButton.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
		} else {
			this.playButton.disabled = !hasRecording || isRecording;
			this.playButton.innerHTML = '<i class="fas fa-play"></i><span>Play Recording</span>';
		}
	}

	getScoreColor(score: number): string {
		if (score < 25) return '#ff453a';
		if (score < 50) return '#ff9f0a';
		if (score < 75) return '#ffd60a';
		return '#30d158';
	}
}

document.addEventListener('DOMContentLoaded', () => {
	new App();
});
