import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri 개발 서버 설정: 포트 고정, src-tauri 변경은 감시하지 않음
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
