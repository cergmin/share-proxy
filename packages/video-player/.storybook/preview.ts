import type { Preview } from '@storybook/web-components-vite';

const preview: Preview = {
    parameters: {
        actions: { argTypesRegex: '^on[A-Z].*' },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        layout: 'fullscreen',
        backgrounds: {
            default: 'player',
            values: [
                { name: 'player', value: '#020617' },
            ],
        },
    },
};

export default preview;
