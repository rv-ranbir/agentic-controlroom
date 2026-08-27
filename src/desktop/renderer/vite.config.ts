import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: here,
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(here, "../../../dist/desktop"),
    emptyOutDir: false,
  },
});
