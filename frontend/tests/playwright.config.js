import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';

process.env.V360_TEST_PASSWORD ||= randomBytes(24).toString('hex');
const baseURL = 'http://127.0.0.1:4179';
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL,
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'narrow phone', use: { viewport: { width: 320, height: 680 }, isMobile: true, hasTouch: true } },
    { name: 'large phone', use: { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } }
  ],
  webServer: {
    command: 'node tests/serve.mjs',
    cwd: new URL('../', import.meta.url).pathname,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000
  }
});
