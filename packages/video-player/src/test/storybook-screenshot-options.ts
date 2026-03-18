export interface StorybookScreenshotOptions {
    maxDiffPixels?: number;
    threshold?: number;
}

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

export function resolveStorybookScreenshotOptions(
    name: string,
    options: StorybookScreenshotOptions = {},
    platform = process.platform,
): StorybookScreenshotOptions {
    const resolvedOptions: StorybookScreenshotOptions = { ...options };
    const linuxBudget = platform === 'linux' ? LINUX_VISUAL_DIFF_BUDGETS[name] : undefined;
    if (linuxBudget !== undefined) {
        resolvedOptions.maxDiffPixels = Math.max(resolvedOptions.maxDiffPixels ?? 0, linuxBudget);
    }
    return resolvedOptions;
}
