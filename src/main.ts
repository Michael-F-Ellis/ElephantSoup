import './style.css'

const constraints = {
	audio: {
		// 44100 Hz (CD Quality) or 48000 Hz for professional use
		sampleRate: { ideal: 44100 },
		channelCount: { ideal: 2 },
		echoCancellation: false,
		noiseSuppression: false,
		autoGainControl: false // might want to experiment with setting this to true.
	},
	video: false
};

function getBestAudioRecorderOptions(): MediaRecorderOptions {
	// How to use this function:
	// 1. Get the stream (same high-quality constraints for all platforms)
	// const stream = await navigator.mediaDevices.getUserMedia(constraints); 
	// 2. Get the best options for the current browser
	// const options = getBestAudioRecorderOptions(); 
	// 3. Initialize the recorder
	// const mediaRecorder = new MediaRecorder(stream, options);

	const opusMime = 'audio/webm; codecs=opus';
	const aacMime = 'audio/mp4; codecs=mp4a.40.2';

	// High Bitrate Target (Opus is more efficient, so 256k is top-tier)
	const bitrate = 256000;

	let mimeType: string;

	// 1. Check for Opus (Best for Chrome/Edge/Android/Windows)
	if (MediaRecorder.isTypeSupported(opusMime)) {
		mimeType = opusMime;
		console.log("Using WebM/Opus for high quality.");
	}
	// 2. Check for AAC (Best for iOS/Safari)
	else if (MediaRecorder.isTypeSupported(aacMime)) {
		mimeType = aacMime;
		// Note: AAC encoding can sometimes benefit from a slightly higher requested bitrate
		// bitrate = 320000; 
		console.log("Using MP4/AAC for high quality.");
	}
	// 3. Fallback to a simpler, default option
	else {
		mimeType = 'audio/webm'; // Chromium default (often Opus)
		if (!MediaRecorder.isTypeSupported(mimeType)) {
			mimeType = 'audio/mp4'; // Safari fallback (often AAC)
		}
		console.warn(`Falling back to ${mimeType}. Quality may vary.`);
	}

	return {
		mimeType: mimeType,
		audioBitsPerSecond: bitrate
	};
}

class MusicRecorder {
	mediaRecorder: MediaRecorder | null = null;
	audioChunks: Blob[] = [];
	currentAudioBlob: Blob | null = null;
	isRecording: boolean = false;
	hasRecording: boolean = false;
	isPlaying: boolean = false;
	audio: HTMLAudioElement | null = null;

	recordButton: HTMLButtonElement;
	playButton: HTMLButtonElement;
	status: HTMLElement;
	error: HTMLElement;

	constructor() {
		this.recordButton = document.getElementById('recordButton') as HTMLButtonElement;
		this.playButton = document.getElementById('playButton') as HTMLButtonElement;
		this.status = document.getElementById('status') as HTMLElement;
		this.error = document.getElementById('error') as HTMLElement;

		this.init();
	}

	init() {
		this.setupEventListeners();
		this.checkCompatibility();
		// Add global keyboard event listener
		document.addEventListener('keydown', (event) => {
			if (event.code === 'Space') {
				event.preventDefault(); // Prevent default spacebar behavior (e.g., scrolling)
				if (!this.playButton.disabled) {
					this.playButton.click();
				}
			} else if (event.code === 'Enter') {
				event.preventDefault(); // Prevent default enter behavior
				if (!this.recordButton.disabled) {
					this.recordButton.click();
				}
			}
		});
	}

	setupEventListeners() {
		this.recordButton.addEventListener('click', () => this.toggleRecording());
		this.playButton.addEventListener('click', () => this.playRecording());
	}

	checkCompatibility() {
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			this.showError('Your browser does not support audio recording');
			return false;
		}
		return true;
	}

	async toggleRecording() {
		if (this.isRecording) {
			this.stopRecording();
		} else {
			await this.startRecording();
		}
	}

	async startRecording() {
		try {
			this.hideError();

			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			const options = getBestAudioRecorderOptions();


			this.mediaRecorder = new MediaRecorder(stream, options);
			this.audioChunks = [];

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.audioChunks.push(event.data);
				}
			};

			this.mediaRecorder.onstop = () => {
				if (!this.mediaRecorder) return;
				this.currentAudioBlob = new Blob(this.audioChunks, {
					type: this.mediaRecorder.mimeType
				});
				this.hasRecording = true;
				this.updateUI();

				// Stop all tracks in the stream
				stream.getTracks().forEach(track => track.stop());
			};

			this.mediaRecorder.start();
			this.isRecording = true;

			this.updateUI();

		} catch (error: any) {
			this.showError('Failed to start recording: ' + error.message);
		}
	}

	stopRecording() {
		if (this.mediaRecorder && this.isRecording) {
			this.mediaRecorder.stop();
			this.isRecording = false;
			this.updateUI();
		}
	}

	playRecording() {
		if (this.isPlaying) {
			this.stopPlaying();
			return;
		}
		if (this.currentAudioBlob && this.hasRecording) {
			const audioUrl = URL.createObjectURL(this.currentAudioBlob);
			const audio = new Audio(audioUrl);

			// Set the volume to maximum (1.0)
			// Note: This sets the *initial* playback volume.
			// The user can still adjust their device's master volume.
			audio.volume = 1.0;

			audio.onended = () => {
				this.isPlaying = false;
				URL.revokeObjectURL(audioUrl);
				this.updateUI();
			};

			audio.play().catch(error => {
				this.showError('Failed to play recording: ' + error.message);
			});

			this.isPlaying = true;
			this.audio = audio; // Store the audio object
			this.recordButton.disabled = true; // Disable record button while playing
			this.updateUI();
		} else {
			this.showError('No recording to play');
		}
	}

	stopPlaying() {
		if (this.audio && !this.audio.paused) {
			this.audio.pause();
			this.audio.currentTime = 0; // Reset playback to the beginning
			this.isPlaying = false;
			this.updateUI();
		}
	}

	updateUI() {
		// Update Record Button
		if (this.isRecording) {
			this.recordButton.classList.add('recording');
			this.recordButton.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>'; // Change icon and text
			this.playButton.disabled = true;
			this.recordButton.disabled = false; // Always enable stop button
			this.status.textContent = 'Recording...';
		} else {
			this.recordButton.classList.remove('recording');
			this.recordButton.innerHTML = '<i class="fas fa-microphone"></i><span>Record</span>'; // Change icon and text back
			// Disable record button if playing
			this.recordButton.disabled = this.isPlaying;
			if (this.hasRecording && !this.isPlaying) {
				this.status.textContent = '';
			} else if (!this.hasRecording && !this.isPlaying) {
				this.status.textContent = 'Ready to record';
			}
		}

		// Update Play Button
		if (this.isPlaying) { // If playing, disable play button and update status
			this.status.textContent = 'Playing...';
			this.playButton.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>'; // Change icon and text
		} else {
			// Enable play button only if there's a recording and not currently recording
			this.playButton.disabled = !this.hasRecording || this.isRecording;
			this.playButton.innerHTML = '<i class="fas fa-play"></i><span>Play</span>'
		}
	}

	showError(message: string) {
		this.error.textContent = message;
		this.error.style.display = 'block';
		// Only update status if it's not already showing recording/playing
		if (!this.isRecording && !this.isPlaying) {
			this.status.textContent = 'Error occurred';
		}
	}

	hideError() {
		this.error.style.display = 'none';
	}
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
	new MusicRecorder();
});
