import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Запити /api/* перенаправляються на бекенд (порт 3001), тому CORS у браузері не заважає
const proxy = { "/api": "http://localhost:3001" };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
