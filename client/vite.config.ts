import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = process.env.API_URL ?? 'http://localhost:3001';

// `npm run dev`         → local development (http://localhost:5173)
// `npm run dev:tunnel`  → same, but the page is opened through a Cloudflare tunnel / Discord
//                         (HMR websocket must talk to the public https port 443).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Vite rejects unknown Host headers by default → allow the tunnel + Discord proxy hosts.
    allowedHosts: ['.trycloudflare.com', '.discordsays.com', '.ngrok-free.app', '.ngrok.app', 'localhost'],
    hmr: mode === 'tunnel' ? { protocol: 'wss', clientPort: 443 } : undefined,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/socket.io': { target: API, ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { hls: ['hls.js'] },
      },
    },
  },
}));
