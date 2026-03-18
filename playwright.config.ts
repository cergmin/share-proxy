import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import {
    E2E_ADMIN_API_ORIGIN,
    E2E_ADMIN_FRONTEND_ORIGIN,
    E2E_PROXY_ORIGIN,
} from './e2e/urls';

const AUTH_FILE = path.join(__dirname, 'e2e/.auth/user.json');
const E2E_ENV = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/share_proxy',
    SECRET: 'playwright-secret-playwright-secret',
    ADMIN_API_ORIGIN: E2E_ADMIN_API_ORIGIN,
    ADMIN_FRONTEND_ORIGIN: E2E_ADMIN_FRONTEND_ORIGIN,
    PROXY_ORIGIN: E2E_PROXY_ORIGIN,
    ADMIN_API_PORT: '3300',
    PROXY_PORT: '3301',
};

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
        baseURL: process.env.BASE_URL || E2E_ADMIN_FRONTEND_ORIGIN,
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
            command: 'pnpm --filter @share-proxy/admin-api exec tsx src/index.ts',
            url: `${E2E_ADMIN_API_ORIGIN}/api/ping`,
            env: E2E_ENV,
            reuseExistingServer: false,
            timeout: 30_000,
        },
        {
            command: 'pnpm --filter @share-proxy/proxy exec tsx src/index.ts',
            url: `${E2E_PROXY_ORIGIN}/_health`,
            env: E2E_ENV,
            reuseExistingServer: false,
            timeout: 30_000,
        },
        {
            command: 'pnpm --filter admin-web exec vite --host 0.0.0.0 --port 4173',
            url: E2E_ADMIN_FRONTEND_ORIGIN,
            env: E2E_ENV,
            reuseExistingServer: false,
            timeout: 30_000,
        },
    ],
});
