import { defineConfig, type Plugin, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadIntegritySecret(): string {
  try {
    const env = readFileSync(path.join(__dirname, ".env"), "utf-8");
    const match = env.match(/^INTEGRITY_SECRET=["']?(.+?)["']?\s*$/m);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

function removeCrossOrigin(): Plugin {
  return {
    name: "remove-crossorigin",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(?=[>\s])/gi, "");
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    removeCrossOrigin(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          define: {
            __INTEGRITY_SECRET__: JSON.stringify(loadIntegritySecret()),
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
        dead_code: true,
      },
      mangle: {
        toplevel: true,
        properties: { regex: /^_/ },
      },
      format: {
        comments: false,
      },
    },
  },
}));
