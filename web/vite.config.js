import { defineConfig } from 'vite';

// Two outputs: the galaxy page, and planet-view.js, which the welcome page and every planet page
// load from /planet-view.js to draw their own 3D planet with the same code.
export default defineConfig({
  base: './',
  // In development, Vite serves the 3D page and sends everything Flask answers to Flask on :8000.
  server: {
    proxy: Object.fromEntries(['/api', '/p', '/welcome', '/static', '/health'].map((p) => [p, process.env.APP_URL || 'http://localhost:8000'])),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: { main: 'index.html', 'planet-view': 'src/planet-view.js' },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'planet-view' ? 'planet-view.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
