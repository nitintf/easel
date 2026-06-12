import fs from "node:fs";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function copyCanvasKitWasm(): Plugin {
  return {
    name: "copy-canvaskit-wasm",
    buildStart() {
      const src = path.resolve(
        __dirname,
        "packages/editor-core/node_modules/canvaskit-wasm/bin/canvaskit.wasm",
      );
      const dest = path.resolve(__dirname, "public/canvaskit.wasm");
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [tailwindcss(), react(), copyCanvasKitWasm()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    rollupOptions: {
      // westures is an optional peer dep of fabric/extensions — not installed, not needed
      // esbuild is only used in render-jsx.ts for Node/CLI — not available in browser
      external: ["westures", "esbuild"],
    },
  },

  optimizeDeps: {
    include: ["canvaskit-wasm", "yoga-layout"],
    exclude: ["esbuild"],
  },

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
