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

async function getSliderShellWidth(sliderShell: Locator): Promise<number> {
    return sliderShell.evaluate((element) => Number.parseFloat(getComputedStyle(element).width) || 0);
}

test.describe('video-player Storybook', () => {
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
        await expect(preview).toHaveAttribute('data-visible', 'false');
        await expect(currentTimeBadge).toHaveAttribute('data-hidden', 'true');

        const progressBox = await progressInput.boundingBox();

        if (!progressBox) {
            throw new Error('Expected progress bounding box to be available');
        }

        await page.mouse.move(
            progressBox.x + (progressBox.width * 0.82),
            progressBox.y + (progressBox.height / 2),
        );
        await expect(preview).toHaveAttribute('data-visible', 'false');
        await expect(currentTimeBadge).toHaveAttribute('data-hidden', 'true');
        await expect(progressHover).toHaveAttribute('data-visible', 'true');

        await expect(preview).toHaveAttribute('data-visible', 'false');
        await expect(currentTimeBadge).toHaveAttribute('data-hidden', 'true');
        await expect(progressHover).toHaveAttribute('data-visible', 'true');
    });

    test('clicking mute toggles audio without toggling playback', async ({ page }) => {
        await gotoStory(page, 'video-player-player--default', { waitForReady: false });
        const frame = getStoryFrame(page);
        const video = frame.locator('video');

        await expect.poll(async () => video.evaluate((element) => element.paused)).toBe(true);
        await expect.poll(async () => video.evaluate((element) => element.muted)).toBe(false);

        await frame.getByRole('button', { name: 'Mute' }).click();

        await expect.poll(async () => video.evaluate((element) => element.muted)).toBe(true);
        await expect.poll(async () => video.evaluate((element) => element.paused)).toBe(true);
        await expect(frame.getByRole('button', { name: 'Unmute' })).toBeVisible();
    });

    test('volume slider does not retain focus after click', async ({ page }) => {
        await gotoStory(page, 'video-player-player--default', { waitForReady: false });
        const frame = getStoryFrame(page);
        const muteButton = frame.locator('.spvp-button[data-kind="mute"]');
        const volumeRange = frame.locator('.spvp-volume-range');

        await muteButton.hover();
        await expect.poll(async () => volumeRange.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('auto');
        await volumeRange.click({ position: { x: 24, y: 22 } });

        await expect.poll(async () => volumeRange.evaluate((element) => element.ownerDocument.activeElement === element)).toBe(false);
    });

    test('volume slider stays collapsed until hover', async ({ page }) => {
        await gotoStory(page, 'video-player-components-control-bar--default');
        const frame = getStoryFrame(page);
        const settingsButton = frame.locator('.spvp-button[data-kind="settings"]');
        const muteButton = frame.locator('.spvp-button[data-kind="mute"]');
        const sliderShell = frame.locator('.spvp-volume-slider-shell');

        await expect.poll(async () => getSliderShellWidth(sliderShell)).toBe(0);
        await settingsButton.hover();
        await expect.poll(async () => getSliderShellWidth(sliderShell)).toBe(0);
        await muteButton.hover();
        await expect.poll(async () => getSliderShellWidth(sliderShell)).toBeGreaterThan(90);
    });

    test('volume slider stays open inside left controls and closes after leaving them', async ({ page }) => {
        await gotoStory(page, 'video-player-components-control-bar--default');
        const frame = getStoryFrame(page);
        const muteButton = frame.locator('.spvp-button[data-kind="mute"]');
        const settingsButton = frame.locator('.spvp-button[data-kind="settings"]');
        const timeToggle = frame.locator('.spvp-time-toggle');
        const sliderShell = frame.locator('.spvp-volume-slider-shell');

        await muteButton.hover();
        await expect.poll(async () => getSliderShellWidth(sliderShell)).toBeGreaterThan(90);

        await timeToggle.hover();
        await expect.poll(async () => getSliderShellWidth(sliderShell)).toBeGreaterThan(90);

        await settingsButton.hover();
        await expect.poll(async () => getSliderShellWidth(sliderShell)).toBe(0);
    });

    test('volume slider does not overlap the time toggle when expanded', async ({ page }) => {
        await gotoStory(page, 'video-player-components-control-bar--default');
        const frame = getStoryFrame(page);
        const muteButton = frame.locator('.spvp-button[data-kind="mute"]');
        const volume = frame.locator('.spvp-volume');
        const timeToggle = frame.locator('.spvp-time-toggle');

        await muteButton.hover();
        await expect.poll(async () => getSliderShellWidth(frame.locator('.spvp-volume-slider-shell'))).toBeGreaterThan(90);

        const volumeBox = await volume.boundingBox();
        const timeToggleBox = await timeToggle.boundingBox();

        if (!volumeBox || !timeToggleBox) {
            throw new Error('Expected volume and time toggle bounding boxes to be available');
        }

        expect(volumeBox.x + volumeBox.width).toBeLessThanOrEqual(timeToggleBox.x);
    });

    test('volume slider stays aligned and does not overlap the time toggle at narrow widths', async ({ page }) => {
        await page.setViewportSize({ width: 560, height: 320 });
        await gotoStory(page, 'video-player-components-control-bar--default');
        const frame = getStoryFrame(page);
        const muteButton = frame.locator('.spvp-button[data-kind="mute"]');
        const sliderShell = frame.locator('.spvp-volume-slider-shell');
        const timeToggle = frame.locator('.spvp-time-toggle');
        const settingsButton = frame.locator('.spvp-button[data-kind="settings"]');

        await muteButton.hover();
        await expect.poll(async () => getSliderShellWidth(sliderShell)).toBeGreaterThan(50);

        const muteButtonBox = await muteButton.boundingBox();
        const sliderShellBox = await sliderShell.boundingBox();
        const timeToggleBox = await timeToggle.boundingBox();
        const settingsButtonBox = await settingsButton.boundingBox();

        if (!muteButtonBox || !sliderShellBox || !timeToggleBox || !settingsButtonBox) {
            throw new Error('Expected narrow control bar bounding boxes to be available');
        }

        expect(sliderShellBox.x - (muteButtonBox.x + muteButtonBox.width)).toBeLessThanOrEqual(6);
        expect(sliderShellBox.x - (muteButtonBox.x + muteButtonBox.width)).toBeGreaterThanOrEqual(3);
        expect(sliderShellBox.x + sliderShellBox.width).toBeLessThanOrEqual(timeToggleBox.x);
        expect(timeToggleBox.x + timeToggleBox.width).toBeLessThanOrEqual(settingsButtonBox.x);
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

    test('renders standalone icons story', async ({ page }) => {
        await gotoStory(page, 'video-player-foundations-icons--default');
        const frame = getStoryFrame(page);

        await expect(frame.getByText('volume-off')).toBeVisible();
        await expect(frame.getByText('fullscreen-exit')).toBeVisible();
    });
});
