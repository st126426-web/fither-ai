import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the Pages workflow to "/<repo>/"; locally it stays "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  server: {
    port: 5173,
    // Mock seed data lives in ../server/seed/mock and is bundled into the
    // static build, so the mock tabs work with the API down.
    fs: { allow: ['..'] },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
