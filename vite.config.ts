import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import ssrPlugin from "vite-ssr-components/plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    cloudflare(),
    ssrPlugin({
      hotReload: {
        ignore: ["./src/client/**/*.tsx"],
      },
    }),
    tailwindcss(),
    react(),
  ],
});
