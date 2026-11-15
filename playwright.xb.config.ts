import { defineConfig, devices } from "@playwright/test";

// LD#126: 敗北リザルト見出し(844x390)の3ブラウザ確認専用。既存の playwright.config.ts / ci.yml とは独立。
const port = process.env.PW_PORT ?? "4175";
const base = `http://localhost:${port}`;
const viewport = { width: 844, height: 390 };

export default defineConfig({
  testDir: "e2e-xb",
  timeout: 90_000,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "xb-results/results.json" }]],
  outputDir: "xb-results/artifacts",
  use: { baseURL: base, viewport },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport } },
  ],
  webServer: {
    command: `npx vite preview --strictPort --port ${port}`,
    url: base,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
