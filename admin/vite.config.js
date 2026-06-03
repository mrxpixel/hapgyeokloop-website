import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const here = import.meta.dirname

export default defineConfig({
  root: path.join(here, 'src'),
  base: './',
  plugins: [react()],
  build: {
    outDir: here,            // -> admin/  (build output committed in-place)
    emptyOutDir: false,      // never wipe admin/src or admin/package.json
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
})
