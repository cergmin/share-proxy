import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { VideoPlayerOptions } from '@share-proxy/video-player';
import { escapeHtml } from './http.js';
import type { ResolvedLink } from './proxy-types.js';

const VIDEO_PLAYER_MODULE_PATH = fileURLToPath(new URL('../../../packages/video-player/dist/index.js', import.meta.url));
const videoPlayerModuleSourcePromise = readFile(VIDEO_PLAYER_MODULE_PATH, 'utf8');

let renderVideoPlayerDocumentPromise: Promise<(options: VideoPlayerOptions, moduleUrl?: string) => string> | undefined;

function ensureServerSideVideoPlayerGlobals(): void {
    const runtime = globalThis as typeof globalThis & { HTMLElement?: unknown };
    if (runtime.HTMLElement === undefined) {
        runtime.HTMLElement = class HTMLElementShim { } as unknown as typeof HTMLElement;
    }
}

async function getRenderVideoPlayerDocument(): Promise<(options: VideoPlayerOptions, moduleUrl?: string) => string> {
    if (!renderVideoPlayerDocumentPromise) {
        ensureServerSideVideoPlayerGlobals();
        renderVideoPlayerDocumentPromise = import('@share-proxy/video-player')
            .then((module) => module.renderVideoPlayerDocument);
    }

    return renderVideoPlayerDocumentPromise;
}

function renderHtmlDocument(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(250, 204, 21, 0.15), transparent 30%),
        radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.18), transparent 30%),
        #0f172a;
      color: #e2e8f0;
    }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: transparent;
    }
    .shell {
      width: min(960px, 100%);
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 24px;
      padding: 28px;
      box-shadow: 0 30px 80px rgba(2, 6, 23, 0.45);
      backdrop-filter: blur(20px);
    }
    h1 {
      margin: 0 0 10px;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1;
    }
    p {
      margin: 0;
      color: #cbd5e1;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 420px;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, 0.24);
      background: rgba(15, 23, 42, 0.92);
      color: #e2e8f0;
      font-size: 1rem;
    }
    button {
      width: fit-content;
      padding: 12px 18px;
      border: none;
      border-radius: 999px;
      background: linear-gradient(135deg, #38bdf8, #f59e0b);
      color: #0f172a;
      font-weight: 700;
      cursor: pointer;
    }
    .error {
      color: #fca5a5;
    }
    .meta {
      font-size: 0.9rem;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <main class="shell">${body}</main>
</body>
</html>`;
}

export async function getVideoPlayerModuleSource(): Promise<string> {
    return videoPlayerModuleSourcePromise;
}

export async function renderViewerPage(resolvedLink: ResolvedLink, persistenceKey: string): Promise<string> {
    const renderVideoPlayerDocument = await getRenderVideoPlayerDocument();
    return renderVideoPlayerDocument({
        manifestUrl: resolvedLink.source.type === 'jellyfin' ? `/${resolvedLink.link.id}/manifest.m3u8` : undefined,
        persistenceKey,
        previewTracksUrl: resolvedLink.source.type === 'jellyfin' ? `/${resolvedLink.link.id}/preview-tracks.json` : undefined,
        streamUrl: `/${resolvedLink.link.id}/stream`,
        title: resolvedLink.resource.name,
    });
}

export function renderPasswordPage(resolvedLink: ResolvedLink, error?: string): string {
    return renderHtmlDocument(
        `${resolvedLink.resource.name} - Unlock`,
        `<section class="panel">
            <p class="meta">Protected viewer</p>
            <h1>${escapeHtml(resolvedLink.resource.name)}</h1>
            <p>Enter one of the allowed passwords to watch this video.</p>
            ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
            <form method="post" action="/${resolvedLink.link.id}/unlock">
                <input type="password" name="password" placeholder="Password" autocomplete="current-password" required />
                <button type="submit">Unlock</button>
            </form>
        </section>`,
    );
}

export function renderMessagePage(title: string, message: string): string {
    return renderHtmlDocument(
        title,
        `<section class="panel">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(message)}</p>
        </section>`,
    );
}
