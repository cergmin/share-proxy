import { mountVideoPlayer, type VideoPlayerHandle, type VideoPlayerOptions } from '../index';

export interface PlayerStoryRenderOptions {
    player: VideoPlayerOptions;
    setup?: (
        root: HTMLElement,
        handle: VideoPlayerHandle,
        markReady: () => void,
    ) => void | Promise<void>;
}

function getStoryViewportHeight(doc: Document): number {
    const win = doc.defaultView;
    const htmlHeight = doc.documentElement.clientHeight;
    const bodyHeight = doc.body?.clientHeight ?? 0;
    const viewportHeight = win?.innerHeight ?? 0;

    return Math.max(htmlHeight, bodyHeight, viewportHeight, 720);
}

function ensureStorybookDocumentLayout(doc: Document): void {
    const html = doc.documentElement;
    const body = doc.body;
    const storybookRoot = doc.getElementById('storybook-root');
    const root = doc.getElementById('root');

    html.style.width = '100%';
    html.style.height = '100%';
    html.style.minHeight = '100%';

    body.style.width = '100%';
    body.style.height = '100%';
    body.style.minHeight = '100%';
    body.style.margin = '0';
    body.style.background = '#020617';
    body.style.overflow = 'hidden';

    if (storybookRoot instanceof HTMLElement) {
        storybookRoot.style.width = '100%';
        storybookRoot.style.height = '100%';
        storybookRoot.style.minHeight = '100%';
    }

    if (root instanceof HTMLElement) {
        root.style.width = '100%';
        root.style.height = '100%';
        root.style.minHeight = '100%';
    }
}

export function renderPlayerStory(options: PlayerStoryRenderOptions): HTMLElement {
    ensureStorybookDocumentLayout(document);
    const viewportHeight = getStoryViewportHeight(document);

    const frame = document.createElement('div');
    frame.dataset.storyReady = 'false';
    frame.dataset.storyRoot = 'true';
    frame.style.width = '100%';
    frame.style.height = `${viewportHeight}px`;
    frame.style.minHeight = `${viewportHeight}px`;
    frame.style.maxHeight = `${viewportHeight}px`;
    frame.style.background = '#020617';
    frame.style.position = 'relative';
    frame.style.overflow = 'hidden';

    const root = document.createElement('div');
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.minHeight = '0';
    root.style.maxHeight = '100%';
    frame.append(root);

    queueMicrotask(async () => {
        const handle = await mountVideoPlayer(root, options.player);
        const markReady = () => {
            frame.dataset.storyReady = 'true';
        };

        await options.setup?.(root, handle, markReady);
        markReady();
    });

    return frame;
}
