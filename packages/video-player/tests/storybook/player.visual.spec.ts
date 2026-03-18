import { expect, test } from '@playwright/test';
import { expectStoryScreenshot, expectStoryScreenshotWithOptions, getStoryFrame, gotoStory } from './helpers';

test.use({
    viewport: {
        width: 1600,
        height: 1200,
    },
});

async function waitForOpenVolumeSlider(frame: ReturnType<typeof getStoryFrame>): Promise<void> {
    const sliderShell = frame.locator('.spvp-volume-slider-shell');
    await frame.locator('.spvp-button[data-kind="mute"]').hover();
    await expect.poll(async () => {
        return sliderShell.evaluate((element) => Number.parseFloat(getComputedStyle(element).width) || 0);
    }).toBeGreaterThan(90);
}

test.describe('video-player Storybook visual regressions', () => {
    test('full player default chrome', async ({ page }) => {
        const root = await gotoStory(page, 'video-player-player--visual-default-chrome');
        await expectStoryScreenshotWithOptions(root, 'player-visual-default-chrome.png', {
            maxDiffPixels: 100,
        });
    });

    test('full player with settings root open', async ({ page }) => {
        const root = await gotoStory(page, 'video-player-player--visual-settings-root');
        await expectStoryScreenshotWithOptions(root, 'player-visual-settings-root-open.png', {
            maxDiffPixels: 100,
        });
    });

    test('settings root popup', async ({ page }) => {
        await gotoStory(page, 'video-player-player--visual-settings-root-popup');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('spvp-settings-popup[data-visual-capture="popup"]'), 'player-settings-root-popup.png');
    });

    test('playback speed submenu', async ({ page }) => {
        await gotoStory(page, 'video-player-player--visual-playback-speed-popup');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('spvp-settings-popup[data-visual-capture="popup"]'), 'player-speed-popup.png');
    });

    test('ambient submenu', async ({ page }) => {
        await gotoStory(page, 'video-player-player--visual-ambient-settings-popup');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('spvp-settings-popup[data-visual-capture="popup"]'), 'player-ambient-popup.png');
    });

    test('standalone popup', async ({ page }) => {
        await gotoStory(page, 'video-player-components-popup--default');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('spvp-popup[data-visual-capture="popup"]'), 'standalone-popup.png');
    });

    test('standalone settings popup', async ({ page }) => {
        await gotoStory(page, 'video-player-components-settings-popup--tall-menu');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('spvp-settings-popup[data-visual-capture="settings-popup"]'), 'standalone-settings-popup.png');
    });

    test('standalone settings popup header hover', async ({ page }) => {
        await gotoStory(page, 'video-player-components-settings-popup--tall-menu');
        const frame = getStoryFrame(page);
        await frame.getByRole('button', { name: 'Back' }).hover();
        await expectStoryScreenshot(frame.locator('spvp-settings-popup[data-visual-capture="settings-popup"]'), 'standalone-settings-popup-header-hover.png');
    });

    test('standalone timeline', async ({ page }) => {
        await gotoStory(page, 'video-player-components-timeline--default');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('[data-visual-capture="timeline"]'), 'standalone-timeline.png');
    });

    test('standalone timeline preview', async ({ page }) => {
        await gotoStory(page, 'video-player-components-timeline--with-preview');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('[data-visual-capture="timeline-preview"]'), 'standalone-timeline-preview.png');
    });

    test('standalone control bar', async ({ page }) => {
        await gotoStory(page, 'video-player-components-control-bar--default');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('[data-visual-capture="control-bar"]'), 'standalone-control-bar.png');
    });

    test('standalone control bar with volume open', async ({ page }) => {
        await gotoStory(page, 'video-player-components-control-bar--default');
        const frame = getStoryFrame(page);
        await waitForOpenVolumeSlider(frame);
        await expectStoryScreenshot(frame.locator('[data-visual-capture="control-bar"]'), 'standalone-control-bar-volume-open.png');
    });

    test('standalone control bar with volume open at narrow width', async ({ page }) => {
        await page.setViewportSize({ width: 560, height: 320 });
        await gotoStory(page, 'video-player-components-control-bar--default');
        const frame = getStoryFrame(page);
        await frame.locator('.spvp-button[data-kind="mute"]').hover();
        await expect.poll(async () => {
            return frame.locator('.spvp-volume-slider-shell').evaluate((element) => Number.parseFloat(getComputedStyle(element).width) || 0);
        }).toBeGreaterThan(50);
        await expectStoryScreenshot(frame.locator('[data-visual-capture="control-bar"]'), 'standalone-control-bar-volume-open-narrow.png');
    });

    test('standalone icons', async ({ page }) => {
        await gotoStory(page, 'video-player-foundations-icons--default');
        const frame = getStoryFrame(page);
        await expectStoryScreenshot(frame.locator('[data-visual-capture="icons"]'), 'standalone-icons.png');
    });

    test('full player settings root first item hover', async ({ page }) => {
        await gotoStory(page, 'video-player-player--visual-settings-root');
        const frame = getStoryFrame(page);
        const firstItem = frame.getByRole('button', { name: 'Open quality settings' });
        const box = await firstItem.boundingBox();
        if (!box) {
            throw new Error('Expected first settings item bounding box');
        }
        await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
        await expectStoryScreenshot(frame.locator('[data-visual-capture="player"]'), 'player-visual-settings-root-first-hover.png');
    });

    test('full player settings root last item hover', async ({ page }) => {
        await gotoStory(page, 'video-player-player--visual-settings-root');
        const frame = getStoryFrame(page);
        const lastItem = frame.getByRole('button', { name: 'Toggle debug overlay' });
        const box = await lastItem.boundingBox();
        if (!box) {
            throw new Error('Expected last settings item bounding box');
        }
        await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
        await expectStoryScreenshot(frame.locator('[data-visual-capture="player"]'), 'player-visual-settings-root-last-hover.png');
    });

    test('full player with playback speed open', async ({ page }) => {
        const root = await gotoStory(page, 'video-player-player--visual-playback-speed');
        await expectStoryScreenshot(root, 'player-visual-speed-open.png');
    });
});
