import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { VideoPlayerOptions } from './index';
import { defaultStoryOptions } from './storybook/fixtures';
import { renderPlayerStory } from './storybook/renderPlayerStory';
import { renderVisualPlayerStory } from './storybook/renderVisualPlayerStory';

type StoryArgs = VideoPlayerOptions;

function renderFullscreenPlayerStory(args: VideoPlayerOptions): HTMLElement {
    const frame = renderPlayerStory({ player: args });
    frame.style.position = 'absolute';
    frame.style.inset = '0';
    frame.style.height = '100%';
    frame.style.minHeight = '100%';
    frame.style.maxHeight = '100%';
    frame.style.display = 'block';

    const mountRoot = frame.firstElementChild;
    if (mountRoot instanceof HTMLElement) {
        mountRoot.style.height = '100%';
        mountRoot.style.minHeight = '100%';
        mountRoot.style.maxHeight = '100%';
    }

    return frame;
}

const meta = {
    title: 'Video Player/Player',
    component: 'share-proxy-video-player',
    argTypes: {
        ambient: {
            control: 'inline-radio',
            options: ['off', 'bright', 'spatial'],
        },
    },
    render: (args) => renderPlayerStory({ player: args }),
} satisfies Meta<StoryArgs>;

export default meta;

type Story = StoryObj<StoryArgs>;

export const Default: Story = {
    args: {
        ...defaultStoryOptions,
    },
    render: (args) => renderFullscreenPlayerStory(args),
    parameters: {
        layout: 'fullscreen',
    },
};

export const VisualDefaultChrome: Story = {
    name: 'Visual Default Chrome',
    render: () => renderVisualPlayerStory('default-chrome'),
};

export const VisualSettingsRoot: Story = {
    name: 'Visual Settings Root',
    render: () => renderVisualPlayerStory('settings-root'),
};

export const VisualSettingsRootPopup: Story = {
    name: 'Visual Settings Root Popup',
    render: () => renderVisualPlayerStory('settings-root', 'popup'),
};

export const VisualPlaybackSpeed: Story = {
    name: 'Visual Playback Speed',
    render: () => renderVisualPlayerStory('speed-menu'),
};

export const VisualPlaybackSpeedPopup: Story = {
    name: 'Visual Playback Speed Popup',
    render: () => renderVisualPlayerStory('speed-menu', 'popup'),
};

export const VisualAmbientSettings: Story = {
    name: 'Visual Ambient Settings',
    render: () => renderVisualPlayerStory('ambient-menu'),
};

export const VisualAmbientSettingsPopup: Story = {
    name: 'Visual Ambient Settings Popup',
    render: () => renderVisualPlayerStory('ambient-menu', 'popup'),
};

export const SettingsOpen: Story = {
    args: {
        ...defaultStoryOptions,
        title: 'Player With Settings',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByRole('button', { name: 'Settings' }));
        await expect(await canvas.findByRole('button', { name: 'Open playback speed settings' })).toBeInTheDocument();
    },
};

export const PlaybackSpeed: Story = {
    args: {
        ...defaultStoryOptions,
        title: 'Playback Speed Menu',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByRole('button', { name: 'Settings' }));
        await userEvent.click(await canvas.findByRole('button', { name: 'Open playback speed settings' }));
        await expect(await canvas.findByRole('button', { name: 'Set speed to 2x' })).toBeInTheDocument();
    },
};

export const Ambient: Story = {
    args: {
        ...defaultStoryOptions,
        title: 'Ambient Settings',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(await canvas.findByRole('button', { name: 'Settings' }));
        await userEvent.click(await canvas.findByRole('button', { name: 'Open ambient settings' }));
        await expect(await canvas.findByText('Spatial')).toBeInTheDocument();
        await expect(await canvas.findByText('Blur')).toBeInTheDocument();
    },
};
