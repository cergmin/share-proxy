import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, 'e2e/.auth/user.json');

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.ts',

    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'list',

    // Run global setup (register/login test user) before anything else
    globalSetup: './e2e/global.setup.ts',

    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:5173',
        trace: 'on-first-retry',
        actionTimeout: 10_000,
        navigationTimeout: 15_000,
        // All specs reuse the authenticated session saved by globalSetup
        storageState: AUTH_FILE,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: [
        {
            command: 'pnpm --filter @share-proxy/admin-api dev',
            url: 'http://localhost:3000/api/ping',
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
        {
            command: 'pnpm --filter admin-web dev',
            url: 'http://localhost:5173',
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
        },
    ],
});
