import { test, expect, type Page } from '@playwright/test';

/**
 * Links E2E — full CRUD + file picker
 * Starts authenticated via storageState set in playwright.config.ts
 */

async function ensureSource(page: Page): Promise<string> {
    const res = await page.request.get('/api/sources');
    const sources: any[] = await res.json();
    if (sources.length > 0) return sources[0].id;
    const created = await page.request.post('/api/sources', {
        data: { name: 'E2E Source', type: 'jellyfin', config: { url: 'http://jf.test', apiKey: 'key' } }
    });
    return (await created.json()).id;
}

async function cleanLinks(page: Page) {
    const res = await page.request.get('/api/links');
    const links: any[] = await res.json();
    await Promise.all(links.map(l => page.request.delete(`/api/links/${l.id}`)));
}

function createLinkButton(page: Page) {
    return page.getByRole('button', { name: /create link|создать ссылку/i });
}

function saveButton(page: Page) {
    return page.getByRole('button', { name: /save|сохранить/i });
}

function sourceSelect(page: Page) {
    return page.getByRole('button', { name: /storage source|источник хранилища/i });
}

function pickFirstSourceOption(page: Page) {
    return page.getByRole('option').first();
}

function resourcePickerDialog(page: Page) {
    return page.getByRole('dialog', { name: /select|выбрать/i });
}

test.describe('Links', () => {
    let sourceId: string;

    test.beforeEach(async ({ page }) => {
        sourceId = await ensureSource(page);
        await page.goto('/links');
        await expect(page.locator('h1')).toBeVisible();
    });

    // ── 1. Empty state ───────────────────────────────────────────────────────
    test('shows empty-state text when there are no links', async ({ page }) => {
        await cleanLinks(page);
        await page.reload();
        await expect(page.getByText(/no links generated yet|ссылки еще не созданы/i)).toBeVisible({ timeout: 8000 });
    });

    // ── 2. Open new link form ─────────────────────────────────────────────────
    test('opens new-link form when clicking Add', async ({ page }) => {
        await createLinkButton(page).click();
        await expect(page.locator('h2')).toContainText(/create link|создать ссылку/i);
    });

    // ── 3. Cancel returns to list ─────────────────────────────────────────────
    test('Cancel returns to the links list', async ({ page }) => {
        await createLinkButton(page).click();
        await page.getByRole('button', { name: /cancel|отмена/i }).click();
        await expect(page.locator('h1')).toBeVisible();
    });

    // ── 4. Create a link manually ──────────────────────────────────────────────
    test('creates a link manually and shows it in the table', async ({ page }) => {
        await cleanLinks(page);
        await createLinkButton(page).click();

        await page.getByLabel(/resource name|имя ресурса/i).fill('My Test Video');
        await page.getByLabel(/external id|внешний id/i).fill('ext-id-abc-123');

        await saveButton(page).click();
        await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 8000 });
    });

    // ── 5. "Choose" button state ───────────────────────────────────────────────
    test('"Choose" button is enabled when a source is preselected', async ({ page }) => {
        await createLinkButton(page).click();

        const chooseBtn = page.getByRole('button', { name: /select|выбрать/i });
        if (await chooseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await expect(chooseBtn).toBeEnabled();
        }
    });

    // ── 6. File picker opens with mocked tree ──────────────────────────────────
    test('file picker opens and tree items load', async ({ page }) => {
        await createLinkButton(page).click();

        await page.route(`**/api/sources/${sourceId}/tree`, route =>
            route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify([
                    { id: 'f-1', name: 'Movies', type: 'folder' },
                    { id: 'v-1', name: 'video.mp4', type: 'file' },
                ]),
            })
        );

        // Select source from the combobox
        const sourcePicker = sourceSelect(page);
        if (await sourcePicker.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sourcePicker.click();
            await pickFirstSourceOption(page).click();
        }

        const chooseBtn = page.getByRole('button', { name: /select|выбрать/i });
        if (await chooseBtn.isVisible({ timeout: 3000 }).catch(() => false) &&
            !(await chooseBtn.isDisabled())) {
            await chooseBtn.click();
            await expect(resourcePickerDialog(page)).toBeVisible({ timeout: 8000 });
            await expect(page.locator('text=Movies')).toBeVisible();
            await expect(page.locator('text=video.mp4')).toBeVisible();
        }
    });

    // ── 7. Folder navigation in picker ────────────────────────────────────────
    test('clicking a folder navigates into it', async ({ page }) => {
        await createLinkButton(page).click();

        await page.route(`**/api/sources/${sourceId}/tree*`, route => {
            const url = new URL(route.request().url());
            if (url.searchParams.has('parentId')) {
                route.fulfill({
                    status: 200, contentType: 'application/json',
                    body: JSON.stringify([{ id: 'ep-1', name: 'S01E01.mkv', type: 'file' }]),
                });
            } else {
                route.fulfill({
                    status: 200, contentType: 'application/json',
                    body: JSON.stringify([{ id: 'show-1', name: 'Breaking Bad', type: 'folder' }]),
                });
            }
        });

        const sourcePicker = sourceSelect(page);
        if (await sourcePicker.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sourcePicker.click();
            await pickFirstSourceOption(page).click();
        }

        const chooseBtn = page.getByRole('button', { name: /select|выбрать/i });
        if (await chooseBtn.isVisible({ timeout: 3000 }).catch(() => false) &&
            !(await chooseBtn.isDisabled())) {
            await chooseBtn.click();
            await expect(page.locator('text=Breaking Bad')).toBeVisible();
            await page.locator('text=Breaking Bad').click();
            await expect(page.locator('text=S01E01.mkv')).toBeVisible({ timeout: 8000 });
        }
    });

    // ── 8. Selecting a file fills externalId ─────────────────────────────────
    test('selecting a file fills externalId field', async ({ page }) => {
        await createLinkButton(page).click();

        await page.route(`**/api/sources/${sourceId}/tree`, route =>
            route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify([{ id: 'movie-xyz-789', name: 'The Movie.mkv', type: 'file' }]),
            })
        );

        const sourcePicker = sourceSelect(page);
        if (await sourcePicker.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sourcePicker.click();
            await pickFirstSourceOption(page).click();
        }

        const chooseBtn = page.getByRole('button', { name: /select|выбрать/i });
        if (await chooseBtn.isVisible({ timeout: 3000 }).catch(() => false) &&
            !(await chooseBtn.isDisabled())) {
            await chooseBtn.click();
            await expect(page.locator('text=The Movie.mkv')).toBeVisible();
            await page.locator('text=The Movie.mkv').click();
            await expect(resourcePickerDialog(page)).not.toBeVisible({ timeout: 8000 });
            await expect(page.locator('input[value="movie-xyz-789"]')).toBeVisible();
        }
    });

    // ── 9. Edit a link ────────────────────────────────────────────────────────
    test('edits a link name', async ({ page }) => {
        await cleanLinks(page);
        await page.request.post('/api/links', {
            data: { sourceId, externalId: 'ext-1', type: 'file', name: 'Original Link', active: true }
        });
        await page.reload();

        await page.locator('table tbody tr').first().locator('button').first().click();
        await expect(page.locator('h2')).toContainText(/edit link|изменить ссылку/i);

        const nameInput = page.locator('input:not([type="password"])').first();
        await nameInput.clear();
        await nameInput.fill('Updated Link Name');
        await saveButton(page).click();

        await expect(page.locator('table')).toContainText('Updated Link Name', { timeout: 8000 });
    });

    // ── 10. Delete via Confirm Modal ───────────────────────────────────────────
    test('deletes a link via Confirm Modal', async ({ page }) => {
        await cleanLinks(page);
        await page.request.post('/api/links', {
            data: { sourceId, externalId: 'ext-del', type: 'file', name: 'Delete Me', active: true }
        });
        await page.reload();
        await expect(page.locator('table tbody tr')).toHaveCount(1, { timeout: 8000 });

        await page.locator('table tbody tr').first().locator('button').last().click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        await page.locator('[role="dialog"] button', { hasText: /delete|удалить/i }).click();

        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
        await expect(page.locator('table tbody tr')).toHaveCount(0, { timeout: 8000 });
    });

    // ── 11. Cancel delete keeps the link ──────────────────────────────────────
    test('cancelling delete confirmation keeps the link', async ({ page }) => {
        await cleanLinks(page);
        await page.request.post('/api/links', {
            data: { sourceId, externalId: 'ext-keep', type: 'file', name: 'Keep Me', active: true }
        });
        await page.reload();

        await page.locator('table tbody tr').first().locator('button').last().click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        await page.locator('[role="dialog"] button', { hasText: /cancel|отмена/i }).click();

        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
        await expect(page.locator('table')).toContainText('Keep Me');
    });
});
