import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { expect, within } from 'storybook/test';
import { createIcon } from './icons';

const ICONS = [
    { name: 'play', label: 'play' },
    { name: 'pause', label: 'pause' },
    { name: 'backward', label: 'backward' },
    { name: 'forward', label: 'forward' },
    { name: 'volume-off', label: 'volume-off' },
    { name: 'volume-small', label: 'volume-small' },
    { name: 'volume-big', label: 'volume-big' },
    { name: 'volume-very-loud', label: 'volume-very-loud' },
    { name: 'settings', label: 'settings' },
    { name: 'menu-back', label: 'menu-back' },
    { name: 'menu-forward', label: 'menu-forward' },
    { name: 'pip-enter', label: 'pip-enter' },
    { name: 'pip-exit', label: 'pip-exit' },
    { name: 'fullscreen-enter', label: 'fullscreen-enter' },
    { name: 'fullscreen-exit', label: 'fullscreen-exit' },
] as const;

const meta = {
    title: 'Video Player/Foundations/Icons',
    render: () => {
        const frame = document.createElement('div');
        frame.dataset.storyReady = 'false';
        frame.dataset.storyRoot = 'true';
        frame.style.width = '100%';
        frame.style.height = '720px';
        frame.style.boxSizing = 'border-box';
        frame.style.padding = '32px';
        frame.style.overflow = 'auto';
        frame.style.background = '#f8fafc';

        const panel = document.createElement('div');
        panel.dataset.visualCapture = 'icons';
        panel.style.width = 'min(1120px, 100%)';
        panel.style.margin = '0 auto';
        panel.style.display = 'grid';
        panel.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))';
        panel.style.gap = '16px';

        for (const icon of ICONS) {
            const card = document.createElement('div');
            card.style.display = 'grid';
            card.style.placeItems = 'center';
            card.style.gap = '10px';
            card.style.padding = '18px 14px';
            card.style.border = '1px solid rgba(148, 163, 184, 0.28)';
            card.style.borderRadius = '18px';
            card.style.background = '#ffffff';
            card.style.boxShadow = '0 12px 30px rgba(15, 23, 42, 0.08)';

            const glyph = document.createElement('div');
            glyph.innerHTML = createIcon(icon.name);
            glyph.style.width = '32px';
            glyph.style.height = '32px';
            glyph.style.display = 'grid';
            glyph.style.placeItems = 'center';
            glyph.style.color = '#0f172a';
            glyph.querySelector('svg')?.setAttribute('width', '28');
            glyph.querySelector('svg')?.setAttribute('height', '28');

            const label = document.createElement('div');
            label.textContent = icon.label;
            label.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace';
            label.style.fontSize = '12px';
            label.style.lineHeight = '16px';
            label.style.color = '#334155';

            card.appendChild(glyph);
            card.appendChild(label);
            panel.appendChild(card);
        }

        frame.appendChild(panel);
        queueMicrotask(() => {
            frame.dataset.storyReady = 'true';
        });
        return frame;
    },
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(await canvas.findByText('volume-off')).toBeInTheDocument();
        await expect(await canvas.findByText('fullscreen-exit')).toBeInTheDocument();
    },
};
