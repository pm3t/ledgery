import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Konfigurasi Vite Bundler untuk Frontend React
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
