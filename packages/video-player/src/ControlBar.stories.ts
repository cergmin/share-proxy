import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { expect, within } from 'storybook/test';
import { renderStandaloneStory } from './storybook/renderStandaloneStory';

const meta = {
    title: 'Video Player/Components/Control Bar',
    component: 'spvp-control-bar',
    render: () => renderStandaloneStory({
        frameHeight: '240px',
        setup: (stage, _root, markReady) => {
            const overlay = document.createElement('div');
            overlay.className = 'spvp-overlay';

            const capture = document.createElement('div');
            capture.dataset.visualCapture = 'control-bar';
            capture.style.width = 'min(1320px, calc(100% - 72px))';
            capture.style.padding = '78px 0 34px';
            capture.style.boxSizing = 'border-box';

            const bar = document.createElement('spvp-control-bar') as HTMLElement & {
                refs: {
                    playButton: HTMLButtonElement;
                    rewindButton: HTMLButtonElement;
                    forwardButton: HTMLButtonElement;
                    muteButton: HTMLButtonElement;
                    settingsButton: HTMLButtonElement;
                    pipButton: HTMLButtonElement;
                    fullscreenButton: HTMLButtonElement;
                    timePrimary: HTMLElement;
                    timeSecondary: HTMLElement;
                    currentTimeBadge: HTMLElement;
                    progressBuffer: HTMLElement;
                    progressHandle: HTMLElement;
                    progressPlayed: HTMLElement;
                };
            };

            capture.appendChild(bar);
            overlay.appendChild(capture);
            stage.appendChild(overlay);

            queueMicrotask(() => {
                const {
                    currentTimeBadge,
                    timePrimary,
                    timeSecondary,
                    progressBuffer,
                    progressHandle,
                    progressPlayed,
                } = bar.refs;
                currentTimeBadge.textContent = '11:06';
                currentTimeBadge.style.left = '18%';
                timePrimary.textContent = '11:06';
                timeSecondary.textContent = ' / 1:06:10';
                progressBuffer.style.width = '44%';
                progressPlayed.style.width = '18%';
                progressHandle.style.left = '18%';
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
        await expect(await canvas.findByRole('button', { name: 'Play' })).toBeInTheDocument();
        await expect(await canvas.findByRole('button', { name: 'Settings' })).toBeInTheDocument();

        const timePrimary = canvasElement.querySelector('.spvp-time-primary');
        const currentTimeBadge = canvasElement.querySelector('.spvp-current-time');

        await expect(timePrimary).toHaveTextContent('11:06');
        await expect(currentTimeBadge).toHaveTextContent('11:06');
    },
};
