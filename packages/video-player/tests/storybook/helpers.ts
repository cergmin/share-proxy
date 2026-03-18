import { expect, type Locator, type Page } from '@playwright/test';

const LINUX_VISUAL_DIFF_BUDGETS: Record<string, number> = {
    'player-ambient-popup.png': 250,
    'player-settings-root-popup.png': 500,
    'player-speed-popup.png': 500,
    'player-visual-default-chrome.png': 600,
    'player-visual-settings-root-first-hover.png': 1000,
    'player-visual-settings-root-last-hover.png': 1000,
    'player-visual-settings-root-open.png': 1000,
    'player-visual-speed-open.png': 1000,
    'standalone-control-bar.png': 250,
    'standalone-control-bar-volume-open-narrow.png': 150,
    'standalone-control-bar-volume-open.png': 250,
    'standalone-icons.png': 2600,
    'standalone-popup.png': 250,
    'standalone-settings-popup-header-hover.png': 450,
    'standalone-settings-popup.png': 450,
    'standalone-timeline-preview.png': 200,
};

export function getStoryFrame(page: Page) {
    return page.frameLocator('#storybook-preview-iframe');
}

interface GotoStoryOptions {
    waitForReady?: boolean;
}

interface ScreenshotOptions {
    maxDiffPixels?: number;
    threshold?: number;
}

export async function gotoStory(page: Page, storyId: string, options: GotoStoryOptions = {}): Promise<Locator> {
    await page.goto(`/?path=/story/${storyId}`);
    const frame = getStoryFrame(page);
    const root = frame.locator('[data-story-root="true"]');
    await expect(root).toBeVisible({ timeout: 15000 });
    if (options.waitForReady !== false) {
        await expect(frame.locator('[data-story-ready="true"]')).toBeVisible({ timeout: 15000 });
    }
    return root;
}

export async function expectStoryScreenshot(locator: Locator, name: string): Promise<void> {
    await expectStoryScreenshotWithOptions(locator, name);
}

export async function expectStoryScreenshotWithOptions(
    locator: Locator,
    name: string,
    options: ScreenshotOptions = {},
): Promise<void> {
    const linuxBudget = process.platform === 'linux' ? LINUX_VISUAL_DIFF_BUDGETS[name] : undefined;
    const maxDiffPixels = Math.max(options.maxDiffPixels ?? 0, linuxBudget ?? 0);
    await expect(locator).toHaveScreenshot(name, {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        ...(maxDiffPixels > 0 ? { maxDiffPixels } : {}),
        ...options,
    });
}
