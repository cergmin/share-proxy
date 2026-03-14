import { renderPlayerStory } from './renderPlayerStory';
import { defaultStoryOptions, visualPosterUrl } from './fixtures';

type VisualPlayerPresentation = 'player' | 'popup';
type VisualPlayerState = 'ambient-menu' | 'default-chrome' | 'settings-root' | 'speed-menu';

const VISUAL_FRAME_HEIGHT_PX = 720;

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

            if (state === 'default-chrome') {
                await waitForAnimationFrame();
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

            await waitForAnimationFrame();
            await waitForAnimationFrame();
        },
    });
}
