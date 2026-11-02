import { defineConfig } from "vitest/config";

// base: "./" にしておくと、ビルド成果物(dist/)をどのパスに置いても動く
// (Actions の成果物をダウンロードして手元で配信する試遊方法に対応)
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
