import { defineConfig, devices } from '@playwright/test';

const workerCount = process.env.PLAYWRIGHT_WORKERS ?? (process.env.CI ? 2 : '50%');

export default defineConfig({
    testDir: './tests/storybook',
    reporter: 'list',
    fullyParallel: true,
    workers: workerCount,
    use: {
        baseURL: 'http://127.0.0.1:6017',
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        trace: 'on-first-retry',
        viewport: {
            width: 1600,
            height: 900,
        },
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'pnpm build-storybook && node scripts/serve-storybook.mjs 6017 storybook-static',
        url: 'http://127.0.0.1:6017',
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
