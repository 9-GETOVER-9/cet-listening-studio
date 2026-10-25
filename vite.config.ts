import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Keep the offline shell, but cache feature chunks only after they are visited.
// Eager imports of every entry remain in precache, including shared dependencies.
const shellScripts = new Set<string>()

export default defineConfig({
  server: {
    host: '0.0.0.0', // 监听所有网络接口，支持 VPN 环境
    port: 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'collect-offline-shell',
      generateBundle(_options, bundle) {
        shellScripts.clear()
        const visit = (name: string) => {
          if (shellScripts.has(name)) return
          const chunk = bundle[name]
          if (!chunk || chunk.type !== 'chunk') return
          shellScripts.add(name)
          chunk.imports.forEach(visit)
        }
        Object.values(bundle).forEach(chunk => {
          if (chunk.type === 'chunk' && chunk.isEntry) visit(chunk.fileName)
        })
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}', 'data/ielts-reading-538-v1.json'],
        globIgnores: ['assets/course-*.png', '**/audio/**', 'promo/**', 'landing.html'],
        manifestTransforms: [async entries => ({
          manifest: entries.filter(entry => !entry.url.endsWith('.js') || shellScripts.has(entry.url)),
          warnings: [],
        })],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/course-[^/]+\.png$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'course-covers', expiration: { maxEntries: 12, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/') && /\.(js|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'visited-app-assets', cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 150, maxAgeSeconds: 30 * 24 * 3600 } },
          },
          {
            urlPattern: /\/data\/cards\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cards-data',
              expiration: { maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            urlPattern: /\/data\/audio\/.*\.mp3$/,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'audio-files',
            },
          },
        ],
      },
      manifest: {
        name: 'CET Listening Studio',
        short_name: 'CET听力',
        description: '四六级听力智能学习平台',
        theme_color: '#2563EB',
        background_color: '#F9FAFB',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
