/**
 * Playwright global setup — runs once before all E2E tests.
 *
 * Strategy:
 *  1. Open the app in a browser to get proper Origin/Referer headers.
 *  2. Register the test user via the app's API (with proper browser origin).
 *  3. If already registered (422), just log in.
 *  4. Save browser storage state for all specs to reuse as storageState.
 */
import { chromium, FullConfig } from '@playwright/test';
import { TEST_USER } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

export default async function globalSetup(config: FullConfig) {
    const uiBase = config.projects[0].use.baseURL ?? 'http://localhost:5173';

    const browser = await chromium.launch();
    // Use uiBase as baseURL so Origin headers are set correctly by Playwright
    const context = await browser.newContext({ baseURL: uiBase });
    const page = await context.newPage();

    // Navigate to the app first so the browser context has the correct origin
    await page.goto('/');
    await page.waitForURL(/\/(login|register|\/)/, { timeout: 30000 });

    // ── 1. Try to register the test user via the API (browser request context) ─
    const signUpRes = await page.request.post('/api/auth/sign-up/email', {
        data: {
            name: TEST_USER.name,
            email: TEST_USER.email,
            password: TEST_USER.password,
        },
    });

    const isRegistered = signUpRes.ok();
    const status = signUpRes.status();
    const alreadyExists = status === 422 || status === 409;

    if (!isRegistered && !alreadyExists) {
        const body = await signUpRes.text();
        console.warn(`[globalSetup] sign-up returned ${status}: ${body}`);
    }

    if (isRegistered) {
        // Sign up succeeded and also returned a session — we're already authenticated.
        // Save directly.
        fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
        await context.storageState({ path: AUTH_FILE });
        await browser.close();
        return;
    }

    // ── 2. User already exists (or sign-up failed) — do a full browser login ──
    await page.goto('/login');
    await page.waitForURL(/\/(login|register)/, { timeout: 15000 });

    if (page.url().includes('/register')) {
        // Fresh DB: fill the registration form
        await page.fill('#name', TEST_USER.name);
        await page.fill('#email', TEST_USER.email);
        await page.fill('#password', TEST_USER.password);
        await page.locator('button[type="submit"]').click();
    } else {
        // Existing DB: login form
        await page.fill('#email', TEST_USER.email);
        await page.fill('#password', TEST_USER.password);
        await page.locator('button[type="submit"]').click();
    }

    await page.waitForURL('/', { timeout: 20000 });

    // ── 3. Persist the authenticated browser state ─────────────────────────────
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await context.storageState({ path: AUTH_FILE });

    await browser.close();
}
