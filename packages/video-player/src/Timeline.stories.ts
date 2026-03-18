import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { expect, within } from 'storybook/test';
import { renderStandaloneStory } from './storybook/renderStandaloneStory';

const previewTileSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#fb923c"/>
      <stop offset="52%" stop-color="#c084fc"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#g)"/>
  <circle cx="88" cy="86" r="56" fill="rgba(255,255,255,0.22)"/>
  <circle cx="230" cy="96" r="72" fill="rgba(0,0,0,0.22)"/>
</svg>
`);

const previewImageUrl = `data:image/svg+xml;utf8,${previewTileSvg}`;

function renderTimelineStory(showPreview: boolean): HTMLElement {
    return renderStandaloneStory({
        frameHeight: showPreview ? '320px' : '260px',
        setup: (stage, _root, markReady) => {
            const overlay = document.createElement('div');
            overlay.className = 'spvp-overlay';

            const capture = document.createElement('div');
            capture.dataset.visualCapture = showPreview ? 'timeline-preview' : 'timeline';
            capture.style.width = 'min(1240px, calc(100% - 72px))';
            capture.style.padding = showPreview ? '116px 0 32px' : '76px 0 28px';
            capture.style.boxSizing = 'border-box';

            const timeline = document.createElement('spvp-timeline') as HTMLElement & {
                refs: {
                    currentTimeBadge: HTMLElement;
                    preview: HTMLElement;
                    previewFrame: HTMLElement;
                    previewGlow: HTMLElement;
                    previewImage: HTMLElement;
                    previewTime: HTMLElement;
                    progressBuffer: HTMLElement;
                    progressHandle: HTMLElement;
                    progressHover: HTMLElement;
                    progressInput: HTMLInputElement;
                    progressPlayed: HTMLElement;
                    progressShell: HTMLElement;
                };
            };

            capture.appendChild(timeline);
            overlay.appendChild(capture);
            stage.appendChild(overlay);

            queueMicrotask(() => {
                const {
                    currentTimeBadge,
                    preview,
                    previewFrame,
                    previewGlow,
                    previewImage,
                    previewTime,
                    progressBuffer,
                    progressHandle,
                    progressHover,
                    progressInput,
                    progressPlayed,
                    progressShell,
                } = timeline.refs;
                currentTimeBadge.textContent = '12:15';
                currentTimeBadge.style.left = '42%';
                progressInput.value = '420';
                progressBuffer.style.width = '71%';
                progressPlayed.style.width = '42%';
                progressHover.dataset.visible = 'true';
                progressHover.style.width = '56%';
                progressHandle.style.left = '42%';
                progressShell.style.width = '100%';

                if (showPreview) {
                    currentTimeBadge.dataset.hidden = 'true';
                    preview.style.left = '42%';
                    preview.dataset.visible = 'true';
                    previewFrame.dataset.hasImage = 'true';
                    previewGlow.style.backgroundImage = `url("${previewImageUrl}")`;
                    previewImage.style.backgroundImage = `url("${previewImageUrl}")`;
                    previewTime.textContent = '16:48';
                } else {
                    currentTimeBadge.dataset.hidden = 'true';
                }

                markReady();
            });
        },
    });
}

const meta = {
    title: 'Video Player/Components/Timeline',
    component: 'spvp-timeline',
    render: () => renderTimelineStory(false),
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(await canvas.findByLabelText('Seek')).toBeInTheDocument();
        await expect(await canvas.findByText('12:15')).toBeInTheDocument();
    },
};

export const WithPreview: Story = {
    render: () => renderTimelineStory(true),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(await canvas.findByText('16:48')).toBeInTheDocument();
    },
};
