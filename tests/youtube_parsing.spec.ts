import { test, expect } from '@playwright/test';
import { extractYouTubeId } from '../src/utils';

test.describe('YouTube ID Extraction Utility', () => {
	test('extracts ID from standard watch URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYouTubeId('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	test('extracts ID from youtu.be short URL', () => {
		expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYouTubeId('youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	test('extracts ID from embed URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	test('extracts ID from shorts URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	test('accepts raw 11-char ID', () => {
		expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
	});

	test('returns null for invalid input', () => {
		expect(extractYouTubeId('https://google.com')).toBeNull();
		expect(extractYouTubeId('abc')).toBeNull();
		expect(extractYouTubeId('')).toBeNull();
	});

	test('handles whitespace', () => {
		expect(extractYouTubeId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
		expect(extractYouTubeId(' https://youtu.be/dQw4w9WgXcQ ')).toBe('dQw4w9WgXcQ');
	});
});
