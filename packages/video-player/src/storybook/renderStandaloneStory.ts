import {
    defineVideoPlayerCustomElements,
    getVideoPlayerStyles,
} from '../index';

const STORY_STYLE_ID = 'share-proxy-video-player-storybook-styles';

function ensureStorybookDocumentLayout(doc: Document): void {
    const html = doc.documentElement;
    const body = doc.body;

    html.style.width = '100%';
    html.style.height = '100%';
    html.style.minHeight = '100%';

    body.style.width = '100%';
    body.style.height = '100%';
    body.style.minHeight = '100%';
    body.style.margin = '0';
    body.style.background = '#020617';
}

function ensureStyles(doc: Document): void {
    if (doc.getElementById(STORY_STYLE_ID)) {
        return;
    }

    const style = doc.createElement('style');
    style.id = STORY_STYLE_ID;
    style.textContent = getVideoPlayerStyles();
    doc.head.appendChild(style);
}

export interface StandaloneStoryRenderOptions {
    className?: string;
    frameHeight?: string;
    frameMinHeight?: string;
    setup: (stage: HTMLElement, root: HTMLElement, markReady: () => void) => void;
}

export function renderStandaloneStory(options: StandaloneStoryRenderOptions): HTMLElement {
    ensureStorybookDocumentLayout(document);
    ensureStyles(document);
    defineVideoPlayerCustomElements();

    const frame = document.createElement('div');
    frame.dataset.storyReady = 'false';
    frame.dataset.storyRoot = 'true';
    frame.style.width = '100%';
    frame.style.height = options.frameHeight ?? options.frameMinHeight ?? '420px';
    frame.style.minHeight = options.frameMinHeight ?? options.frameHeight ?? '420px';
    frame.style.background = '#020617';
    frame.style.position = 'relative';
    frame.style.overflow = 'hidden';

    const root = document.createElement('div');
    root.className = `spvp-root${options.className ? ` ${options.className}` : ''}`;
    root.dataset.embed = 'false';
    root.dataset.fullViewport = 'false';
    root.dataset.idle = 'false';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.minHeight = '100%';
    root.style.position = 'relative';

    const stage = document.createElement('div');
    stage.className = 'spvp-stage';
    stage.style.position = 'relative';
    stage.style.width = '100%';
    stage.style.height = '100%';
    stage.style.minHeight = '100%';

    root.appendChild(stage);
    frame.appendChild(root);
    const markReady = () => {
        frame.dataset.storyReady = 'true';
    };
    options.setup(stage, root, markReady);

    return frame;
}
