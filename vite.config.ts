import { defineConfig } from 'vite';

export default defineConfig({
	base: '/apps/elephantsoup/',
	css: {
		// Inline empty PostCSS config prevents Vite from searching parent
		// directories for postcss.config.js (cosmiconfig walk). Without this,
		// the search walks above the project root and hits filesystem boundaries.
		postcss: {},
	},
});
