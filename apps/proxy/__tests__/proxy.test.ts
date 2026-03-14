import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildProxyApp } from '../src/app.js';
import { accessRules, getDb, links, resources, sources } from '@share-proxy/db';
import { createSealedProxyToken, hashPasswordRule } from '@share-proxy/core';

let app: FastifyInstance;
let fetchMock: ReturnType<typeof vi.fn>;

async function clearDatabase() {
    const db = await getDb();
    await db.delete(accessRules);
    await db.delete(links);
    await db.delete(resources);
    await db.delete(sources);
}

async function seedLink(options: {
    accessRules?: Array<{ password?: string; type: 'password' | 'public' }>;
    active?: boolean;
    expiresAt?: Date | null;
    externalId?: string;
} = {}) {
    const db = await getDb();
    const [source] = await db.insert(sources).values({
        name: 'Jellyfin',
        type: 'jellyfin',
        config: JSON.stringify({ url: 'http://jellyfin.local:8096', apiKey: 'secret-key' }),
    }).returning();

    const [resource] = await db.insert(resources).values({
        sourceId: source.id,
        externalId: options.externalId ?? 'video-123',
        type: 'file',
        name: 'Proxy Test Video',
    }).returning();

    const [link] = await db.insert(links).values({
        resourceId: resource.id,
        active: options.active ?? true,
        expiresAt: options.expiresAt ?? null,
    }).returning();

    if (options.accessRules) {
        for (const rule of options.accessRules) {
            await db.insert(accessRules).values({
                linkId: link.id,
                type: rule.type,
                params: rule.type === 'password' ? await hashPasswordRule(rule.password ?? '') : null,
            });
        }
    }

    return { link, resource, source };
}

function mockStreamResponse(options: {
    acceptRanges?: string;
    contentLength?: string;
    contentRange?: string;
    contentType?: string;
    ok?: boolean;
    status?: number;
} = {}) {
    const {
        ok = true,
        status = 200,
        contentLength = '1024',
        contentType = 'video/mp4',
        acceptRanges = 'bytes',
        contentRange,
    } = options;

    fetchMock.mockResolvedValueOnce({
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        headers: {
            get: (key: string) => {
                if (key === 'content-length') return contentLength;
                if (key === 'content-type') return contentType;
                if (key === 'accept-ranges') return acceptRanges;
                if (key === 'content-range') return contentRange ?? null;
                return null;
            },
        },
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.close();
            },
        }),
        json: async () => ({}),
    });
}

describe('Proxy app', () => {
    beforeEach(async () => {
        process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/share_proxy';
        process.env.SECRET = 'test-secret';
        process.env.PROXY_ORIGIN = 'http://localhost:3001';
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        app = await buildProxyApp({ logger: false });
        await clearDatabase();
    });

    afterEach(async () => {
        await app.close();
        vi.unstubAllGlobals();
    });

    it('renders viewer page for a public link', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });

        const res = await app.inject({ method: 'GET', url: `/${link.id}` });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.body).toContain('Proxy Test Video');
        expect(res.body).toContain(`/${link.id}/stream`);
        expect(res.body).toContain('/_video-player.js');
        expect(res.body).toContain(`/${link.id}/manifest.m3u8`);
        expect(res.body).not.toContain('maxBitrate=');
        expect(res.body).toContain('share-proxy-video-player-root');
    });

    it('denies viewer and stream when access rules are empty', async () => {
        const { link } = await seedLink();

        const viewerRes = await app.inject({ method: 'GET', url: `/${link.id}` });
        expect(viewerRes.statusCode).toBe(403);

        const streamRes = await app.inject({ method: 'GET', url: `/${link.id}/stream` });
        expect(streamRes.statusCode).toBe(403);
    });

    it('shows password form for password-only links', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'password', password: 'alpha' }],
        });

        const res = await app.inject({ method: 'GET', url: `/${link.id}` });
        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('Protected viewer');
        expect(res.body).toContain(`/${link.id}/unlock`);
    });

    it('unlocks with password and then allows cookie-based playback', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'password', password: 'alpha' }],
        });

        const unlockRes = await app.inject({
            method: 'POST',
            url: `/${link.id}/unlock`,
            payload: { password: 'alpha' },
        });

        expect(unlockRes.statusCode).toBe(302);
        const setCookieHeader = unlockRes.headers['set-cookie'];
        expect(setCookieHeader).toBeTruthy();

        const cookieHeader = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

        const viewerRes = await app.inject({
            method: 'GET',
            url: `/${link.id}`,
            headers: {
                cookie: cookieHeader.split(';')[0],
            },
        });

        expect(viewerRes.statusCode).toBe(200);
        expect(viewerRes.body).toContain(`/${link.id}/stream`);
    });

    it('accepts valid basic auth on the stream endpoint', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'password', password: 'alpha' }],
        });
        mockStreamResponse();

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/stream`,
            headers: {
                authorization: `Basic ${Buffer.from('viewer:alpha').toString('base64')}`,
            },
        });

        expect(res.statusCode).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects missing basic auth on a protected stream', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'password', password: 'alpha' }],
        });

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/stream`,
        });

        expect(res.statusCode).toBe(401);
        expect(res.headers['www-authenticate']).toBe('Basic realm="Share Proxy"');
    });

    it('accepts any of multiple passwords', async () => {
        const { link } = await seedLink({
            accessRules: [
                { type: 'password', password: 'alpha' },
                { type: 'password', password: 'beta' },
            ],
        });
        mockStreamResponse();

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/stream`,
            headers: {
                authorization: `Basic ${Buffer.from('viewer:beta').toString('base64')}`,
            },
        });

        expect(res.statusCode).toBe(200);
    });

    it('blocks inactive and expired links', async () => {
        const inactive = await seedLink({
            active: false,
            accessRules: [{ type: 'public' }],
        });
        const expired = await seedLink({
            expiresAt: new Date(Date.now() - 60_000),
            accessRules: [{ type: 'public' }],
            externalId: 'video-456',
        });

        expect((await app.inject({ method: 'GET', url: `/${inactive.link.id}` })).statusCode).toBe(410);
        expect((await app.inject({ method: 'GET', url: `/${expired.link.id}/stream` })).statusCode).toBe(410);
    });

    it('returns 404 for favicon requests instead of treating them as link ids', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/favicon.ico',
        });

        expect(res.statusCode).toBe(404);
    });

    it('forwards range requests and returns partial content metadata', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });
        mockStreamResponse({
            status: 206,
            contentLength: '512',
            contentRange: 'bytes 0-511/2048',
        });

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/stream`,
            headers: {
                range: 'bytes=0-511',
            },
        });

        expect(res.statusCode).toBe(206);
        expect(res.headers['content-length']).toBe('512');
        expect(res.headers['content-range']).toBe('bytes 0-511/2048');
        expect(fetchMock.mock.calls[0]?.[1]?.headers?.Range).toBe('bytes=0-511');
    });

    it('rewrites jellyfin manifests for the browser player', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });

        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => [{ Id: 'admin-id', Policy: { IsAdministrator: true } }],
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ MediaSources: [{ Id: 'media-source-123' }] }),
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=256000,RESOLUTION=1920x1080\nmain-6mbps.m3u8?api_key=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=256000,RESOLUTION=1920x1080\nmain-4mbps.m3u8?api_key=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=256000,RESOLUTION=1280x720\nmain-3mbps.m3u8?api_key=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=256000,RESOLUTION=1280x720\nmain-1_5mbps.m3u8?api_key=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=256000,RESOLUTION=854x480\nmain-720kbps.m3u8?api_key=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=256000,RESOLUTION=640x360\nmain-420kbps.m3u8?api_key=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            });

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/manifest.m3u8`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('BANDWIDTH=6000000,RESOLUTION=1920x1080,AVERAGE-BANDWIDTH=6000000');
        expect(res.body).toContain('BANDWIDTH=4000000,RESOLUTION=1920x1080,AVERAGE-BANDWIDTH=4000000');
        expect(res.body).toContain('BANDWIDTH=3000000,RESOLUTION=1280x720,AVERAGE-BANDWIDTH=3000000');
        expect(res.body).toContain('BANDWIDTH=1500000,RESOLUTION=1280x720,AVERAGE-BANDWIDTH=1500000');
        expect(res.body).toContain('BANDWIDTH=720000,RESOLUTION=854x480,AVERAGE-BANDWIDTH=720000');
        expect(res.body).toContain('BANDWIDTH=420000,RESOLUTION=640x360,AVERAGE-BANDWIDTH=420000');
        expect((res.body.match(new RegExp(`/${link.id}/media/`, 'g')) ?? [])).toHaveLength(6);
        expect(res.body).not.toContain('jellyfin.local');
        expect(res.body).not.toContain('api_key=');
        expect(fetchMock.mock.calls[2][0]).toContain('/Videos/video-123/master.m3u8?');
        expect(fetchMock.mock.calls[2][0]).toContain('VideoCodec=h264');
        expect(fetchMock.mock.calls[2][0]).toContain('AudioCodec=aac');
        expect(fetchMock.mock.calls[3][0]).toContain('MaxWidth=1920');
        expect(fetchMock.mock.calls[4][0]).toContain('MaxWidth=1920');
        expect(fetchMock.mock.calls[5][0]).toContain('MaxWidth=1280');
        expect(fetchMock.mock.calls[6][0]).toContain('MaxWidth=854');
        expect(fetchMock.mock.calls[7][0]).toContain('MaxWidth=640');
    });

    it('serves opaque media token routes for rewritten manifest URLs', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });

        mockStreamResponse({
            contentType: 'video/mp2t',
        });

        const token = createSealedProxyToken({
            linkId: link.id,
            purpose: 'media',
            exp: Date.now() + 60_000,
            data: {
                target: 'http://jellyfin.local:8096/Videos/video-123/hls1/main/0.ts',
            },
        }, process.env.SECRET ?? 'test-secret');

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/media/${token}`,
        });

        expect(res.statusCode).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://jellyfin.local:8096/Videos/video-123/hls1/main/0.ts',
            expect.objectContaining({
                headers: expect.any(Headers),
            }),
        );
    });

    it('drops upstream range headers when rewriting media playlists', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });

        const token = createSealedProxyToken({
            linkId: link.id,
            purpose: 'media',
            exp: Date.now() + 60_000,
            data: {
                target: 'http://jellyfin.local:8096/Videos/video-123/hls1/main/index.m3u8',
            },
        }, process.env.SECRET ?? 'test-secret');

        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: {
                get: (key: string) => {
                    if (key === 'content-type') return 'application/vnd.apple.mpegurl';
                    if (key === 'content-length') return '999';
                    if (key === 'accept-ranges') return 'bytes';
                    if (key === 'content-range') return 'bytes 0-998/999';
                    return null;
                },
            },
            body: new ReadableStream({
                start(controller) {
                    controller.close();
                },
            }),
            text: async () => '#EXTM3U\nsegment-1.ts\n',
            json: async () => ({}),
        });

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/media/${token}`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toContain(`/${link.id}/media/`);
        expect(res.headers['content-length']).toBe(String(Buffer.byteLength(res.body)));
        expect(res.headers['content-range']).toBeUndefined();
        expect(res.headers['accept-ranges']).toBeUndefined();
    });

    it('returns parsed trickplay preview entries for jellyfin', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });

        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => [{ Id: 'admin-id', Policy: { IsAdministrator: true } }],
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ MediaSources: [{ Id: 'media-source-123' }] }),
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXTINF:20,\n#EXT-X-TILES:RESOLUTION=320x180,LAYOUT=2x2,DURATION=5\n0.jpg?token=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            });

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/preview-tracks.json`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            entries: [
                {
                    start: 0,
                    end: 5,
                    url: `/${link.id}/preview/0.jpg`,
                    tileX: 0,
                    tileY: 0,
                    layoutColumns: 2,
                    layoutRows: 2,
                    tileWidth: 320,
                    tileHeight: 180,
                },
                {
                    start: 5,
                    end: 10,
                    url: `/${link.id}/preview/0.jpg`,
                    tileX: 1,
                    tileY: 0,
                    layoutColumns: 2,
                    layoutRows: 2,
                    tileWidth: 320,
                    tileHeight: 180,
                },
                {
                    start: 10,
                    end: 15,
                    url: `/${link.id}/preview/0.jpg`,
                    tileX: 0,
                    tileY: 1,
                    layoutColumns: 2,
                    layoutRows: 2,
                    tileWidth: 320,
                    tileHeight: 180,
                },
                {
                    start: 15,
                    end: 20,
                    url: `/${link.id}/preview/0.jpg`,
                    tileX: 1,
                    tileY: 1,
                    layoutColumns: 2,
                    layoutRows: 2,
                    tileWidth: 320,
                    tileHeight: 180,
                },
            ],
        });
    });

    it('filters out trickplay preview sheets from foreign origins', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });

        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => [{ Id: 'admin-id', Policy: { IsAdministrator: true } }],
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ MediaSources: [{ Id: 'media-source-123' }] }),
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXTINF:20,\n#EXT-X-TILES:RESOLUTION=320x180,LAYOUT=2x2,DURATION=5\nhttps://evil.example/tiles.jpg\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            });

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}/preview-tracks.json`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ entries: [] });
    });

    it('reuses cached trickplay entries for preview image requests', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'public' }],
        });

        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => [{ Id: 'admin-id', Policy: { IsAdministrator: true } }],
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ MediaSources: [{ Id: 'media-source-123' }] }),
                headers: { get: () => 'application/json' },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '#EXTM3U\n#EXTINF:20,\n#EXT-X-TILES:RESOLUTION=320x180,LAYOUT=2x2,DURATION=5\n0.jpg?token=abc\n',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'application/vnd.apple.mpegurl' : null),
                },
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    get: (key: string) => (key === 'content-type' ? 'image/jpeg' : null),
                },
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array([1, 2, 3]));
                        controller.close();
                    },
                }),
                json: async () => ({}),
            });

        const tracksRes = await app.inject({
            method: 'GET',
            url: `/${link.id}/preview-tracks.json`,
        });
        expect(tracksRes.statusCode).toBe(200);

        const imageRes = await app.inject({
            method: 'GET',
            url: `/${link.id}/preview/0.jpg`,
        });

        expect(imageRes.statusCode).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('ignores malformed cookies during access checks', async () => {
        const { link } = await seedLink({
            accessRules: [{ type: 'password', password: 'alpha' }],
        });

        const res = await app.inject({
            method: 'GET',
            url: `/${link.id}`,
            headers: {
                cookie: 'broken=%',
            },
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toContain('Protected viewer');
    });
});
