import { test, expect, type Page } from '@playwright/test';

/**
 * Settings E2E — Theme, Language, Date Format, Time Format
 * Starts authenticated via storageState set in playwright.config.ts
 */

test.describe('Settings', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/settings');
        await expect(page.locator('h1')).toBeVisible();
    });

    const languageButton = (page: Page) =>
        page.getByRole('button', { name: /language|язык/i });

    // ═══════════════════════════════════════════════════════════════
    // Theme
    // ═══════════════════════════════════════════════════════════════

    test('selects Light theme', async ({ page }) => {
        await page.locator('input[name="theme"][value="light"]').click({ force: true });
        await expect(page.locator('input[name="theme"][value="light"]')).toBeChecked();
    });

    test('selects Dark theme and applies class to <html>', async ({ page }) => {
        await page.locator('input[name="theme"][value="dark"]').click({ force: true });
        await expect(page.locator('input[name="theme"][value="dark"]')).toBeChecked();
        await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 3000 });
    });

    test('selects System theme', async ({ page }) => {
        await page.locator('input[name="theme"][value="system"]').click({ force: true });
        await expect(page.locator('input[name="theme"][value="system"]')).toBeChecked();
    });

    test('theme choice persists after reload', async ({ page }) => {
        await page.locator('input[name="theme"][value="dark"]').click({ force: true });
        await page.reload();
        await expect(page.locator('input[name="theme"][value="dark"]')).toBeChecked();
    });

    // ═══════════════════════════════════════════════════════════════
    // Language
    // ═══════════════════════════════════════════════════════════════

    test('switches to English', async ({ page }) => {
        const langSelect = languageButton(page);
        await langSelect.click();
        await page.getByRole('option', { name: /english/i }).click();

        await expect(page.locator('h1')).toContainText(/settings/i, { timeout: 5000 });
    });

    test('switches to Russian', async ({ page }) => {
        // Ensure we start in English first
        const langSelect = languageButton(page);
        await langSelect.click();
        await page.getByRole('option', { name: /english/i }).click();
        await expect(page.locator('h1')).toContainText(/settings/i);

        await languageButton(page).click();
        await page.getByRole('option', { name: /русский/i }).click();
        await expect(page.locator('h1')).toContainText(/настройки/i, { timeout: 5000 });
    });

    test('language choice persists after reload', async ({ page }) => {
        const langSelect = languageButton(page);
        await langSelect.click();
        await page.getByRole('option', { name: /english/i }).click();
        await expect(page.locator('h1')).toContainText(/settings/i);

        await page.reload();
        await expect(page.locator('h1')).toContainText(/settings/i);
    });

    // ═══════════════════════════════════════════════════════════════
    // Date Format
    // ═══════════════════════════════════════════════════════════════

    test('selects DD/MM/YYYY (UK) date format', async ({ page }) => {
        await page.locator('[value="DD/MM/YYYY"]').click({ force: true });
        await expect(page.locator('[value="DD/MM/YYYY"]')).toBeChecked();
    });

    test('selects MM/DD/YYYY (US) date format', async ({ page }) => {
        await page.locator('[value="MM/DD/YYYY"]').click({ force: true });
        await expect(page.locator('[value="MM/DD/YYYY"]')).toBeChecked();
    });

    test('selects DD.MM.YYYY (European) date format', async ({ page }) => {
        await page.locator('[value="DD.MM.YYYY"]').click({ force: true });
        await expect(page.locator('[value="DD.MM.YYYY"]')).toBeChecked();
    });

    test('date format persists after reload', async ({ page }) => {
        await page.locator('[value="MM/DD/YYYY"]').click({ force: true });
        await page.reload();
        await expect(page.locator('[value="MM/DD/YYYY"]')).toBeChecked();
    });

    // ═══════════════════════════════════════════════════════════════
    // Time Format
    // ═══════════════════════════════════════════════════════════════

    test('selects 24-hour time format', async ({ page }) => {
        await page.locator('[value="24h"]').click({ force: true });
        await expect(page.locator('[value="24h"]')).toBeChecked();
    });

    test('selects 12-hour time format', async ({ page }) => {
        await page.locator('[value="12h"]').click({ force: true });
        await expect(page.locator('[value="12h"]')).toBeChecked();
    });

    test('time format persists after reload', async ({ page }) => {
        await page.locator('[value="12h"]').click({ force: true });
        await page.reload();
        await expect(page.locator('[value="12h"]')).toBeChecked();
    });
});
