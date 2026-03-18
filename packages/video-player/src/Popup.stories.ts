import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { expect, within } from 'storybook/test';
import { renderStandaloneStory } from './storybook/renderStandaloneStory';

const meta = {
    title: 'Video Player/Components/Popup',
    component: 'spvp-popup',
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

            const popup = document.createElement('spvp-popup');
            popup.style.position = 'relative';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';
            popup.dataset.visualCapture = 'popup';

            capture.appendChild(popup);
            stage.appendChild(capture);

            queueMicrotask(() => {
                const popupElement = popup as unknown as {
                    list: HTMLElement;
                    setHeaderState: (title: string, showBack: boolean) => void;
                };
                popup.hidden = false;
                popup.dataset.open = 'true';
                popupElement.setHeaderState('Abstract Popup', true);
                popupElement.list.innerHTML = `
                  <button class="spvp-menu-button" type="button">
                    <span class="spvp-menu-copy">
                      <span class="spvp-menu-label">First action</span>
                      <span class="spvp-menu-value">Secondary text</span>
                    </span>
                  </button>
                  <button class="spvp-menu-button" type="button">
                    <span class="spvp-menu-copy">
                      <span class="spvp-menu-label">Second action</span>
                      <span class="spvp-menu-value">More content</span>
                    </span>
                  </button>
                `;
                markReady();
            });
        },
    }),
} satisfies Meta;

export default meta;

type Story = StoryObj;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(await canvas.findByRole('button', { name: 'Back' })).toBeInTheDocument();
        await expect(await canvas.findByText('First action')).toBeInTheDocument();
    },
};
