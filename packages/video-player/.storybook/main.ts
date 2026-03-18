import type { StorybookConfig } from '@storybook/web-components-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(js|jsx|mjs|ts)'],
    addons: ['@storybook/addon-links'],
    framework: {
        name: '@storybook/web-components-vite',
        options: {},
    },
};

export default config;
