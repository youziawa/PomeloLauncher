import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 400 } },
  build: { target: 'es2020', assetsInlineLimit: 100000000 },
})
