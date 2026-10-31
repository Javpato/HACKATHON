import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3000', headless: true, viewport: { width: 1440, height: 1000 }, permissions: ['microphone'],
    launchOptions: { executablePath: process.env.CHROME_PATH || '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: true, timeout: 30_000 },
});
