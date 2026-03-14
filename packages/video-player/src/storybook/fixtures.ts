import type { VideoPlayerOptions } from '../index';

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

const visualPosterSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="45%" stop-color="#1f2937"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="orbA" cx="25%" cy="30%" r="45%">
      <stop offset="0%" stop-color="rgba(249,115,22,0.65)"/>
      <stop offset="100%" stop-color="rgba(249,115,22,0)"/>
    </radialGradient>
    <radialGradient id="orbB" cx="72%" cy="68%" r="38%">
      <stop offset="0%" stop-color="rgba(59,130,246,0.42)"/>
      <stop offset="100%" stop-color="rgba(59,130,246,0)"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#orbA)"/>
  <rect width="1600" height="900" fill="url(#orbB)"/>
  <rect x="160" y="110" width="1280" height="720" rx="28" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="248" y="220" width="1104" height="496" rx="20" fill="rgba(255,255,255,0.04)"/>
  <circle cx="430" cy="360" r="84" fill="rgba(255,255,255,0.08)"/>
  <circle cx="1190" cy="310" r="110" fill="rgba(255,255,255,0.05)"/>
  <rect x="348" y="600" width="904" height="18" rx="9" fill="rgba(255,255,255,0.08)"/>
  <rect x="348" y="600" width="356" height="18" rx="9" fill="#f97316"/>
</svg>
`);

export const previewTracksUrl = `data:application/json,${encodeURIComponent(JSON.stringify({
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

export const visualPosterUrl = `data:image/svg+xml;utf8,${visualPosterSvg}`;

export const defaultStoryOptions: VideoPlayerOptions = {
    ambient: 'bright',
    ambientBlendWindowSeconds: 10,
    ambientBlurPx: 92,
    autoPlay: false,
    embed: false,
    fullViewport: true,
    manifestUrl: muxDemoManifestUrl,
    persistenceKey: 'storybook-player',
    posterUrl: visualPosterUrl,
    previewTracksUrl,
    streamUrl: muxDemoManifestUrl,
    title: 'Storybook Player Demo',
};
