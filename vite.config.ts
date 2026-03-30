import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  server: {
    host: '0.0.0.0', // 监听所有网络接口，支持 VPN 环境
    port: 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.svg', 'icon-512.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/audio/**'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/cards\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cards-data',
              expiration: { maxAgeSeconds: 7 * 24 * 3600 },
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
