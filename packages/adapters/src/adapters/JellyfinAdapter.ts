import { StorageAdapter, Node } from '../StorageAdapter.js';

export interface JellyfinConfig {
    url: string;
    apiKey: string;
    userId?: string;
}

export function hasUrlProtocol(value: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

export function normalizeJellyfinUrl(value: string): string {
    return value.trim().replace(/\/+$/, '');
}

export function getJellyfinUrlCandidates(value: string): string[] {
    const normalized = normalizeJellyfinUrl(value);
    if (!normalized) {
        return [];
    }

    if (hasUrlProtocol(normalized)) {
        return [normalized];
    }

    return [`https://${normalized}`, `http://${normalized}`];
}

export async function resolveJellyfinConfig(
    config: JellyfinConfig,
): Promise<JellyfinConfig> {
    const candidates = getJellyfinUrlCandidates(config.url);
    let lastError: unknown;

    for (const candidate of candidates) {
        const resolvedConfig = {
            ...config,
            url: candidate,
        };

        try {
            const adapter = new JellyfinAdapter(resolvedConfig);
            await adapter.initialize();
            return {
                ...resolvedConfig,
                url: normalizeJellyfinUrl(candidate),
            };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError ?? new Error('Failed to resolve Jellyfin URL');
}

export class JellyfinAdapter implements StorageAdapter<JellyfinConfig> {
    constructor(public config: JellyfinConfig) { }

    private get baseUrl() {
        return this.config.url.replace(/\/$/, '');
    }

    private async request(endpoint: string, options: RequestInit = {}) {
        const res = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                ...options.headers,
                'X-Emby-Token': this.config.apiKey,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        if (!res.ok) {
            throw new Error(`Jellyfin API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
    }

    async initialize(): Promise<boolean> {
        try {
            await this.request('/System/Info');
            return true;
        } catch (e: any) {
            throw new Error(`Failed to connect to Jellyfin: ${e.message}`);
        }
    }

    private async resolveUserId(): Promise<string> {
        if (this.config.userId) return this.config.userId;
        const users = await this.request('/Users');
        if (!users || users.length === 0) {
            throw new Error('No users found on this Jellyfin server.');
        }
        const admin = users.find((u: any) => u.Policy?.IsAdministrator) || users[0];
        return admin.Id;
    }

    async listDirectory(directoryId?: string): Promise<Node[]> {
        const userId = await this.resolveUserId();
        let endpoint = `/Users/${userId}/Items`;
        if (directoryId) {
            endpoint += `?ParentId=${directoryId}`;
        }

        const data = await this.request(endpoint);
        if (!data?.Items) return [];

        return data.Items.map((item: any): Node => {
            let type: Node['type'] = 'file';
            if (item.IsFolder || item.Type === 'CollectionFolder' || item.Type === 'Folder') {
                type = 'folder';
            } else if (item.Type === 'Playlist') {
                type = 'playlist';
            }

            return {
                id: item.Id,
                name: item.Name,
                type,
                mimeType: item.MediaType ?? undefined,
                duration: item.RunTimeTicks
                    ? Math.round(item.RunTimeTicks / 10_000_000)
                    : undefined,
            };
        });
    }

    private async resolvePlaybackMetadata(
        fileId: string,
    ): Promise<{ mediaSourceId?: string; userId?: string }> {
        const userId = await this.resolveUserId().catch(() => undefined);

        if (!userId) {
            return {};
        }

        try {
            const item = await this.request(`/Users/${userId}/Items/${fileId}`);
            const mediaSourceId = Array.isArray(item?.MediaSources) && item.MediaSources.length > 0
                ? item.MediaSources[0]?.Id
                : undefined;

            return { userId, mediaSourceId };
        } catch {
            return { userId };
        }
    }

    async getFileStream(
        fileId: string,
        range?: { start: number; end?: number },
    ): Promise<{
        acceptRanges: 'bytes' | 'none';
        contentLength: number;
        contentRange?: string;
        mimeType: string;
        statusCode: number;
        stream: import('stream').Readable;
    }> {
        const headers: Record<string, string> = {
            'X-Emby-Token': this.config.apiKey,
        };
        if (range) {
            headers['Range'] = `bytes=${range.start}-${range.end ?? ''}`;
        }

        const fetchStreamResponse = async (url: string) => fetch(url, { headers });

        let res = await fetchStreamResponse(`${this.baseUrl}/Items/${fileId}/Download`);

        // Some Jellyfin installations reject the download endpoint for direct playback items
        // but accept the direct-play video endpoint that the official clients use.
        if (res.status === 400) {
            const playbackMetadata = await this.resolvePlaybackMetadata(fileId);
            const paramCandidates: Array<Record<string, string>> = [];
            const baseParams: Record<string, string> = {
                Static: 'true',
                api_key: this.config.apiKey,
                deviceId: 'share-proxy',
            };

            if (playbackMetadata.userId) {
                baseParams.userId = playbackMetadata.userId;
            }

            if (playbackMetadata.mediaSourceId) {
                paramCandidates.push({
                    ...baseParams,
                    mediaSourceId: playbackMetadata.mediaSourceId,
                });
            }

            paramCandidates.push(baseParams);

            if (!playbackMetadata.mediaSourceId) {
                paramCandidates.push({
                    ...baseParams,
                    mediaSourceId: fileId,
                });
            }

            for (const paramsObject of paramCandidates) {
                const params = new URLSearchParams(paramsObject);
                res = await fetchStreamResponse(`${this.baseUrl}/Videos/${fileId}/stream?${params.toString()}`);
                if (res.ok || res.status !== 400) {
                    break;
                }
            }
        }

        if (!res.ok) {
            throw new Error(`Jellyfin stream error: ${res.status} ${res.statusText}`);
        }
        if (!res.body) {
            throw new Error('No response body from Jellyfin stream');
        }

        const contentLength = Number(res.headers.get('content-length') ?? 0);
        const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
        const acceptRanges = res.headers.get('accept-ranges') === 'bytes' ? 'bytes' : 'none';
        const contentRange = res.headers.get('content-range') ?? undefined;

        const { Readable } = await import('stream');
        const stream = Readable.fromWeb(res.body as any);

        return {
            stream,
            statusCode: res.status,
            contentLength,
            contentRange,
            mimeType,
            acceptRanges,
        };
    }
}
