/**
 * Extracts the 11-character YouTube video ID from various URL formats.
 * @param input The URL or ID string.
 * @returns The 11-character ID if found, otherwise null.
 */
export function extractYouTubeId(input: string): string | null {
	if (!input) return null;
	input = input.trim();

	// If it's already a likely ID (11 chars, no slashes/dots)
	if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
		return input;
	}

	// Regular expressions for various YouTube URL formats
	const patterns = [
		/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
		/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
		/(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
		/(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
		/(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
	];

	for (const pattern of patterns) {
		const match = input.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
	}

	return null;
}
