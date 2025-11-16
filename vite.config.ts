import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "CloudFrontUpdator",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["@aws-sdk/client-cloudfront"],
      output: {
        exports: "named",
      },
    },
    sourcemap: true,
    minify: false,
  },
  plugins: [
    dts({
      include: ["src/**/*"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "dist/**", "node_modules/**"],
    },
  },
});
