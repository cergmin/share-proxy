import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasUrlProtocol, JellyfinAdapter, normalizeJellyfinUrl, resolveJellyfinConfig } from '@share-proxy/adapters';
import { accessRules, getDb, links, resources, sources } from '@share-proxy/db';
import {
    createSealedProxyToken,
    createSignedLinkAccessToken,
    getLinkAccessCookieName,
    openSealedProxyToken,
    parseBasicAuthHeader,
    verifyPasswordRule,
    verifySignedLinkAccessToken,
} from '@share-proxy/core';
import type { PreviewTrackEntry, VideoPlayerOptions } from '@share-proxy/video-player';
import { eq } from 'drizzle-orm';

type LinkRow = typeof links.$inferSelect;
type ResourceRow = typeof resources.$inferSelect;
type SourceRow = typeof sources.$inferSelect;
type AccessRuleRow = typeof accessRules.$inferSelect;

interface ResolvedLink {
    accessRules: AccessRuleRow[];
    link: LinkRow;
    resource: ResourceRow;
    source: SourceRow;
}

interface JellyfinSourceConfig {
    apiKey: string;
    url: string;
    userId?: string;
}

interface JellyfinPlaybackContext {
    mediaSourceId?: string;
    userId?: string;
}

interface MediaProxyTokenData {
    target: string;
}

interface ParsedTrickplayEntry extends PreviewTrackEntry {
    sheetIndex: number;
    upstreamUrl: string;
}

interface JellyfinVariantPreset {
    id: string;
    label: string;
    maxBitrate: number;
    maxWidth?: number;
}

interface JellyfinManifestVariant {
    label: string;
    infoLine: string;
    upstreamUrl: string;
}

const ACCESS_COOKIE_TTL_SECONDS = 60 * 60 * 6;
const MEDIA_PROXY_TOKEN_TTL_MS = 10 * 60 * 1000;
const TRICKPLAY_CACHE_TTL_MS = 60 * 1000;
const VIDEO_PLAYER_MODULE_PATH = fileURLToPath(new URL('../../../packages/video-player/dist/index.js', import.meta.url));
const videoPlayerModuleSourcePromise = readFile(VIDEO_PLAYER_MODULE_PATH, 'utf8');
const JELLYFIN_HLS_MAX_BITRATE = 20_000_000;
const JELLYFIN_TRICKPLAY_WIDTH = 320;
const JELLYFIN_HLS_VARIANT_PRESETS: JellyfinVariantPreset[] = [
    { id: '6mbps', label: '6 Mbps', maxBitrate: 6_000_000 },
    { id: '4mbps', label: '4 Mbps', maxBitrate: 4_000_000, maxWidth: 1920 },
    { id: '3mbps', label: '3 Mbps', maxBitrate: 3_000_000, maxWidth: 1920 },
    { id: '1_5mbps', label: '1.5 Mbps', maxBitrate: 1_500_000, maxWidth: 1280 },
    { id: '720kbps', label: '720 kbps', maxBitrate: 720_000, maxWidth: 854 },
    { id: '420kbps', label: '420 kbps', maxBitrate: 420_000, maxWidth: 640 },
];

type TrickplayCacheEntry = {
    entries?: ParsedTrickplayEntry[];
    expiresAt: number;
    pending?: Promise<ParsedTrickplayEntry[]>;
};

const trickplayEntriesCache = new Map<string, TrickplayCacheEntry>();
let renderVideoPlayerDocumentPromise: Promise<(options: VideoPlayerOptions, moduleUrl?: string) => string> | undefined;

function ensureServerSideVideoPlayerGlobals(): void {
    const runtime = globalThis as typeof globalThis & { HTMLElement?: unknown };
    if (runtime.HTMLElement === undefined) {
        runtime.HTMLElement = class HTMLElementShim { };
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

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseCookies(header: string | undefined): Record<string, string> {
    if (!header) {
        return {};
    }

    return header.split(';').reduce<Record<string, string>>((result, chunk) => {
        const separatorIndex = chunk.indexOf('=');
        if (separatorIndex === -1) {
            return result;
        }

        const key = chunk.slice(0, separatorIndex).trim();
        const value = chunk.slice(separatorIndex + 1).trim();
        try {
            result[key] = decodeURIComponent(value);
        } catch {
            // Ignore malformed cookie values and continue parsing the rest.
        }
        return result;
    }, {});
}

function isLinkUnavailable(link: LinkRow, now = Date.now()): boolean {
    return !link.active || (link.expiresAt ? link.expiresAt.getTime() <= now : false);
}

function hasPublicAccess(ruleRows: AccessRuleRow[]): boolean {
    return ruleRows.some((rule) => rule.type === 'public');
}

function getPasswordRules(ruleRows: AccessRuleRow[]): AccessRuleRow[] {
    return ruleRows.filter((rule) => rule.type === 'password');
}

function getSecret(): string {
    return process.env.SECRET ?? 'changeme';
}

function buildAccessCookie(linkId: string, value: string): string {
    const cookieParts = [
        `${getLinkAccessCookieName(linkId)}=${encodeURIComponent(value)}`,
        `Path=/${linkId}`,
        `Max-Age=${ACCESS_COOKIE_TTL_SECONDS}`,
        'HttpOnly',
        'SameSite=Lax',
    ];

    if ((process.env.PROXY_ORIGIN ?? '').startsWith('https://')) {
        cookieParts.push('Secure');
    }

    return cookieParts.join('; ');
}

function buildClearedAccessCookie(linkId: string): string {
    return [
        `${getLinkAccessCookieName(linkId)}=`,
        `Path=/${linkId}`,
        'Max-Age=0',
        'HttpOnly',
        'SameSite=Lax',
    ].join('; ');
}

function parseRangeHeader(header: string | undefined): { end?: number; start: number } | undefined {
    if (!header) {
        return undefined;
    }

    const match = /^bytes=(\d+)-(\d*)$/i.exec(header.trim());
    if (!match) {
        return undefined;
    }

    return {
        start: Number(match[1]),
        end: match[2] ? Number(match[2]) : undefined,
    };
}

function parseJellyfinSourceConfig(source: SourceRow): JellyfinSourceConfig {
    const rawJellyfinConfig = JSON.parse(source.config) as JellyfinSourceConfig;
    return {
        ...rawJellyfinConfig,
        url: normalizeJellyfinUrl(rawJellyfinConfig.url),
    };
}

async function resolveJellyfinConfigForSource(source: SourceRow): Promise<JellyfinSourceConfig> {
    const rawConfig = parseJellyfinSourceConfig(source);
    return hasUrlProtocol(rawConfig.url) ? rawConfig : await resolveJellyfinConfig(rawConfig);
}

function buildJellyfinUrl(config: JellyfinSourceConfig, pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
    }

    return `${config.url}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

async function fetchJellyfinResponse(
    config: JellyfinSourceConfig,
    pathOrUrl: string,
    options: RequestInit = {},
): Promise<Response> {
    const headers = new Headers(options.headers ?? {});
    if (!headers.has('X-Emby-Token')) {
        headers.set('X-Emby-Token', config.apiKey);
    }

    return fetch(buildJellyfinUrl(config, pathOrUrl), {
        ...options,
        headers,
    });
}

async function fetchJellyfinJson<T>(
    config: JellyfinSourceConfig,
    pathOrUrl: string,
    options: RequestInit = {},
): Promise<T> {
    const response = await fetchJellyfinResponse(config, pathOrUrl, {
        ...options,
        headers: {
            Accept: 'application/json',
            ...(options.headers ?? {}),
        },
    });

    if (!response.ok) {
        throw new Error(`Jellyfin API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
}

async function resolveJellyfinPlaybackContext(
    config: JellyfinSourceConfig,
    fileId: string,
): Promise<JellyfinPlaybackContext> {
    const userId = config.userId ?? await fetchJellyfinJson<Array<{ Id: string; Policy?: { IsAdministrator?: boolean } }>>(config, '/Users')
        .then((users) => users.find((user) => user.Policy?.IsAdministrator)?.Id ?? users[0]?.Id)
        .catch(() => undefined);

    if (!userId) {
        return {};
    }

    const item = await fetchJellyfinJson<{ MediaSources?: Array<{ Id?: string }> }>(
        config,
        `/Users/${userId}/Items/${fileId}`,
    ).catch(() => undefined);

    return {
        userId,
        mediaSourceId: item?.MediaSources?.[0]?.Id,
    };
}

function buildJellyfinAdaptiveManifestUrl(
    config: JellyfinSourceConfig,
    fileId: string,
    context: JellyfinPlaybackContext,
    options: { maxBitrate?: number; maxWidth?: number } = {},
): string {
    const params = new URLSearchParams({
        api_key: config.apiKey,
        deviceId: 'share-proxy',
        MaxStreamingBitrate: String(options.maxBitrate ?? JELLYFIN_HLS_MAX_BITRATE),
        TranscodingMaxAudioChannels: '2',
        EnableSubtitlesInManifest: 'false',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
    });

    if (context.mediaSourceId) {
        params.set('MediaSourceId', context.mediaSourceId);
    }

    if (context.userId) {
        params.set('UserId', context.userId);
    }

    if (options.maxWidth) {
        params.set('MaxWidth', String(options.maxWidth));
    }

    return buildJellyfinUrl(config, `/Videos/${fileId}/master.m3u8?${params.toString()}`);
}

function buildJellyfinTrickplayManifestUrl(
    config: JellyfinSourceConfig,
    fileId: string,
    context: JellyfinPlaybackContext,
    width = JELLYFIN_TRICKPLAY_WIDTH,
): string {
    const params = new URLSearchParams({
        api_key: config.apiKey,
    });

    if (context.mediaSourceId) {
        params.set('MediaSourceId', context.mediaSourceId);
    }

    return buildJellyfinUrl(config, `/Videos/${fileId}/Trickplay/${width}/tiles.m3u8?${params.toString()}`);
}

function buildMediaProxyUrl(linkId: string, target: string): string {
    const token = createSealedProxyToken<MediaProxyTokenData>({
        linkId,
        purpose: 'media',
        exp: Date.now() + MEDIA_PROXY_TOKEN_TTL_MS,
        data: { target },
    }, getSecret());

    return `/${linkId}/media/${token}`;
}

function rewriteManifestBody(manifest: string, upstreamUrl: string, linkId: string): string {
    return manifest
        .split('\n')
        .map((line) => {
            if (!line) {
                return line;
            }

            if (line.startsWith('#')) {
                return line.replace(/URI="([^"]+)"/g, (_, uri: string) => {
                    const resolvedUrl = new URL(uri, upstreamUrl).toString();
                    return `URI="${buildMediaProxyUrl(linkId, resolvedUrl)}"`;
                });
            }

            const resolvedUrl = new URL(line, upstreamUrl).toString();
            return buildMediaProxyUrl(linkId, resolvedUrl);
        })
        .join('\n');
}

function extractMasterManifestVariants(manifest: string, upstreamUrl: string): JellyfinManifestVariant[] {
    const lines = manifest.split('\n').map((line) => line.trim());
    const variants: JellyfinManifestVariant[] = [];
    let pendingInfoLine: string | null = null;

    for (const line of lines) {
        if (!line) {
            continue;
        }

        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            pendingInfoLine = line;
            continue;
        }

        if (line.startsWith('#')) {
            continue;
        }

        if (!pendingInfoLine) {
            continue;
        }

        variants.push({
            label: '',
            infoLine: pendingInfoLine,
            upstreamUrl: new URL(line, upstreamUrl).toString(),
        });
        pendingInfoLine = null;
    }

    return variants;
}

function replaceOrAppendAttribute(infoLine: string, key: string, value: string): string {
    const attributePattern = new RegExp(`(^#EXT-X-STREAM-INF:|,)${key}=[^,]*`);

    if (attributePattern.test(infoLine)) {
        return infoLine.replace(attributePattern, (match, prefix: string) => `${prefix}${key}=${value}`);
    }

    return `${infoLine},${key}=${value}`;
}

function buildSyntheticVariantInfoLine(
    upstreamInfoLine: string,
    preset: JellyfinVariantPreset,
): string {
    let infoLine = replaceOrAppendAttribute(upstreamInfoLine, 'BANDWIDTH', String(preset.maxBitrate));
    infoLine = replaceOrAppendAttribute(infoLine, 'AVERAGE-BANDWIDTH', String(preset.maxBitrate));
    return infoLine;
}

async function buildJellyfinAdaptiveMasterManifest(
    config: JellyfinSourceConfig,
    linkId: string,
    fileId: string,
    context: JellyfinPlaybackContext,
): Promise<string> {
    const variantResults = await Promise.all(JELLYFIN_HLS_VARIANT_PRESETS.map(async (preset) => {
        try {
            const upstreamUrl = buildJellyfinAdaptiveManifestUrl(config, fileId, context, preset);
            const response = await fetchJellyfinResponse(config, upstreamUrl, {
                headers: {
                    Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream',
                },
            });

            if (!response.ok) {
                return [];
            }

            const manifest = await response.text();
            return extractMasterManifestVariants(manifest, upstreamUrl).map((variant) => ({
                ...variant,
                label: preset.label,
                infoLine: buildSyntheticVariantInfoLine(variant.infoLine, preset),
            }));
        } catch {
            return [];
        }
    }));

    const variants = variantResults.flat();

    if (variants.length === 0) {
        throw new Error('Adaptive manifest error: no variant streams available');
    }

    return `#EXTM3U\n${variants
        .flatMap((variant) => [variant.infoLine, buildMediaProxyUrl(linkId, variant.upstreamUrl)])
        .join('\n')}\n`;
}

function buildPreviewImageUrl(linkId: string, sheetIndex: number): string {
    return `/${linkId}/preview/${sheetIndex}.jpg`;
}

function parseTrickplayManifest(manifest: string, upstreamUrl: string): ParsedTrickplayEntry[] {
    const entries: ParsedTrickplayEntry[] = [];
    const lines = manifest.split('\n');
    let currentSegmentDuration = 0;
    let currentStart = 0;
    let currentTileDuration = 0;
    let currentTileWidth = 0;
    let currentTileHeight = 0;
    let currentLayoutColumns = 1;
    let currentLayoutRows = 1;
    let sheetIndex = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        if (line.startsWith('#EXTINF:')) {
            currentSegmentDuration = Number(line.slice('#EXTINF:'.length).split(',')[0] ?? 0);
            continue;
        }

        if (line.startsWith('#EXT-X-TILES:')) {
            const attributes = Object.fromEntries(
                line
                    .slice('#EXT-X-TILES:'.length)
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .map((part) => {
                        const separatorIndex = part.indexOf('=');
                        if (separatorIndex === -1) {
                            return [part, ''];
                        }

                        return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)];
                    }),
            );

            const resolution = String(attributes.RESOLUTION ?? '').split('x');
            const layout = String(attributes.LAYOUT ?? '').split('x');
            currentTileWidth = Number(resolution[0] ?? 0);
            currentTileHeight = Number(resolution[1] ?? 0);
            currentLayoutColumns = Number(layout[0] ?? 1) || 1;
            currentLayoutRows = Number(layout[1] ?? 1) || 1;
            currentTileDuration = Number(attributes.DURATION ?? 0);
            continue;
        }

        if (line.startsWith('#')) {
            continue;
        }

        const resolvedUrl = new URL(line, upstreamUrl).toString();
        const tileDuration = currentTileDuration > 0 ? currentTileDuration : currentSegmentDuration;
        const maxTiles = currentLayoutColumns * currentLayoutRows;
        const tileCount = tileDuration > 0
            ? Math.min(maxTiles, Math.max(1, Math.ceil(currentSegmentDuration / tileDuration)))
            : 1;

        for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
            const start = currentStart + (tileIndex * tileDuration);
            const end = tileDuration > 0
                ? Math.min(currentStart + currentSegmentDuration, start + tileDuration)
                : currentStart + currentSegmentDuration;

            if (end <= start) {
                continue;
            }

            entries.push({
                start,
                end,
                url: resolvedUrl,
                tileX: tileIndex % currentLayoutColumns,
                tileY: Math.floor(tileIndex / currentLayoutColumns),
                layoutColumns: currentLayoutColumns,
                layoutRows: currentLayoutRows,
                tileWidth: currentTileWidth || undefined,
                tileHeight: currentTileHeight || undefined,
                sheetIndex,
                upstreamUrl: resolvedUrl,
            });
        }

        sheetIndex += 1;
        currentStart += currentSegmentDuration;
        currentSegmentDuration = 0;
        currentTileDuration = 0;
        currentTileWidth = 0;
        currentTileHeight = 0;
        currentLayoutColumns = 1;
        currentLayoutRows = 1;
    }

    return entries;
}

function isAllowedJellyfinTarget(target: string, config: JellyfinSourceConfig): boolean {
    try {
        const targetUrl = new URL(target);
        const sourceUrl = new URL(config.url);
        return targetUrl.origin === sourceUrl.origin;
    } catch {
        return false;
    }
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
    .stack {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .video {
      width: 100%;
      border-radius: 18px;
      background: #020617;
      border: 1px solid rgba(148, 163, 184, 0.18);
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

async function renderViewerPage(resolvedLink: ResolvedLink, persistenceKey: string): Promise<string> {
    const renderVideoPlayerDocument = await getRenderVideoPlayerDocument();
    return renderVideoPlayerDocument({
        manifestUrl: resolvedLink.source.type === 'jellyfin' ? `/${resolvedLink.link.id}/manifest.m3u8` : undefined,
        persistenceKey,
        previewTracksUrl: resolvedLink.source.type === 'jellyfin' ? `/${resolvedLink.link.id}/preview-tracks.json` : undefined,
        streamUrl: `/${resolvedLink.link.id}/stream`,
        title: resolvedLink.resource.name,
    });
}

function renderPasswordPage(resolvedLink: ResolvedLink, error?: string): string {
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

function renderMessagePage(title: string, message: string): string {
    return renderHtmlDocument(
        title,
        `<section class="panel">
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(message)}</p>
        </section>`,
    );
}

async function loadJellyfinTrickplayEntries(
    source: SourceRow,
    externalId: string,
): Promise<ParsedTrickplayEntry[]> {
    const jellyfinConfig = await resolveJellyfinConfigForSource(source);
    const playbackContext = await resolveJellyfinPlaybackContext(jellyfinConfig, externalId);
    const upstreamUrl = buildJellyfinTrickplayManifestUrl(
        jellyfinConfig,
        externalId,
        playbackContext,
    );
    const response = await fetchJellyfinResponse(jellyfinConfig, upstreamUrl, {
        headers: {
            Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL',
        },
    });

    if (!response.ok) {
        return [];
    }

    const manifest = await response.text();
    return parseTrickplayManifest(manifest, upstreamUrl)
        .filter((entry) => isAllowedJellyfinTarget(entry.upstreamUrl, jellyfinConfig));
}

function getTrickplayCacheKey(source: SourceRow, externalId: string): string {
    const updatedAt = source.updatedAt instanceof Date
        ? source.updatedAt.getTime()
        : new Date(source.updatedAt).getTime();
    return `${source.id}:${updatedAt}:${externalId}`;
}

async function getCachedJellyfinTrickplayEntries(
    source: SourceRow,
    externalId: string,
): Promise<ParsedTrickplayEntry[]> {
    const cacheKey = getTrickplayCacheKey(source, externalId);
    const now = Date.now();
    const cached = trickplayEntriesCache.get(cacheKey);

    if (cached?.entries && cached.expiresAt > now) {
        return cached.entries;
    }

    if (cached?.pending) {
        return cached.pending;
    }

    const pending = loadJellyfinTrickplayEntries(source, externalId)
        .then((entries) => {
            trickplayEntriesCache.set(cacheKey, {
                entries,
                expiresAt: Date.now() + TRICKPLAY_CACHE_TTL_MS,
            });
            return entries;
        })
        .catch((error) => {
            trickplayEntriesCache.delete(cacheKey);
            throw error;
        });

    trickplayEntriesCache.set(cacheKey, {
        entries: cached?.entries,
        expiresAt: cached?.expiresAt ?? 0,
        pending,
    });

    return pending;
}

async function resolveLink(linkId: string): Promise<ResolvedLink | null> {
    const db = await getDb();
    let resolved;

    try {
        [resolved] = await db.select({
            link: links,
            resource: resources,
            source: sources,
        })
            .from(links)
            .innerJoin(resources, eq(links.resourceId, resources.id))
            .innerJoin(sources, eq(resources.sourceId, sources.id))
            .where(eq(links.id, linkId))
            .limit(1);
    } catch (error: unknown) {
        if (
            typeof error === 'object'
            && error !== null
            && 'code' in error
            && error.code === '22P02'
        ) {
            return null;
        }

        throw error;
    }

    if (!resolved) {
        return null;
    }

    const ruleRows = await db.select().from(accessRules).where(eq(accessRules.linkId, linkId));

    return {
        link: resolved.link,
        resource: resolved.resource,
        source: resolved.source,
        accessRules: ruleRows,
    };
}

function hasValidAccessCookie(request: FastifyRequest, linkId: string): boolean {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[getLinkAccessCookieName(linkId)];

    if (!token) {
        return false;
    }

    return verifySignedLinkAccessToken(token, getSecret(), linkId);
}

async function matchesAnyPassword(password: string, ruleRows: AccessRuleRow[]): Promise<boolean> {
    for (const rule of ruleRows) {
        if (await verifyPasswordRule(password, rule.params)) {
            return true;
        }
    }

    return false;
}

async function authorizeStream(request: FastifyRequest, resolvedLink: ResolvedLink): Promise<boolean> {
    if (hasPublicAccess(resolvedLink.accessRules)) {
        return true;
    }

    if (hasValidAccessCookie(request, resolvedLink.link.id)) {
        return true;
    }

    const passwordRules = getPasswordRules(resolvedLink.accessRules);
    if (passwordRules.length === 0) {
        return false;
    }

    const credentials = parseBasicAuthHeader(request.headers.authorization);
    if (!credentials) {
        return false;
    }

    return matchesAnyPassword(credentials.password, passwordRules);
}

function sendHtml(reply: FastifyReply, html: string, statusCode = 200): FastifyReply {
    return reply.code(statusCode).header('content-type', 'text/html; charset=utf-8').send(html);
}

export async function buildProxyApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
    const app = Fastify({
        logger: options.logger ?? true,
    });

    app.addContentTypeParser(
        'application/x-www-form-urlencoded',
        { parseAs: 'string' },
        (_request, body, done) => {
            done(null, Object.fromEntries(new URLSearchParams(body as string)));
        },
    );

    app.get('/_health', async () => ({ status: 'ok' }));
    app.get('/_video-player.js', async (_request, reply) => {
        reply.header('content-type', 'text/javascript; charset=utf-8');
        return reply.send(await videoPlayerModuleSourcePromise);
    });
    app.get('/favicon.ico', async (request, reply) => reply.code(404).send());

    app.get('/:id/manifest.m3u8', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            reply.header('WWW-Authenticate', 'Basic realm="Share Proxy"');
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(404).send({ error: 'Adaptive manifest unsupported' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        const playbackContext = await resolveJellyfinPlaybackContext(jellyfinConfig, resolvedLink.resource.externalId);
        try {
            const manifest = await buildJellyfinAdaptiveMasterManifest(
                jellyfinConfig,
                id,
                resolvedLink.resource.externalId,
                playbackContext,
            );
            reply.header('content-type', 'application/vnd.apple.mpegurl');
            return reply.send(manifest);
        } catch (error) {
            request.log.error(error);
            return reply.code(502).send({ error: 'Adaptive manifest unavailable' });
        }
    });

    app.get('/:id/media/*', async (request, reply) => {
        const { id } = request.params as { id: string };
        const token = (request.params as { '*': string })['*'];
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            reply.header('WWW-Authenticate', 'Basic realm="Share Proxy"');
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(400).send({ error: 'Invalid media target' });
        }

        const sealedToken = openSealedProxyToken<MediaProxyTokenData>(token, getSecret(), {
            expectedLinkId: id,
            expectedPurpose: 'media',
        });
        const target = sealedToken?.data.target;

        if (!target) {
            return reply.code(400).send({ error: 'Invalid media target' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        if (!isAllowedJellyfinTarget(target, jellyfinConfig)) {
            return reply.code(400).send({ error: 'Invalid upstream target' });
        }

        const response = await fetchJellyfinResponse(jellyfinConfig, target, {
            headers: request.headers.range ? { Range: request.headers.range } : undefined,
        });
        if (!response.ok || !response.body) {
            return reply.code(response.status || 502).send({ error: `Upstream media error: ${response.statusText}` });
        }

        reply.code(response.status);
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        reply.header('content-type', contentType);

        const cacheControl = response.headers.get('cache-control');
        if (cacheControl) {
            reply.header('cache-control', cacheControl);
        }

        if (contentType.includes('mpegurl') || target.includes('.m3u8')) {
            const manifest = await response.text();
            return reply.send(rewriteManifestBody(manifest, target, id));
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            reply.header('content-length', contentLength);
        }

        const acceptRanges = response.headers.get('accept-ranges');
        if (acceptRanges) {
            reply.header('accept-ranges', acceptRanges);
        }

        const contentRange = response.headers.get('content-range');
        if (contentRange) {
            reply.header('content-range', contentRange);
        }

        const { Readable } = await import('node:stream');
        return reply.send(Readable.fromWeb(response.body as never));
    });

    app.get('/:id/preview-tracks.json', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            reply.header('WWW-Authenticate', 'Basic realm="Share Proxy"');
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.send({ entries: [] });
        }

        const entries = await getCachedJellyfinTrickplayEntries(resolvedLink.source, resolvedLink.resource.externalId);
        return reply.send({
            entries: entries.map(({ upstreamUrl, sheetIndex, ...entry }) => ({
                ...entry,
                url: buildPreviewImageUrl(id, sheetIndex),
            })),
        });
    });

    app.get('/:id/preview/:sheetIndex.jpg', async (request, reply) => {
        const { id, sheetIndex: sheetIndexParam } = request.params as { id: string; sheetIndex: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            reply.header('WWW-Authenticate', 'Basic realm="Share Proxy"');
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(404).send({ error: 'Preview unavailable' });
        }

        const sheetIndex = Number(sheetIndexParam);
        if (!Number.isInteger(sheetIndex) || sheetIndex < 0) {
            return reply.code(400).send({ error: 'Invalid preview image' });
        }

        const entries = await getCachedJellyfinTrickplayEntries(resolvedLink.source, resolvedLink.resource.externalId);
        const previewSheet = entries.find((entry) => entry.sheetIndex === sheetIndex);

        if (!previewSheet) {
            return reply.code(404).send({ error: 'Preview unavailable' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        const response = await fetchJellyfinResponse(jellyfinConfig, previewSheet.upstreamUrl);
        if (!response.ok || !response.body) {
            return reply.code(response.status || 502).send({ error: 'Preview unavailable' });
        }

        reply.code(response.status);
        reply.header('content-type', response.headers.get('content-type') ?? 'image/jpeg');
        const cacheControl = response.headers.get('cache-control');
        if (cacheControl) {
            reply.header('cache-control', cacheControl);
        }

        const { Readable } = await import('node:stream');
        return reply.send(Readable.fromWeb(response.body as never));
    });

    app.get('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return sendHtml(reply, renderMessagePage('Link not found', 'This video link does not exist.'), 404);
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return sendHtml(reply, renderMessagePage('Link unavailable', 'This video link is inactive or expired.'), 410);
        }

        if (resolvedLink.accessRules.length === 0) {
            return sendHtml(reply, renderMessagePage('Access denied', 'This link has no access rules and cannot be opened.'), 403);
        }

        if (hasPublicAccess(resolvedLink.accessRules) || hasValidAccessCookie(request, id)) {
            return sendHtml(reply, await renderViewerPage(resolvedLink, id));
        }

        return sendHtml(reply, renderPasswordPage(resolvedLink));
    });

    app.post('/:id/unlock', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return sendHtml(reply, renderMessagePage('Link not found', 'This video link does not exist.'), 404);
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return sendHtml(reply, renderMessagePage('Link unavailable', 'This video link is inactive or expired.'), 410);
        }

        const passwordRules = getPasswordRules(resolvedLink.accessRules);
        if (passwordRules.length === 0) {
            return sendHtml(reply, renderMessagePage('Access denied', 'Password unlock is not configured for this link.'), 403);
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const password = typeof body.password === 'string' ? body.password : '';

        if (!password || !(await matchesAnyPassword(password, passwordRules))) {
            reply.header('set-cookie', buildClearedAccessCookie(id));
            return sendHtml(reply, renderPasswordPage(resolvedLink, 'Incorrect password. Try again.'), 401);
        }

        const token = createSignedLinkAccessToken({
            linkId: id,
            exp: Date.now() + (ACCESS_COOKIE_TTL_SECONDS * 1000),
        }, getSecret());

        reply.header('set-cookie', buildAccessCookie(id, token));
        return reply.redirect(`/${id}`);
    });

    app.get('/:id/stream', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (resolvedLink.accessRules.length === 0) {
            return reply.code(403).send({ error: 'Access denied' });
        }

        const isAuthorized = await authorizeStream(request, resolvedLink);
        if (!isAuthorized) {
            reply.header('WWW-Authenticate', 'Basic realm="Share Proxy"');
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(400).send({ error: 'Unsupported source type' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        const adapter = new JellyfinAdapter(jellyfinConfig);

        const range = parseRangeHeader(request.headers.range);
        const streamResult = await adapter.getFileStream(resolvedLink.resource.externalId, range);

        reply.code(streamResult.statusCode);
        reply.header('Content-Type', streamResult.mimeType);
        reply.header('Accept-Ranges', streamResult.acceptRanges);

        if (streamResult.contentLength > 0) {
            reply.header('Content-Length', String(streamResult.contentLength));
        }

        if (streamResult.contentRange) {
            reply.header('Content-Range', streamResult.contentRange);
        }

        return reply.send(streamResult.stream);
    });

    return app;
}
