import { expect, type Locator, type Page } from '@playwright/test';
import {
    resolveStorybookScreenshotOptions,
    type StorybookScreenshotOptions,
} from '../../src/test/storybook-screenshot-options';

export function getStoryFrame(page: Page) {
    return page.frameLocator('#storybook-preview-iframe');
}

interface GotoStoryOptions {
    waitForReady?: boolean;
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
    options: StorybookScreenshotOptions = {},
): Promise<void> {
    const resolvedOptions = resolveStorybookScreenshotOptions(name, options);
    await expect(locator).toHaveScreenshot(name, {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        ...resolvedOptions,
    });
}
