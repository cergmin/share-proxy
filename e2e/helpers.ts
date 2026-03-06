/**
 * Shared helpers for E2E tests.
 */
import { type Page } from '@playwright/test';

export const TEST_USER = {
    name: 'E2E Test Admin',
    email: 'e2e-test@share-proxy.local',
    password: 'e2e-password-123',
};

/**
 * Navigate to / and confirm we land there (relies on storageState being set).
 */
export async function goToDashboard(page: Page) {
    await page.goto('/');
    await page.waitForURL('/');
}

/**
 * Full login flow — only used from global.setup.ts.
 * In individual specs, use storageState instead.
 */
export async function loginUser(page: Page) {
    await page.goto('/login');
    await page.fill('#email', TEST_USER.email);
    await page.fill('#password', TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('/', { timeout: 15000 });
}
