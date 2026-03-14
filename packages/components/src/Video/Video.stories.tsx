import type { Meta, StoryObj } from '@storybook/react';
import { Video } from './Video';

const muxDemoManifestUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

const previewTileSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ea580c"/>
      <stop offset="50%" stop-color="#fb7185"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#g)"/>
  <circle cx="92" cy="84" r="56" fill="rgba(255,255,255,0.28)"/>
  <circle cx="228" cy="102" r="72" fill="rgba(0,0,0,0.18)"/>
</svg>
`);
const previewTracksUrl = `data:application/json,${encodeURIComponent(JSON.stringify({
    entries: [{
        end: 120,
        layoutColumns: 1,
        layoutRows: 1,
        start: 0,
        tileHeight: 180,
        tileWidth: 320,
        tileX: 0,
        tileY: 0,
        url: `data:image/svg+xml;utf8,${previewTileSvg}`,
    }],
}))}`;

const meta = {
    title: 'Components/Video',
    component: Video,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (
            <div style={{ width: '100%', height: '100vh', background: '#020617' }}>
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof Video>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        manifestUrl: muxDemoManifestUrl,
        title: 'Proxy Viewer Demo',
        streamUrl: muxDemoManifestUrl,
    },
};

export const AmbientOn: Story = {
    args: {
        ...Default.args,
        previewTracksUrl,
        title: 'Ambient Bright',
    },
};

export const AmbientBright: Story = {
    args: {
        ...Default.args,
        ambient: 'bright',
        title: 'Ambient Bright Explicit',
    },
};

export const AmbientOff: Story = {
    args: {
        ...Default.args,
        ambient: 'off',
        title: 'Ambient Off',
    },
};

export const AmbientNoPreview: Story = {
    args: {
        ...Default.args,
        title: 'Ambient No Preview',
    },
};
