import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/APP/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Control de Gastos",
        short_name: "Gastos",
        start_url: "/APP/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          {
            src: "/APP/favicon-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/APP/favicon-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ],
});
