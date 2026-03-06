import { StorageAdapter, Node } from '../StorageAdapter.js';

export interface JellyfinConfig {
    url: string;
    apiKey: string;
    userId?: string;
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

    async getFileStream(
        fileId: string,
        range?: { start: number; end?: number },
    ): Promise<{
        stream: import('stream').Readable;
        size: number;
        mimeType: string;
        acceptRanges: 'bytes' | 'none';
    }> {
        const headers: Record<string, string> = {
            'X-Emby-Token': this.config.apiKey,
        };
        if (range) {
            headers['Range'] = `bytes=${range.start}-${range.end ?? ''}`;
        }

        const res = await fetch(`${this.baseUrl}/Items/${fileId}/Download`, { headers });
        if (!res.ok) {
            throw new Error(`Jellyfin stream error: ${res.status} ${res.statusText}`);
        }
        if (!res.body) {
            throw new Error('No response body from Jellyfin stream');
        }

        const contentLength = Number(res.headers.get('content-length') ?? 0);
        const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
        const acceptRanges = res.headers.get('accept-ranges') === 'bytes' ? 'bytes' : 'none';

        const { Readable } = await import('stream');
        const stream = Readable.fromWeb(res.body as any);

        return { stream, size: contentLength, mimeType, acceptRanges };
    }
}
