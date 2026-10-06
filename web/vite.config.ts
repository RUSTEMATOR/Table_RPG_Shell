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
        // Физика кубиков (Rapier, WebAssembly внутри, ~4 МБ) не входит в предкэш: качается при первом броске
        // и дальше берётся из кэша, в том числе без сети.
        // Листы фигурок LPC (~2,5 МБ, сотни файлов) — тоже вне предкэша: качаются по мере надобности, дальше из кэша.
        globIgnores: ['**/physics.worker-*.js', 'lpc/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/physics\.worker-[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'zg-dice-physics', expiration: { maxEntries: 2 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/lpc/'),
            handler: 'CacheFirst',
            options: { cacheName: 'zg-figures', expiration: { maxEntries: 1200 } },
          },
        ],
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
  // Тяжёлые зависимости собираем заранее одним проходом: иначе Vite досборщик при первом открытии «Бросков»
  // пересобирает react отдельно, и r3f получает вторую копию React (Invalid hook call).
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['three', '@react-three/fiber', 'motion/react', 'radix-ui', 'sonner', 'react', 'react-dom', 'react-dom/client'] },
  worker: { format: 'es' },
  build: { sourcemap: true },
});
