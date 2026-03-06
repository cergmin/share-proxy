import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JellyfinAdapter } from '../JellyfinAdapter.js';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetch(responses: Record<string, { ok: boolean; status?: number; body?: any; headers?: Record<string, string> }>) {
    return vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        const match = responses[path] ?? responses['*'];
        if (!match) throw new Error(`Unmocked fetch: ${url}`);
        const headers = new Map(Object.entries(match.headers ?? {}));
        return {
            ok: match.ok,
            status: match.status ?? (match.ok ? 200 : 500),
            statusText: match.ok ? 'OK' : 'Error',
            headers: { get: (k: string) => headers.get(k) ?? null },
            json: async () => match.body,
            body: match.body ? { getReader: () => ({ read: async () => ({ done: true }) }) } : null,
        };
    });
}

const USERS_RESPONSE = [
    { Id: 'admin-id', Policy: { IsAdministrator: true } },
    { Id: 'user-id', Policy: { IsAdministrator: false } },
];

const ITEMS_RESPONSE = {
    Items: [
        { Id: 'folder-1', Name: 'Movies', IsFolder: true, Type: 'CollectionFolder' },
        { Id: 'folder-2', Name: 'Sub', Type: 'Folder' },
        { Id: 'playlist-1', Name: 'My List', Type: 'Playlist' },
        { Id: 'file-1', Name: 'video.mp4', Type: 'Movie', MediaType: 'Video', RunTimeTicks: 72000000000 },
    ],
};

const BASE_CONFIG = { url: 'http://jellyfin.local:8096', apiKey: 'secret-key' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JellyfinAdapter', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // -----------------------------------------------------------------------
    describe('baseUrl', () => {
        it('strips trailing slash from URL', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({}) });
            const adapter = new JellyfinAdapter({ ...BASE_CONFIG, url: 'http://jellyfin.local:8096/' });
            await adapter.initialize();
            expect(fetchMock.mock.calls[0][0]).toBe('http://jellyfin.local:8096/System/Info');
        });
    });

    // -----------------------------------------------------------------------
    describe('initialize()', () => {
        it('returns true on successful connection', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({}) });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await expect(adapter.initialize()).resolves.toBe(true);
            expect(fetchMock).toHaveBeenCalledWith(
                'http://jellyfin.local:8096/System/Info',
                expect.objectContaining({ headers: expect.objectContaining({ 'X-Emby-Token': 'secret-key' }) })
            );
        });

        it('throws "Failed to connect" on HTTP error', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', headers: { get: () => null }, json: async () => ({}) });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await expect(adapter.initialize()).rejects.toThrow('Failed to connect to Jellyfin');
        });

        it('throws "Failed to connect" on network error', async () => {
            fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await expect(adapter.initialize()).rejects.toThrow('Failed to connect to Jellyfin');
        });
    });

    // -----------------------------------------------------------------------
    describe('listDirectory()', () => {
        function setupFetch(itemsResponse = ITEMS_RESPONSE) {
            fetchMock
                .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => USERS_RESPONSE })
                .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => itemsResponse });
        }

        it('prefers config.userId and skips /Users call', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ Items: [] }) });
            const adapter = new JellyfinAdapter({ ...BASE_CONFIG, userId: 'my-user' });
            await adapter.listDirectory();
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock.mock.calls[0][0]).toContain('/Users/my-user/Items');
        });

        it('resolves admin user from /Users when no userId in config', async () => {
            setupFetch({ Items: [] });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.listDirectory();
            expect(fetchMock.mock.calls[1][0]).toContain('/Users/admin-id/Items');
        });

        it('falls back to first user if no admin found', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => [{ Id: 'only-user', Policy: { IsAdministrator: false } }] })
                .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ Items: [] }) });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.listDirectory();
            expect(fetchMock.mock.calls[1][0]).toContain('/Users/only-user/Items');
        });

        it('throws when /Users returns empty array', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => [] });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await expect(adapter.listDirectory()).rejects.toThrow('No users found');
        });

        it('returns [] when Items is null', async () => {
            setupFetch({ Items: null } as any);
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await expect(adapter.listDirectory()).resolves.toEqual([]);
        });

        it('appends ?ParentId=... when directoryId is given', async () => {
            setupFetch({ Items: [] });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.listDirectory('parent-123');
            expect(fetchMock.mock.calls[1][0]).toContain('?ParentId=parent-123');
        });

        it('does not append parentId param when directoryId is absent', async () => {
            setupFetch({ Items: [] });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.listDirectory();
            expect(fetchMock.mock.calls[1][0]).not.toContain('?ParentId');
        });

        it('maps IsFolder:true → type:folder', async () => {
            setupFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const nodes = await adapter.listDirectory();
            expect(nodes.find(n => n.id === 'folder-1')?.type).toBe('folder');
        });

        it('maps Type:CollectionFolder → type:folder', async () => {
            setupFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const nodes = await adapter.listDirectory();
            expect(nodes.find(n => n.id === 'folder-1')?.type).toBe('folder');
        });

        it('maps Type:Folder → type:folder', async () => {
            setupFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const nodes = await adapter.listDirectory();
            expect(nodes.find(n => n.id === 'folder-2')?.type).toBe('folder');
        });

        it('maps Type:Playlist → type:playlist', async () => {
            setupFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const nodes = await adapter.listDirectory();
            expect(nodes.find(n => n.id === 'playlist-1')?.type).toBe('playlist');
        });

        it('maps everything else → type:file', async () => {
            setupFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const nodes = await adapter.listDirectory();
            expect(nodes.find(n => n.id === 'file-1')?.type).toBe('file');
        });

        it('converts RunTimeTicks to seconds correctly', async () => {
            setupFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const nodes = await adapter.listDirectory();
            // 72_000_000_000 ticks / 10_000_000 = 7200 seconds
            expect(nodes.find(n => n.id === 'file-1')?.duration).toBe(7200);
        });

        it('passes mimeType from MediaType field', async () => {
            setupFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const nodes = await adapter.listDirectory();
            expect(nodes.find(n => n.id === 'file-1')?.mimeType).toBe('Video');
        });
    });

    // -----------------------------------------------------------------------
    describe('getFileStream()', () => {
        function makeStreamFetch(opts: {
            ok?: boolean;
            status?: number;
            contentLength?: string;
            contentType?: string;
            acceptRanges?: string;
        } = {}) {
            const { ok = true, status = 200, contentLength = '1024', contentType = 'video/mp4', acceptRanges = 'bytes' } = opts;
            // Use a real WHATWG ReadableStream — Readable.fromWeb() requires it
            const fakeBody = new ReadableStream({
                start(controller) { controller.close(); }
            });
            fetchMock.mockResolvedValueOnce({
                ok,
                status,
                statusText: ok ? 'OK' : 'Not Found',
                headers: {
                    get: (k: string) => {
                        if (k === 'content-length') return contentLength;
                        if (k === 'content-type') return contentType;
                        if (k === 'accept-ranges') return acceptRanges;
                        return null;
                    },
                },
                body: fakeBody,
                json: async () => ({}),
            });
        }


        it('sends X-Emby-Token header', async () => {
            makeStreamFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.getFileStream('file-abc');
            expect(fetchMock.mock.calls[0][1].headers['X-Emby-Token']).toBe('secret-key');
        });

        it('adds Range header when range provided', async () => {
            makeStreamFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.getFileStream('file-abc', { start: 0, end: 999 });
            expect(fetchMock.mock.calls[0][1].headers['Range']).toBe('bytes=0-999');
        });

        it('adds open-ended Range header when end is undefined', async () => {
            makeStreamFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.getFileStream('file-abc', { start: 512 });
            expect(fetchMock.mock.calls[0][1].headers['Range']).toBe('bytes=512-');
        });

        it('does not add Range header when range is not provided', async () => {
            makeStreamFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.getFileStream('file-abc');
            expect(fetchMock.mock.calls[0][1].headers['Range']).toBeUndefined();
        });

        it('returns acceptRanges:bytes from header', async () => {
            makeStreamFetch({ acceptRanges: 'bytes' });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const result = await adapter.getFileStream('file-abc');
            expect(result.acceptRanges).toBe('bytes');
        });

        it('returns acceptRanges:none if server omits header', async () => {
            makeStreamFetch({ acceptRanges: '' });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const result = await adapter.getFileStream('file-abc');
            expect(result.acceptRanges).toBe('none');
        });

        it('returns correct size from content-length', async () => {
            makeStreamFetch({ contentLength: '2048' });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const result = await adapter.getFileStream('file-abc');
            expect(result.size).toBe(2048);
        });

        it('returns correct mimeType from content-type', async () => {
            makeStreamFetch({ contentType: 'video/webm' });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            const result = await adapter.getFileStream('file-abc');
            expect(result.mimeType).toBe('video/webm');
        });

        it('throws on HTTP error response', async () => {
            makeStreamFetch({ ok: false, status: 404 });
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await expect(adapter.getFileStream('missing-file')).rejects.toThrow('Jellyfin stream error');
        });

        it('hits the correct /Items/:id/Download endpoint', async () => {
            makeStreamFetch();
            const adapter = new JellyfinAdapter(BASE_CONFIG);
            await adapter.getFileStream('my-file-id');
            expect(fetchMock.mock.calls[0][0]).toBe('http://jellyfin.local:8096/Items/my-file-id/Download');
        });
    });
});
