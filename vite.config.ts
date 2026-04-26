import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png', 'ref-images/**'],
      manifest: {
        name: 'Evaluación de Áreas de Siembra — AE-CAMPO-001',
        short_name: 'AE-CAMPO',
        description: 'App offline para evaluación de áreas de restauración — Amazonía Emprende',
        theme_color: '#0d7377',
        background_color: '#f0fafa',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,jpeg,jpg,svg,ico}'],
        runtimeCaching: [
          {
            urlPattern: /\/ref-images\//,
            handler: 'CacheFirst',
            options: { cacheName: 'ref-images-cache', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: /supabase\.co/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
