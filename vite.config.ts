import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE=1 builds one self-contained HTML file (used for the claude.ai preview).
// The normal build is a regular static site for Netlify / Vercel / GitHub Pages.
const single = process.env.SINGLE === '1'

export default defineConfig({
  base: './',
  plugins: single ? [react(), viteSingleFile()] : [react()],
  build: { chunkSizeWarningLimit: 4000 },
})
