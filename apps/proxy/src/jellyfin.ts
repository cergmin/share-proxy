import { hasUrlProtocol, normalizeJellyfinUrl, resolveJellyfinConfig } from '@share-proxy/adapters';
import { createSealedProxyToken } from '@share-proxy/core';
import type {
    JellyfinManifestVariant,
    JellyfinPlaybackContext,
    JellyfinSourceConfig,
    MediaProxyTokenData,
    ParsedTrickplayEntry,
    SourceRow,
} from './proxy-types.js';

const MEDIA_PROXY_TOKEN_TTL_MS = 10 * 60 * 1000;
const TRICKPLAY_CACHE_TTL_MS = 60 * 1000;
const JELLYFIN_HLS_MAX_BITRATE = 20_000_000;
const JELLYFIN_HLS_PROBE_LIMIT = 12;
const JELLYFIN_TRICKPLAY_WIDTH = 320;

type TrickplayCacheEntry = {
    entries?: ParsedTrickplayEntry[];
    expiresAt: number;
    pending?: Promise<ParsedTrickplayEntry[]>;
};

const trickplayEntriesCache = new Map<string, TrickplayCacheEntry>();

function getSecret(): string {
    return process.env.SECRET ?? 'changeme';
}

function parseJellyfinSourceConfig(source: SourceRow): JellyfinSourceConfig {
    const rawJellyfinConfig = JSON.parse(source.config) as JellyfinSourceConfig;
    return {
        ...rawJellyfinConfig,
        url: normalizeJellyfinUrl(rawJellyfinConfig.url),
    };
}

export async function resolveJellyfinConfigForSource(source: SourceRow): Promise<JellyfinSourceConfig> {
    const rawConfig = parseJellyfinSourceConfig(source);
    return hasUrlProtocol(rawConfig.url) ? rawConfig : await resolveJellyfinConfig(rawConfig);
}

function buildJellyfinUrl(config: JellyfinSourceConfig, pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
        return pathOrUrl;
    }

    return `${config.url}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export async function fetchJellyfinResponse(
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

export async function resolveJellyfinPlaybackContext(
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

export function buildMediaProxyUrl(linkId: string, target: string): string {
    const token = createSealedProxyToken<MediaProxyTokenData>({
        linkId,
        purpose: 'media',
        exp: Date.now() + MEDIA_PROXY_TOKEN_TTL_MS,
        data: { target },
    }, getSecret());

    return `/${linkId}/media/${token}`;
}

export function rewriteManifestBody(manifest: string, upstreamUrl: string, linkId: string): string {
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

        const resolutionMatch = /(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/.exec(pendingInfoLine);
        variants.push({
            infoLine: pendingInfoLine,
            upstreamUrl: new URL(line, upstreamUrl).toString(),
            width: resolutionMatch ? Number(resolutionMatch[1]) : undefined,
        });
        pendingInfoLine = null;
    }

    return variants;
}

export async function buildJellyfinAdaptiveMasterManifest(
    config: JellyfinSourceConfig,
    linkId: string,
    fileId: string,
    context: JellyfinPlaybackContext,
): Promise<string> {
    const variants = new Map<string, JellyfinManifestVariant>();
    const attemptedWidths = new Set<string>();
    let nextMaxWidth: number | undefined;

    for (let attempt = 0; attempt < JELLYFIN_HLS_PROBE_LIMIT; attempt += 1) {
        const probeKey = String(nextMaxWidth ?? 'full');
        if (attemptedWidths.has(probeKey)) {
            break;
        }
        attemptedWidths.add(probeKey);

        try {
            const upstreamUrl = buildJellyfinAdaptiveManifestUrl(config, fileId, context, {
                maxWidth: nextMaxWidth,
            });
            const response = await fetchJellyfinResponse(config, upstreamUrl, {
                headers: {
                    Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream',
                },
            });

            if (!response.ok) {
                break;
            }

            const manifest = await response.text();
            const probeVariants = extractMasterManifestVariants(manifest, upstreamUrl);

            if (probeVariants.length === 0) {
                break;
            }

            probeVariants.forEach((variant) => {
                variants.set(variant.upstreamUrl, variant);
            });

            const probeWidths = probeVariants.reduce<number[]>((widths, variant) => {
                if (typeof variant.width === 'number' && Number.isFinite(variant.width) && variant.width > 0) {
                    widths.push(variant.width);
                }
                return widths;
            }, []);

            if (probeWidths.length === 0) {
                break;
            }

            const nextProbeWidth = Math.min(...probeWidths) - 1;
            if (nextProbeWidth <= 0 || nextProbeWidth === nextMaxWidth) {
                break;
            }

            nextMaxWidth = nextProbeWidth;
        } catch {
            break;
        }
    }

    if (variants.size === 0) {
        throw new Error('Adaptive manifest error: no variant streams available');
    }

    return `#EXTM3U\n${Array.from(variants.values())
        .flatMap((variant) => [variant.infoLine, buildMediaProxyUrl(linkId, variant.upstreamUrl)])
        .join('\n')}\n`;
}

export function buildPreviewImageUrl(linkId: string, sheetIndex: number): string {
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
            currentSegmentDuration = Number.parseFloat(line.slice('#EXTINF:'.length).split(',')[0] ?? '0');
            continue;
        }

        if (line.startsWith('#EXT-X-TILES:')) {
            const attributes = line.slice('#EXT-X-TILES:'.length).split(',');
            for (const attribute of attributes) {
                const [rawKey, rawValue] = attribute.split('=');
                const key = rawKey?.trim().toUpperCase();
                const value = rawValue?.trim();

                if (!key || !value) {
                    continue;
                }

                if (key === 'RESOLUTION') {
                    const [width, height] = value.split('x').map((part) => Number.parseInt(part, 10));
                    currentTileWidth = Number.isFinite(width) ? width : currentTileWidth;
                    currentTileHeight = Number.isFinite(height) ? height : currentTileHeight;
                    continue;
                }

                if (key === 'LAYOUT') {
                    const [columns, rows] = value.split('x').map((part) => Number.parseInt(part, 10));
                    currentLayoutColumns = Number.isFinite(columns) ? columns : currentLayoutColumns;
                    currentLayoutRows = Number.isFinite(rows) ? rows : currentLayoutRows;
                    continue;
                }

                if (key === 'DURATION') {
                    const duration = Number.parseFloat(value);
                    currentTileDuration = Number.isFinite(duration) ? duration : currentTileDuration;
                }
            }
            continue;
        }

        if (line.startsWith('#')) {
            continue;
        }

        const resolvedUrl = new URL(line, upstreamUrl).toString();
        const tileDuration = currentTileDuration > 0 ? currentTileDuration : currentSegmentDuration;
        const tileCount = Math.max(currentLayoutColumns * currentLayoutRows, 1);

        for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
            const start = currentStart + (tileIndex * tileDuration);
            const end = start + tileDuration;

            if (!Number.isFinite(start) || !Number.isFinite(end) || tileDuration <= 0) {
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

export function isAllowedJellyfinTarget(target: string, config: JellyfinSourceConfig): boolean {
    try {
        const targetUrl = new URL(target);
        const sourceUrl = new URL(config.url);
        return targetUrl.origin === sourceUrl.origin;
    } catch {
        return false;
    }
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

export async function getCachedJellyfinTrickplayEntries(
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
