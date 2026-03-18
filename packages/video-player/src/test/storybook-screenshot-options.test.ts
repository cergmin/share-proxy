import { describe, expect, it } from 'vitest';
import { resolveStorybookScreenshotOptions } from './storybook-screenshot-options';

describe('resolveStorybookScreenshotOptions', () => {
    it('keeps the caller maxDiffPixels on non-linux platforms', () => {
        expect(
            resolveStorybookScreenshotOptions('player-visual-default-chrome.png', {
                maxDiffPixels: 100,
                threshold: 0.2,
            }, 'darwin'),
        ).toEqual({
            maxDiffPixels: 100,
            threshold: 0.2,
        });
    });

    it('raises the caller maxDiffPixels to the linux snapshot budget when needed', () => {
        expect(
            resolveStorybookScreenshotOptions('player-visual-default-chrome.png', {
                maxDiffPixels: 100,
            }, 'linux'),
        ).toEqual({
            maxDiffPixels: 600,
        });
    });

    it('preserves a larger caller maxDiffPixels on linux', () => {
        expect(
            resolveStorybookScreenshotOptions('player-visual-settings-root-open.png', {
                maxDiffPixels: 1200,
                threshold: 0.1,
            }, 'linux'),
        ).toEqual({
            maxDiffPixels: 1200,
            threshold: 0.1,
        });
    });
});
