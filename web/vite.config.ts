import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const devServer = 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Зеленогорье',
        short_name: 'Зеленогорье',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#faf9f5',
        theme_color: '#faf9f5',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Кэшируется только оболочка; данные всегда идут с сервера.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Закрытый QA-хост снаружи (ops/scripts/qa-setup.sh): Vite иначе отвечает «Blocked request» на чужое имя.
    allowedHosts: process.env.ZG_QA_HOST ? [process.env.ZG_QA_HOST] : undefined,
    proxy: {
      '/api': { target: devServer },
      '/socket.io': { target: devServer, ws: true },
    },
  },
  build: { sourcemap: true },
});
