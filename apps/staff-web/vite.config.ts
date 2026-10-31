import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@staff-web': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 6161,
    // The backend only accepts http://localhost:6161 (STAFF_WEB_ORIGIN), so fail instead of moving to another port.
    strictPort: true,
  },
})
