import { test, expect, type Page } from '@playwright/test';

/**
 * Sources E2E — full CRUD + Test Connection
 * Starts authenticated via storageState set in playwright.config.ts
 */

async function cleanSources(page: Page) {
    const res = await page.request.get('/api/sources');
    const sources: any[] = await res.json();
    await Promise.all(sources.map((s: any) => page.request.delete(`/api/sources/${s.id}`)));
}

function saveButton(page: Page) {
    return page.getByRole('button', { name: /save|сохранить/i });
}

test.describe('Sources', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/sources');
        await expect(page.locator('h1')).toBeVisible();
    });

    // ── 1. Empty state ──────────────────────────────────────────────────────
    test('shows empty-state when there are no sources', async ({ page }) => {
        await cleanSources(page);
        await page.reload();
        await expect(page.getByText(/no sources configured yet|источники еще не настроены/i)).toBeVisible({ timeout: 8000 });
    });

    // ── 2. Open new source form ─────────────────────────────────────────────
    test('opens the new-source form', async ({ page }) => {
        await page.locator('button', { hasText: /add.?source|добавить/i }).click();
        await expect(page.locator('h2')).toContainText(/new.?source|новый.?источник/i);
    });

    // ── 3. Cancel returns to list ────────────────────────────────────────────
    test('Cancel button returns to source list', async ({ page }) => {
        await page.locator('button', { hasText: /add.?source|добавить/i }).click();
        await page.locator('button', { hasText: /cancel|отмена/i }).click();
        await expect(page.locator('h1')).toBeVisible();
    });

    // ── 4. Create a Jellyfin source ──────────────────────────────────────────
    test('creates a new Jellyfin source and displays it in the table', async ({ page }) => {
        await cleanSources(page);
        await page.locator('button', { hasText: /add.?source|добавить/i }).click();

        await page.locator('input:not([type="password"])').first().fill('My Jellyfin Server');
        await page.locator('input[placeholder*="192.168"]').fill('http://jellyfin.local:8096');
        await page.locator('input[type="password"]').fill('my-api-key-abc');

        await saveButton(page).click();

        await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 8000 });
        await expect(page.locator('table')).toContainText('My Jellyfin Server');
    });

    // ── 5. Edit a source ─────────────────────────────────────────────────────
    test('edits an existing source name', async ({ page }) => {
        await cleanSources(page);
        await page.request.post('/api/sources', {
            data: { name: 'Original Name', type: 'jellyfin', config: { url: 'http://x', apiKey: 'k' } }
        });
        await page.reload();

        await page.locator('table tbody tr').first().locator('button').first().click();
        await expect(page.locator('h2')).toContainText(/edit source|редактировать источник/i);

        const nameInput = page.locator('input:not([type="password"])').first();
        await nameInput.clear();
        await nameInput.fill('Updated Name');
        await saveButton(page).click();

        await expect(page.locator('table')).toContainText('Updated Name', { timeout: 8000 });
    });

    // ── 6. Test Connection — disabled when URL or API key is empty ───────────
    test('Test Connection is disabled when URL or API key is empty', async ({ page }) => {
        await page.locator('button', { hasText: /add.?source|добавить/i }).click();
        const testBtn = page.locator('button', { hasText: /test.?connection|тест.?соединения/i });
        await expect(testBtn).toBeDisabled();
    });

    // ── 7. Test Connection — success ─────────────────────────────────────────
    test('Test Connection shows success modal when API returns 200', async ({ page }) => {
        await page.locator('button', { hasText: /add.?source|добавить/i }).click();
        await page.locator('input[placeholder*="192.168"]').fill('http://jf.example.com:8096');
        await page.locator('input[type="password"]').fill('valid-key-xyz');

        await page.route('**/api/sources/test', route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
        );

        await page.locator('button', { hasText: /test.?connection|тест.?соединения/i }).click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('[role="dialog"]')).toContainText(/success|успех|успешно/i);

        await page.locator('[role="dialog"] button', { hasText: /close|закрыть/i }).click();
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    // ── 8. Test Connection — failure ─────────────────────────────────────────
    test('Test Connection shows error modal when API returns 400', async ({ page }) => {
        await page.locator('button', { hasText: /add.?source|добавить/i }).click();
        await page.locator('input[placeholder*="192.168"]').fill('http://jf.example.com:8096');
        await page.locator('input[type="password"]').fill('wrong-key');

        await page.route('**/api/sources/test', route =>
            route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) })
        );

        await page.locator('button', { hasText: /test.?connection|тест.?соединения/i }).click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('[role="dialog"]')).toContainText(/failed|error|ошибка/i);
    });

    // ── 9. Test Connection not shown for Google Drive / S3 ──────────────────
    test('Test Connection button not shown for non-Jellyfin types', async ({ page }) => {
        await page.locator('button', { hasText: /add.?source|добавить/i }).click();

        // Switch to Google Drive via the Select component (click the currently selected value)
        const typeSelectBtn = page.locator('[role="button"]', { hasText: /jellyfin/i }).first();
        if (await typeSelectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await typeSelectBtn.click();
            await page.locator('[role="option"]', { hasText: /google.?drive/i }).click();
            await expect(page.locator('button', { hasText: /test.?connection|тест.?соединения/i })).not.toBeVisible();
        }
    });

    // ── 10. Delete via Confirm Modal ─────────────────────────────────────────
    test('deletes a source via Confirm Modal', async ({ page }) => {
        await cleanSources(page);
        await page.request.post('/api/sources', {
            data: { name: 'To Delete', type: 'jellyfin', config: { url: 'http://x', apiKey: 'k' } }
        });
        await page.reload();
        await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 8000 });

        await page.locator('table tbody tr').first().locator('button').last().click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        await expect(page.locator('[role="dialog"]')).toContainText(/delete|удалить/i);

        await page.locator('[role="dialog"] button', { hasText: /delete|удалить/i }).click();
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
        await expect(page.locator('table tbody tr')).toHaveCount(0, { timeout: 8000 });
    });

    // ── 11. Cancel delete keeps the record ──────────────────────────────────
    test('cancelling the delete confirmation keeps the source', async ({ page }) => {
        await cleanSources(page);
        await page.request.post('/api/sources', {
            data: { name: 'Keep Me', type: 'jellyfin', config: { url: 'http://x', apiKey: 'k' } }
        });
        await page.reload();

        await page.locator('table tbody tr').first().locator('button').last().click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        await page.locator('[role="dialog"] button', { hasText: /cancel|отмена/i }).click();
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
        await expect(page.locator('table')).toContainText('Keep Me');
    });
});
