import './style.css'
import { RepertoireManager, Segment } from './repertoire';

// --- Recorder Logic (Refactored) ---

const constraints = {
	audio: {
		sampleRate: { ideal: 44100 },
		channelCount: { ideal: 2 },
		echoCancellation: false,
		noiseSuppression: false,
		autoGainControl: false
	},
	video: false
};

function getBestAudioRecorderOptions(): MediaRecorderOptions {
	const opusMime = 'audio/webm; codecs=opus';
	const aacMime = 'audio/mp4; codecs=mp4a.40.2';
	const bitrate = 256000;
	let mimeType: string = '';

	if (MediaRecorder.isTypeSupported(opusMime)) {
		mimeType = opusMime;
	} else if (MediaRecorder.isTypeSupported(aacMime)) {
		mimeType = aacMime;
	} else {
		mimeType = 'audio/webm';
		if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/mp4';
	}

	return { mimeType, audioBitsPerSecond: bitrate };
}

class MusicRecorder {
	mediaRecorder: MediaRecorder | null = null;
	audioChunks: Blob[] = [];
	currentAudioBlob: Blob | null = null;
	isRecording: boolean = false;
	hasRecording: boolean = false;
	isPlaying: boolean = false;
	audio: HTMLAudioElement | null = null;

	// Callbacks
	onRecordingFinished: () => void = () => { };
	onPlaybackFinished: () => void = () => { };
	onError: (msg: string) => void = () => { };

	constructor() { }

	async startRecording() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			const options = getBestAudioRecorderOptions();
			this.mediaRecorder = new MediaRecorder(stream, options);
			this.audioChunks = [];

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) this.audioChunks.push(event.data);
			};

			this.mediaRecorder.onstop = () => {
				if (!this.mediaRecorder) return;
				this.currentAudioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
				this.hasRecording = true;
				this.isRecording = false;
				stream.getTracks().forEach(track => track.stop());
				this.onRecordingFinished();
			};

			this.mediaRecorder.start();
			this.isRecording = true;
		} catch (error: any) {
			this.onError('Failed to start recording: ' + error.message);
		}
	}

	stopRecording() {
		if (this.mediaRecorder && this.isRecording) {
			this.mediaRecorder.stop();
		}
	}

	playRecording() {
		if (this.currentAudioBlob && this.hasRecording) {
			const audioUrl = URL.createObjectURL(this.currentAudioBlob);
			this.audio = new Audio(audioUrl);
			this.audio.volume = 1.0;
			this.audio.onended = () => {
				this.isPlaying = false;
				URL.revokeObjectURL(audioUrl);
				this.onPlaybackFinished();
			};
			this.audio.play().catch(e => this.onError('Playback failed: ' + e.message));
			this.isPlaying = true;
		} else {
			this.onError('No recording to play');
		}
	}

	stopPlaying() {
		if (this.audio && !this.audio.paused) {
			this.audio.pause();
			this.audio.currentTime = 0;
			this.isPlaying = false;
		}
	}
}

// --- App Logic ---

class App {
	manager: RepertoireManager;
	recorder: MusicRecorder;

	// UI Elements
	repertoireView: HTMLElement;
	practiceView: HTMLElement;
	pieceList: HTMLElement;
	newPieceForm: HTMLElement;
	readinessControls: HTMLElement;
	status: HTMLElement;
	error: HTMLElement;

	recordButton: HTMLButtonElement;
	playButton: HTMLButtonElement;

	// State
	currentPieceId: string | null = null;
	practiceQueue: Segment[] = [];
	currentSegment: Segment | null = null;

	constructor() {
		this.manager = new RepertoireManager();
		this.recorder = new MusicRecorder();

		// Bind DOM elements
		this.repertoireView = document.getElementById('repertoire-view')!;
		this.practiceView = document.getElementById('practice-view')!;
		this.pieceList = document.getElementById('piece-list')!;
		this.newPieceForm = document.getElementById('new-piece-form')!;
		this.readinessControls = document.getElementById('readiness-controls')!;
		this.status = document.getElementById('status')!;
		this.error = document.getElementById('error')!;

		this.recordButton = document.getElementById('recordButton') as HTMLButtonElement;
		this.playButton = document.getElementById('playButton') as HTMLButtonElement;

		this.init();
	}

	init() {
		this.setupRepertoireUI();
		this.setupPracticeUI();
		this.setupRecorderCallbacks();
		this.renderRepertoire();
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
		});

		// Save Piece
		document.getElementById('save-piece-btn')?.addEventListener('click', () => {
			const nameFn = document.getElementById('new-piece-name') as HTMLInputElement;
			const measuresFn = document.getElementById('new-piece-measures') as HTMLInputElement;

			if (nameFn.value && measuresFn.value) {
				this.manager.addPiece(nameFn.value, parseInt(measuresFn.value));
				this.renderRepertoire();

				// Reset UI
				this.newPieceForm.style.display = 'none';
				(document.getElementById('add-piece-btn') as HTMLElement).style.display = 'block';
				nameFn.value = '';
				measuresFn.value = '';
			}
		});

		// Import/Export
		document.getElementById('export-btn')?.addEventListener('click', () => {
			const data = this.manager.exportData();
			const blob = new Blob([data], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `simple_recorder_backup_${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
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

	setupPracticeUI() {
		// Back Button
		document.getElementById('back-to-repertoire')?.addEventListener('click', () => {
			this.stopSession();
		});

		// Recorder Buttons
		this.recordButton.addEventListener('click', () => this.toggleRecording());
		this.playButton.addEventListener('click', () => this.togglePlayback());

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
			this.readinessControls.style.display = 'none'; // Hide until they listen? 
			// Logic choice: can they rate immediately? Or must they listen? 
			// Requirement: "The user will play the segment into the recorder, listen afterward, and be prompted to assign a readiness value."
			// So we show it only after playback finishes? Or just enable Play button.
		};

		this.recorder.onPlaybackFinished = () => {
			this.updateRecorderUI();
			this.readinessControls.style.display = 'block'; // Show rating controls after listening
			this.status.textContent = 'Rate this segment:';
		};

		this.recorder.onError = (msg) => {
			this.error.textContent = msg;
			this.error.style.display = 'block';
			setTimeout(() => { this.error.style.display = 'none'; }, 3000);
		};
	}

	// --- Core Flows ---

	renderRepertoire() {
		this.pieceList.innerHTML = '';
		const pieces = this.manager.getPieces();

		if (pieces.length === 0) {
			this.pieceList.innerHTML = '<div style="color:#666; padding:20px;">No pieces yet. Add one to start!</div>';
			return;
		}

		pieces.forEach(piece => {
			const el = document.createElement('div');
			el.className = 'piece-item';

			// Calculate progress (segments with readiness 3 / total ORIGINAL segments?)
			// Or just total length.
			// Simplified: just show total measures.

			// Calculate progress
			const score = this.manager.calculateReadiness(piece.id);

			el.innerHTML = `
                <div class="piece-info">
                    <strong>${piece.name}</strong><br>
                    <span style="font-size:0.9em; color:#aaa">${piece.totalMeasures} measures</span>
                </div>
                <div style="font-weight:bold; color: ${this.getScoreColor(score)}; margin-right: 15px;">
                    ${score}%
                </div>
                <button class="delete-btn" data-id="${piece.id}"><i class="fas fa-trash"></i></button>
            `;

			// Delete handler
			el.querySelector('.delete-btn')?.addEventListener('click', (e) => {
				e.stopPropagation();
				if (confirm(`Delete "${piece.name}"?`)) {
					this.manager.deletePiece(piece.id);
					this.renderRepertoire();
				}
			});

			// Select handler
			el.addEventListener('click', () => {
				this.startSession(piece.id);
			});

			this.pieceList.appendChild(el);
		});
	}

	startSession(pieceId: string) {
		this.currentPieceId = pieceId;
		const piece = this.manager.getPiece(pieceId);
		if (!piece) return;

		// Populate Queue
		this.practiceQueue = this.manager.getPracticeQueue(pieceId);

		// Switch Views
		this.repertoireView.style.display = 'none';
		this.practiceView.style.display = 'block';
		document.getElementById('current-piece-name')!.textContent = piece.name;

		this.loadNextSegment();
	}

	stopSession() {
		this.recorder.stopPlaying();
		this.recorder.stopRecording();
		this.repertoireView.style.display = 'block';
		this.practiceView.style.display = 'none';
		this.currentPieceId = null;
	}

	loadNextSegment() {
		if (this.practiceQueue.length === 0) {
			// End of session
			alert("Session complete! Great work.");
			this.stopSession();
			return;
		}

		this.currentSegment = this.practiceQueue.shift() || null;
		if (this.currentSegment) {
			const display = document.getElementById('current-segment-display')!;
			if (this.currentSegment.start === this.currentSegment.end) {
				display.textContent = `Measure ${this.currentSegment.start}`;
			} else {
				display.textContent = `Measures ${this.currentSegment.start} - ${this.currentSegment.end}`;
			}

			// Reset UI for new segment
			this.readinessControls.style.display = 'none';
			this.recorder.hasRecording = false;
			this.recorder.audioChunks = [];
			this.status.textContent = 'Ready to record';
			this.updateRecorderUI();
		}
	}

	toggleRecording() {
		if (this.recorder.isRecording) {
			this.recorder.stopRecording();
		} else {
			this.recorder.startRecording();
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

	handleReadiness(level: number) {
		if (this.currentPieceId && this.currentSegment) {
			this.manager.updateSegmentReadiness(this.currentPieceId, this.currentSegment.id, level);
			// Optionally: show positive feedback?
			this.loadNextSegment();
		}
	}

	updateRecorderUI() {
		const { isRecording, isPlaying, hasRecording } = this.recorder;

		// Record Button
		if (isRecording) {
			this.recordButton.classList.add('recording');
			this.recordButton.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
			this.playButton.disabled = true;
		} else {
			this.recordButton.classList.remove('recording');
			this.recordButton.innerHTML = '<i class="fas fa-microphone"></i><span>Record</span>';
			this.recordButton.disabled = isPlaying;
		}

		// Play Button
		if (isPlaying) {
			this.playButton.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
		} else {
			this.playButton.disabled = !hasRecording || isRecording;
			this.playButton.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
		}
	}
	getScoreColor(score: number): string {
		if (score < 25) return '#ff453a'; // Red
		if (score < 50) return '#ff9f0a'; // Orange
		if (score < 75) return '#ffd60a'; // Yellow
		return '#30d158'; // Green
	}
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
	new App();
});
