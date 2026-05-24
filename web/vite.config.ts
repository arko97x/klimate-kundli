import path from 'path'
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import remarkGfm from 'remark-gfm'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm] }) },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/geocode': 'http://127.0.0.1:8787',
      '/kundli': 'http://127.0.0.1:8787',
      '/monthly-delta': 'http://127.0.0.1:8787',
    },
  },
})
