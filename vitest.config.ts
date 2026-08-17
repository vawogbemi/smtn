import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/tenant.testworker.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
