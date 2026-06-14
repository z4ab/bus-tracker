import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
