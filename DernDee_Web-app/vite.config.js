import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        patient: path.resolve(__dirname, 'index.html'),
        clinic: path.resolve(__dirname, 'clinic/index.html'),
        clinicGaitDashboard: path.resolve(__dirname, 'clinic/gait-dashboard/index.html'),
      },
    },
  },
  assetsInclude: ['**/*.m4a', '**/*.mp3', '**/*.mp4'],  // Include audio and video files as assets
  server: {
    host: '0.0.0.0',
    port: 5174,
    open: true,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  }
})
