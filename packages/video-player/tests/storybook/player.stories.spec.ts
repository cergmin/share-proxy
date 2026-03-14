import { expect, test, type Locator } from '@playwright/test';
import { getStoryFrame, gotoStory } from './helpers';

async function getSettledMenuHeight(menu: Locator): Promise<string> {
    let previousHeight = '';
    let stableReads = 0;

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const nextHeight = await menu.evaluate((element) => getComputedStyle(element).height);
        if (nextHeight === previousHeight) {
            stableReads += 1;
            if (stableReads >= 2) {
                return nextHeight;
            }
        } else {
            previousHeight = nextHeight;
            stableReads = 0;
        }
        await menu.page().waitForTimeout(50);
    }

    return menu.evaluate((element) => getComputedStyle(element).height);
}

test.describe('video-player Storybook', () => {
    test('renders player docs page without renderer errors', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        await page.goto('/?path=/docs/video-player-player--docs');
        const frame = getStoryFrame(page);
        await expect(frame.locator('.sbdocs-title').getByText('Player', { exact: true })).toBeVisible();
        await expect(frame.getByRole('link', { name: 'Open canvas in new tab' })).toBeVisible();
        await expect(frame.getByRole('textbox').first()).toBeVisible();
        await expect
            .poll(() => pageErrors, { timeout: 5000 })
            .not.toContain('docsParameter.renderer is not a function');
    });

    test('renders popup docs page without renderer errors', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        await page.goto('/?path=/docs/video-player-components-popup--docs');
        const frame = getStoryFrame(page);
        await expect(frame.getByRole('heading', { name: 'Popup' })).toBeVisible();
        await expect(frame.getByText('Abstract Popup')).toBeVisible();
        await expect
            .poll(() => pageErrors, { timeout: 5000 })
            .not.toContain('docsParameter.renderer is not a function');
    });

    test('opens root settings popup', async ({ page }) => {
        await gotoStory(page, 'video-player-player--default', { waitForReady: false });
        const frame = getStoryFrame(page);
        await frame.getByRole('button', { name: 'Settings' }).click();
        const menu = frame.locator('.spvp-menu');
        await expect(menu).toBeVisible();

        const rootHeight = Number.parseFloat(await getSettledMenuHeight(menu));
        expect(rootHeight).toBeGreaterThan(200);
        await expect(frame.getByRole('button', { name: 'Open playback speed settings' })).toBeVisible();
    });

    test('restores root popup height after speed -> back', async ({ page }) => {
        await gotoStory(page, 'video-player-player--default', { waitForReady: false });
        const frame = getStoryFrame(page);
        await frame.getByRole('button', { name: 'Settings' }).click();

        const menu = frame.locator('.spvp-menu');
        await expect(menu).toBeVisible();
        await expect(frame.getByRole('button', { name: 'Open quality settings' })).toBeVisible();
        const rootHeight = await getSettledMenuHeight(menu);

        await frame.getByRole('button', { name: 'Open playback speed settings' }).click();
        await expect(frame.getByRole('button', { name: 'Set speed to 3x' })).toBeVisible();

        await frame.getByRole('button', { name: 'Back' }).click();
        await expect(frame.getByRole('button', { name: 'Open quality settings' })).toBeVisible();
        await expect(frame.getByRole('button', { name: 'Open playback speed settings' })).toBeVisible();

        await expect.poll(async () => getSettledMenuHeight(menu)).toBe(rootHeight);
    });

    test('restores root popup height after speed -> close -> reopen', async ({ page }) => {
        await gotoStory(page, 'video-player-player--default', { waitForReady: false });
        const frame = getStoryFrame(page);
        await frame.getByRole('button', { name: 'Settings' }).click();
        const menu = frame.locator('.spvp-menu');
        await expect(menu).toBeVisible();
        await expect(frame.getByRole('button', { name: 'Open quality settings' })).toBeVisible();
        const rootHeight = await getSettledMenuHeight(menu);

        await frame.getByRole('button', { name: 'Open playback speed settings' }).click();
        await expect(frame.getByRole('button', { name: 'Set speed to 3x' })).toBeVisible();
        await frame.getByRole('button', { name: 'Settings' }).click();
        await expect(menu).toHaveAttribute('hidden', '');

        await frame.getByRole('button', { name: 'Settings' }).click();
        await expect(frame.getByRole('button', { name: 'Open quality settings' })).toBeVisible();
        await expect(frame.getByRole('button', { name: 'Open playback speed settings' })).toBeVisible();
        await expect.poll(async () => getSettledMenuHeight(menu)).toBe(rootHeight);
    });

    test('tall settings popup scrolls and keeps the header sticky', async ({ page }) => {
        await page.setViewportSize({ width: 800, height: 700 });
        await gotoStory(page, 'video-player-components-settings-popup--tall-menu');
        const frame = getStoryFrame(page);

        const popup = frame.locator('.spvp-menu');
        const header = frame.locator('.spvp-menu-header');
        const scroll = frame.locator('.spvp-menu-scroll');

        await expect(popup).toBeVisible();
        const topBefore = await header.evaluate((element) => element.getBoundingClientRect().top);
        await scroll.evaluate((element) => {
            element.scrollTop = 240;
            element.dispatchEvent(new Event('scroll'));
        });
        await expect.poll(async () => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        const topAfter = await header.evaluate((element) => element.getBoundingClientRect().top);
        expect(Math.abs(topAfter - topBefore)).toBeLessThanOrEqual(1);
    });

    test('moving from settings button to popup keeps hover line but suppresses preview and hover badges', async ({ page }) => {
        await gotoStory(page, 'video-player-player--settings-open', { waitForReady: false });
        const frame = getStoryFrame(page);

        const settingsButton = frame.locator('.spvp-button[data-kind="settings"]');
        await expect(frame.getByRole('button', { name: 'Open playback speed settings' })).toBeVisible();

        const menu = frame.locator('.spvp-menu');
        const preview = frame.locator('.spvp-preview');
        const progressHover = frame.locator('.spvp-progress-hover');
        const progressInput = frame.locator('.spvp-progress');
        const currentTimeBadge = frame.locator('.spvp-current-time');

        await expect(menu).toBeVisible();
        await expect(preview).toHaveAttribute('hidden', '');
        await expect(currentTimeBadge).toHaveAttribute('data-hidden', 'true');

        const progressBox = await progressInput.boundingBox();

        if (!progressBox) {
            throw new Error('Expected progress bounding box to be available');
        }

        await page.mouse.move(
            progressBox.x + (progressBox.width * 0.82),
            progressBox.y + (progressBox.height / 2),
        );
        await expect(preview).toHaveAttribute('hidden', '');
        await expect(currentTimeBadge).toHaveAttribute('data-hidden', 'true');
        await expect(progressHover).toHaveAttribute('data-visible', 'true');

        await expect(preview).toHaveAttribute('hidden', '');
        await expect(currentTimeBadge).toHaveAttribute('data-hidden', 'true');
        await expect(progressHover).toHaveAttribute('data-visible', 'true');
    });

    test('renders standalone popup story', async ({ page }) => {
        await gotoStory(page, 'video-player-components-popup--default');
        const frame = getStoryFrame(page);

        await expect(frame.getByText('Abstract Popup')).toBeVisible();
        await expect(frame.getByText('First action')).toBeVisible();
    });

    test('renders standalone settings popup story', async ({ page }) => {
        await gotoStory(page, 'video-player-components-settings-popup--tall-menu');
        const frame = getStoryFrame(page);

        await expect(frame.getByText('Playback speed')).toBeVisible();
        await expect(frame.getByText('4x')).toBeVisible();
    });

    test('renders standalone timeline story', async ({ page }) => {
        await gotoStory(page, 'video-player-components-timeline--default');
        const frame = getStoryFrame(page);

        await expect(frame.getByLabel('Seek')).toBeVisible();
        await expect(frame.locator('.spvp-current-time')).toBeHidden();
    });
});
