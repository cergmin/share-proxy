import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { expect, within } from 'storybook/test';
import { renderStandaloneStory } from './storybook/renderStandaloneStory';

const meta = {
    title: 'Video Player/Components/Settings Popup',
    component: 'spvp-settings-popup',
    render: () => renderStandaloneStory({
        frameHeight: '720px',
        setup: (stage, _root, markReady) => {
            stage.style.display = 'grid';
            stage.style.placeItems = 'center';

            const capture = document.createElement('div');
            capture.style.padding = '32px';
            capture.style.boxSizing = 'border-box';
            capture.style.display = 'inline-grid';
            capture.style.width = 'fit-content';
            capture.style.maxWidth = 'calc(100% - 64px)';

            const popup = document.createElement('spvp-settings-popup');
            popup.style.position = 'relative';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';
            popup.style.maxHeight = 'min(100%, 760px)';
            popup.dataset.visualCapture = 'settings-popup';

            capture.appendChild(popup);
            stage.appendChild(capture);

            queueMicrotask(() => {
                const popupElement = popup as unknown as {
                    list: HTMLElement;
                    setHeaderState: (title: string, showBack: boolean) => void;
                };
                popup.hidden = false;
                popup.dataset.open = 'true';
                popupElement.setHeaderState('Playback speed', true);
                popupElement.list.innerHTML = `
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">0.5x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">0.75x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">1x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">1.25x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">1.5x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">1.75x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">2x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">2.5x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">3x</span><span class="spvp-menu-dot" aria-hidden="true"></span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">3.5x</span></button>
                  <button class="spvp-menu-button" type="button"><span class="spvp-menu-label">4x</span></button>
                `;
                markReady();
            });
        },
    }),
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const TallMenu: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(await canvas.findByRole('button', { name: 'Back' })).toBeInTheDocument();
        await expect(await canvas.findByText('4x')).toBeInTheDocument();
    },
};
