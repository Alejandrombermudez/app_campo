import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': la versión nueva espera a que la persona pulse «Actualizar» (AppAcciones)
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'ref-images/**'],
      manifest: {
        name: 'Amazonía Emprende · Campo',
        short_name: 'AE Campo',
        description: 'App offline para evaluación de áreas de restauración — Amazonía Emprende',
        theme_color: '#2f3f32',
        background_color: '#3a382c',   // el fondo del logo: así la pantalla de arranque no es un cuadro liso
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,jpeg,jpg,svg,ico,woff2}'],
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
