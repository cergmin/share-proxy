import { renderPlayerStory } from './renderPlayerStory';
import { defaultStoryOptions, visualPosterUrl } from './fixtures';

type VisualPlayerPresentation = 'player' | 'popup';
type VisualPlayerState = 'ambient-menu' | 'default-chrome' | 'settings-root' | 'speed-menu';

const VISUAL_FRAME_HEIGHT_PX = 720;
const VISUAL_DURATION_SECONDS = 3_970;
const VISUAL_CURRENT_TIME_SECONDS = 342;
const VISUAL_BUFFERED_SECONDS = 1_740;

function createStaticTimeRanges(end: number): TimeRanges {
    return {
        length: 1,
        start: () => 0,
        end: () => end,
    } as TimeRanges;
}

function defineStableMediaProperty<T>(video: HTMLVideoElement, key: string, value: T): void {
    Object.defineProperty(video, key, {
        configurable: true,
        get: () => value,
        set: () => undefined,
    });
}

function stabilizeVisualPlayerChrome(root: HTMLElement, video: HTMLVideoElement): void {
    try {
        defineStableMediaProperty(video, 'currentTime', VISUAL_CURRENT_TIME_SECONDS);
        defineStableMediaProperty(video, 'duration', VISUAL_DURATION_SECONDS);
        defineStableMediaProperty(video, 'paused', true);
        defineStableMediaProperty(video, 'ended', false);
        defineStableMediaProperty(video, 'seeking', false);
        defineStableMediaProperty(video, 'readyState', 4);
        defineStableMediaProperty(video, 'buffered', createStaticTimeRanges(VISUAL_BUFFERED_SECONDS));
    } catch {
        // If the browser refuses to shadow a media property, we still fall back to static DOM values below.
    }

    const timePrimary = root.querySelector<HTMLElement>('.spvp-time-primary');
    const timeSecondary = root.querySelector<HTMLElement>('.spvp-time-secondary');
    const progressInput = root.querySelector<HTMLInputElement>('.spvp-progress');
    const progressPlayed = root.querySelector<HTMLElement>('.spvp-progress-played');
    const progressBuffer = root.querySelector<HTMLElement>('.spvp-progress-buffer');
    const progressHandle = root.querySelector<HTMLElement>('.spvp-progress-handle');
    const progressHover = root.querySelector<HTMLElement>('.spvp-progress-hover');
    const preview = root.querySelector<HTMLElement>('.spvp-preview');
    const currentTimeBadge = root.querySelector<HTMLElement>('.spvp-current-time');
    const playedPercent = (VISUAL_CURRENT_TIME_SECONDS / VISUAL_DURATION_SECONDS) * 100;
    const bufferedPercent = (VISUAL_BUFFERED_SECONDS / VISUAL_DURATION_SECONDS) * 100;

    if (timePrimary) {
        timePrimary.textContent = '5:42';
    }
    if (timeSecondary) {
        timeSecondary.textContent = ' / 1:06:10';
    }
    if (progressInput) {
        progressInput.value = String(Math.round((playedPercent / 100) * 1000));
    }
    if (progressPlayed) {
        progressPlayed.style.width = `${playedPercent}%`;
    }
    if (progressBuffer) {
        progressBuffer.style.width = `${bufferedPercent}%`;
    }
    if (progressHandle) {
        progressHandle.style.left = `${playedPercent}%`;
    }
    if (progressHover) {
        progressHover.dataset.visible = 'false';
        progressHover.style.width = '0%';
    }
    if (preview) {
        preview.dataset.visible = 'false';
    }
    if (currentTimeBadge) {
        currentTimeBadge.dataset.hidden = 'true';
    }
}

function waitForAnimationFrame(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
    });
}

async function waitForElement<T extends Element>(
    resolveElement: () => T | null,
    timeoutMs = 4000,
): Promise<T> {
    const deadline = performance.now() + timeoutMs;

    while (performance.now() < deadline) {
        const element = resolveElement();
        if (element) {
            return element;
        }

        await waitForAnimationFrame();
    }

    throw new Error('Timed out waiting for visual story element');
}

function dispatchClick(element: HTMLElement): void {
    element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
    }));
}

async function openSettingsMenu(root: HTMLElement): Promise<HTMLElement> {
    const settingsButton = await waitForElement(() => (
        root.querySelector('.spvp-button[data-kind="settings"]') as HTMLButtonElement | null
    ));

    dispatchClick(settingsButton);

    return waitForElement(() => {
        const popup = root.querySelector('.spvp-menu') as HTMLElement | null;
        return popup && !popup.hidden && popup.dataset.open === 'true' ? popup : null;
    });
}

async function openSubmenu(root: HTMLElement, buttonLabel: string, readySelector: string): Promise<void> {
    const submenuButton = await waitForElement(() => (
        root.querySelector(`[aria-label="${buttonLabel}"]`) as HTMLButtonElement | null
    ));

    dispatchClick(submenuButton);

    await waitForElement(() => root.querySelector(readySelector));
}

export function renderVisualPlayerStory(
    state: VisualPlayerState,
    presentation: VisualPlayerPresentation = 'player',
): HTMLElement {
    return renderPlayerStory({
        player: {
            ...defaultStoryOptions,
            persistenceKey: `storybook-player-visual-${presentation}-${state}`,
            posterUrl: visualPosterUrl,
            title: 'Storybook Player Demo',
        },
        setup: async (root, _handle) => {
            const capture = document.createElement('div');
            capture.style.position = 'relative';
            capture.style.width = '100%';
            capture.style.height = `${VISUAL_FRAME_HEIGHT_PX}px`;
            capture.style.minHeight = `${VISUAL_FRAME_HEIGHT_PX}px`;
            capture.style.overflow = 'hidden';
            capture.style.background = '#020617';

            if (presentation === 'player') {
                capture.dataset.visualCapture = 'player';
            }

            root.replaceWith(capture);
            capture.append(root);

            root.style.width = '100%';
            root.style.height = '100%';
            root.style.minHeight = `${VISUAL_FRAME_HEIGHT_PX}px`;

            stabilizeVisualPlayerChrome(root, _handle.video);

            if (state === 'default-chrome') {
                await waitForAnimationFrame();
                stabilizeVisualPlayerChrome(root, _handle.video);
                return;
            }

            const popup = await openSettingsMenu(root);
            popup.dataset.visualCapture = 'popup';

        if (state === 'speed-menu') {
            await openSubmenu(root, 'Open playback speed settings', '[aria-label="Set speed to 3x"]');
        } else if (state === 'ambient-menu') {
            await openSubmenu(root, 'Open ambient settings', '[aria-label="Ambient level"]');
        } else {
            await waitForElement(() => root.querySelector('[aria-label="Open quality settings"]'));
        }

            stabilizeVisualPlayerChrome(root, _handle.video);
            await waitForAnimationFrame();
            stabilizeVisualPlayerChrome(root, _handle.video);
            await waitForAnimationFrame();
        },
    });
}
