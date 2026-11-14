import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "flags/*.svg"],
      manifest: {
        name: "Game Night",
        short_name: "Game Night",
        description: "Party games for couples and friends. Pass the phone or play on everyone's phones.",
        theme_color: "#1c0610",
        background_color: "#1c0610",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,svg,png}"],
        globIgnores: ["faces/**", "realai/**"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/faces/") || url.pathname.startsWith("/realai/"),
            handler: "CacheFirst",
            options: { cacheName: "photos", expiration: { maxEntries: 1500 } },
          },
        ],
      },
    }),
  ],
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
