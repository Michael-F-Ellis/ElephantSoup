import './style.css'
import { RepertoireManager } from './repertoire';
import { Segment } from './types';
import { MusicRecorder } from './recorder';

// --- App Logic ---



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
		this.pieceList = document.getElementById('piece-list')!;
		this.newPieceForm = document.getElementById('new-piece-form')!;
		this.readinessControls = document.getElementById('readiness-controls')!;
		this.status = document.getElementById('status')!;
		this.error = document.getElementById('error')!;

		this.recordButton = document.getElementById('recordButton') as HTMLButtonElement;
		this.playButton = document.getElementById('playButton') as HTMLButtonElement;

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
			a.download = `elephant_soup_backup_${new Date().toISOString().slice(0, 10)}.json`;
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
		// Back/Suspend Button
		document.getElementById('back-to-repertoire')?.addEventListener('click', () => {
			this.suspendSession();
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
			// Ignore keys if modal is open
			if (this.resumeModal.style.display === 'flex') return;

			if (event.code === 'Space') {
				event.preventDefault();
				if (!this.playButton.disabled) this.playButton.click();
			} else if (event.code === 'Enter') {
				event.preventDefault();
				// If readiness controls are visible, maybe map 1-4 keys? 
				// For now, Enter records if ready.
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

	getAllPiecesSorted(): { piece: any, score: number, isMastered: boolean, nextDate?: Date }[] {
		const pieces = this.manager.getPieces();
		const enriched = pieces.map(piece => ({
			piece,
			score: this.manager.calculateReadiness(piece.id),
			isMastered: this.manager.isMastered(piece.id),
			nextDate: piece.nextDate ? new Date(piece.nextDate) : undefined
		}));

		// Sort logic:
		// 1. Unmastered first (Worst score first -> Ascending score)
		// 2. Mastered last (Earliest MaxDate first -> Ascending nextDate)
		enriched.sort((a, b) => {
			if (a.isMastered !== b.isMastered) {
				return a.isMastered ? 1 : -1; // Unmastered first
			}

			if (!a.isMastered) {
				// Both unmastered: sort by score (asc)
				return a.score - b.score;
			} else {
				// Both mastered: sort by due date (asc)
				// If no date (shouldn't happen with migration), treat as far future
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



			// Check if has saved session
			const hasSession = !!this.manager.getSession(piece.id);
			const sessionIndicator = hasSession ? '<span style="color: #0a84ff; margin-right:8px; font-size:0.8em"><i class="fas fa-pause-circle"></i> Resumable</span>' : '';

			// Due Date
			let dueDisplay = '';
			if (piece.nextDate) {
				const due = new Date(piece.nextDate);
				const now = new Date();
				const isFuture = due > now;
				// Simple formatting: Today, Tomorrow, or Date
				// Using toLocaleDateString for simplicity
				// Add style: grey if future, red/bold if past/today?
				// User didn't specify, so let's keep it subtle for now.
				// If future: "Due: [Date]"
				// If now/past: "Due: Now" or just nothing (logic implies it's in the queue anyway)

				if (isFuture) {
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
		const session = this.manager.getSession(pieceId);

		if (session) {
			const piece = this.manager.getPiece(pieceId);
			if (piece) {
				this.resumePieceName.textContent = piece.name;
				this.resumeModal.style.display = 'flex'; // Use flex to center
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
			this.manager.clearSession(pieceId); // Clear from storage once resumed
			this.activateSessionView(pieceId);
		} else {
			// Fallback
			this.discardAndStartSession(pieceId);
		}
	}

	activateSessionView(pieceId: string) {
		const piece = this.manager.getPiece(pieceId);
		if (!piece) return;

		// Switch Views
		this.repertoireView.style.display = 'none';
		this.practiceView.style.display = 'block';
		document.getElementById('current-piece-name')!.textContent = piece.name;

		this.loadNextSegment();
	}

	suspendSession() {
		if (this.currentPieceId && this.practiceQueue.length >= 0) {
			// If we have a current segment, push it back to the START of the queue
			// so it is the first thing resumed.
			if (this.currentSegment) {
				this.practiceQueue.unshift(this.currentSegment);
			}

			if (this.practiceQueue.length > 0) {
				this.manager.saveSession(this.currentPieceId, this.practiceQueue);
				// Stop any active media
				this.recorder.stopPlaying();
				this.recorder.stopRecording();

				this.stopSession(); // don't clear, we just saved
			} else {
				// Nothing to save? Just quit.
				this.stopSession();
			}
		}
	}

	updateSuspendButton() {
		const btn = document.getElementById('back-to-repertoire');
		if (btn) {
			// Count remaining items in queue + current item
			const count = this.practiceQueue.length + (this.currentSegment ? 1 : 0);
			// Update text node only, preserving icon if possible? 
			// The original HTML is: <button id="back-to-repertoire" class="back-button"><i class="fas fa-arrow-left"></i> Suspend</button>
			// So we should reconstruct the HTML or just update text. 
			// Let's reconstruct to be safe and simple.
			btn.innerHTML = `<i class="fas fa-arrow-left"></i> Suspend (${count} remaining)`;
		}
	}

	stopSession() {
		this.recorder.stopPlaying();
		this.recorder.stopRecording();
		this.repertoireView.style.display = 'block';
		this.practiceView.style.display = 'none';
		this.currentPieceId = null;
		this.currentSegment = null;

		// Reset Suspend button text
		const btn = document.getElementById('back-to-repertoire');
		if (btn) btn.innerHTML = '<i class="fas fa-arrow-left"></i> Suspend';

		// Refresh list to show resumable status
		this.renderRepertoire();
	}

	loadNextSegment() {
		if (this.practiceQueue.length === 0) {
			// End of session
			alert("Session complete! Great work.");
			this.stopSession();
			return;
		}

		this.currentSegment = this.practiceQueue.shift() || null;
		this.updateSuspendButton(); // Update count display

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
