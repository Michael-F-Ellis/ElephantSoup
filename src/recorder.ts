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

export class MusicRecorder {
	mediaRecorder: MediaRecorder | null = null;
	audioChunks: Blob[] = [];
	currentAudioBlob: Blob | null = null;
	isRecording: boolean = false;
	hasRecording: boolean = false;
	isPlaying: boolean = false;
	audio: HTMLAudioElement | null = null;
	currentAudioUrl: string | null = null;

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
			if (this.currentAudioUrl) URL.revokeObjectURL(this.currentAudioUrl);
			this.currentAudioUrl = URL.createObjectURL(this.currentAudioBlob);

			this.audio = new Audio(this.currentAudioUrl);
			this.audio.volume = 1.0;
			this.audio.onended = () => {
				this.handlePlaybackEnd();
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
			this.handlePlaybackEnd();
		}
	}

	handlePlaybackEnd() {
		this.isPlaying = false;
		if (this.currentAudioUrl) {
			URL.revokeObjectURL(this.currentAudioUrl);
			this.currentAudioUrl = null;
		}
		this.onPlaybackFinished();
	}
}
