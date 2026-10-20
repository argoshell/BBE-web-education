import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/ (routing uses the URL hash)
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
})
