import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SpeedCabs Zapotlán',
        short_name: 'SpeedCabs',
        description: 'Aplicación de taxímetro para SpeedCabs Zapotlán',
        theme_color: '#1a1a2e',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%231a1a2e" width="192" height="192"/><circle cx="96" cy="96" r="70" fill="%233b82f6"/><path d="M96 50v46l30 30" stroke="%23ffffff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect fill="%231a1a2e" width="512" height="512"/><circle cx="256" cy="256" r="186" fill="%233b82f6"/><path d="M256 133v122l80 80" stroke="%23ffffff" stroke-width="10" fill="none" stroke-linecap="round"/></svg>',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'offline-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 3600
              }
            }
          }
        ]
      },
      minify: false,
      includeAssets: ['favicon.ico', 'robots.txt', 'sitemap.xml'],
      devOptions: {
        enabled: false
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
