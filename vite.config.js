import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BEGINNER EXPLANATION:
// Vite is the build tool. This configuration tells it:
// 1. Use React.
// 2. Enable PWA (Progressive Web App) features like offline support.
// 3. Where to find the manifest and icons.
// 4. Allow preview host for Arena.ai
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5174,
    // BEGINNER: Allow the preview host from Arena.ai
    allowedHosts: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
    manifest: {
      name: 'ChauleNotes',
      short_name: 'ChauleNotes',
      description: 'Every thought has a place.',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#4f46e5',
    },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifestFilename: 'manifest.webmanifest',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // BEGINNER: This allows offline reading of cached notes later
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
    }),
  ],
});
