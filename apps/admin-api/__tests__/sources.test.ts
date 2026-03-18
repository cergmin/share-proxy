import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from './buildApp.js';
import { clearDatabase } from './clearDatabase.js';
import type { FastifyInstance } from 'fastify';

describe('Sources API', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/share_proxy';
        app = await buildApp();
        await clearDatabase();
    });

    afterEach(async () => {
        await app.close();
    });

    it('responds on the root route for manual service checks', async () => {
        const res = await app.inject({ method: 'GET', url: '/' });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            service: 'admin-api',
            status: 'ok',
        });
    });

    // -----------------------------------------------------------------------
    describe('GET /api/sources', () => {
        it('returns an empty array when there are no sources', async () => {
            const res = await app.inject({ method: 'GET', url: '/api/sources' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
        });

        it('does not expose the config field (secrets)', async () => {
            // Create a source first
            await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'My Jellyfin', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'secret' } },
            });

            const res = await app.inject({ method: 'GET', url: '/api/sources' });
            const sources = res.json() as any[];
            expect(sources).toHaveLength(1);
            expect(sources[0]).not.toHaveProperty('config');
            expect(sources[0]).toMatchObject({ name: 'My Jellyfin', type: 'jellyfin' });
        });
    });

    // -----------------------------------------------------------------------
    describe('POST /api/sources', () => {
        it('creates a source and returns 201', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'Test Source', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'key' } },
            });
            expect(res.statusCode).toBe(201);
            const body = res.json();
            expect(body).toMatchObject({ name: 'Test Source', type: 'jellyfin' });
            expect(body.id).toBeTruthy();
        });

        it('normalizes a Jellyfin URL without protocol before saving', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: false,
                    status: 502,
                    statusText: 'Bad Gateway',
                    headers: { get: () => null },
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: { get: () => null },
                    json: async () => ({ ServerName: 'Test' }),
                });
            vi.stubGlobal('fetch', fetchMock);

            const res = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'Test Source', type: 'jellyfin', config: { url: 'jf.local:8096', apiKey: 'key' } },
            });

            expect(res.statusCode).toBe(201);
            expect(fetchMock.mock.calls[0][0]).toBe('https://jf.local:8096/System/Info');
            expect(fetchMock.mock.calls[1][0]).toBe('http://jf.local:8096/System/Info');
            expect(JSON.parse(res.json().config)).toMatchObject({ url: 'http://jf.local:8096' });

            vi.unstubAllGlobals();
        });

        it('returns 400 when name is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { type: 'jellyfin', config: { url: 'http://jf.local' } },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 400 when type is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'Test', config: { url: 'http://jf.local' } },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 400 when config is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'Test', type: 'jellyfin' },
            });
            expect(res.statusCode).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    describe('PUT /api/sources/:id', () => {
        it('updates a source and returns updated object', async () => {
            const created = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'Original', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'k' } },
            });
            const { id } = created.json();

            const res = await app.inject({
                method: 'PUT',
                url: `/api/sources/${id}`,
                payload: { name: 'Updated', type: 'jellyfin', config: { url: 'http://jf-new.local', apiKey: 'k' } },
            });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ id, name: 'Updated' });
        });

        it('normalizes Jellyfin URL without protocol on update', async () => {
            const created = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'Original', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'k' } },
            });
            const { id } = created.json();

            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: false,
                    status: 502,
                    statusText: 'Bad Gateway',
                    headers: { get: () => null },
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: { get: () => null },
                    json: async () => ({ ServerName: 'Test' }),
                });
            vi.stubGlobal('fetch', fetchMock);

            const res = await app.inject({
                method: 'PUT',
                url: `/api/sources/${id}`,
                payload: { name: 'Updated', type: 'jellyfin', config: { url: 'new-jf.local:8096', apiKey: 'k' } },
            });
            expect(res.statusCode).toBe(200);
            expect(fetchMock.mock.calls[0][0]).toBe('https://new-jf.local:8096/System/Info');
            expect(fetchMock.mock.calls[1][0]).toBe('http://new-jf.local:8096/System/Info');
            expect(JSON.parse(res.json().config)).toMatchObject({ url: 'http://new-jf.local:8096' });

            vi.unstubAllGlobals();
        });

        it('returns 404 when source not found', async () => {
            const res = await app.inject({
                method: 'PUT',
                url: '/api/sources/00000000-0000-0000-0000-000000000000',
                payload: { name: 'X', type: 'jellyfin', config: {} },
            });
            expect(res.statusCode).toBe(404);
        });

        it('returns 400 when required fields are missing', async () => {
            const res = await app.inject({
                method: 'PUT',
                url: '/api/sources/some-id',
                payload: { name: 'X' },
            });
            expect(res.statusCode).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    describe('DELETE /api/sources/:id', () => {
        it('deletes a source and returns 204', async () => {
            const created = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'ToDelete', type: 'jellyfin', config: { url: 'http://x', apiKey: 'k' } },
            });
            const { id } = created.json();

            const res = await app.inject({ method: 'DELETE', url: `/api/sources/${id}` });
            expect(res.statusCode).toBe(204);

            // Verify it's gone
            const listRes = await app.inject({ method: 'GET', url: '/api/sources' });
            expect(listRes.json()).toHaveLength(0);
        });

        it('is idempotent (204 even if id not found)', async () => {
            const res = await app.inject({
                method: 'DELETE',
                url: '/api/sources/00000000-0000-0000-0000-000000000000',
            });
            expect(res.statusCode).toBe(204);
        });
    });

    // -----------------------------------------------------------------------
    describe('POST /api/sources/test', () => {
        it('returns 400 when type is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/sources/test',
                payload: { config: { url: 'http://jf.local', apiKey: 'k' } },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 400 when config is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/sources/test',
                payload: { type: 'jellyfin' },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 400 for unsupported source type', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/sources/test',
                payload: { type: 'gdrive', config: {} },
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toMatch(/Unsupported/);
        });

        it('returns 200 when Jellyfin /System/Info responds successfully', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: { get: () => null },
                json: async () => ({ ServerName: 'Test' }),
            }));

            const res = await app.inject({
                method: 'POST',
                url: '/api/sources/test',
                payload: { type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'valid-key' } },
            });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ success: true, config: { url: 'http://jf.local', apiKey: 'valid-key' } });

            vi.unstubAllGlobals();
        });

        it('tries https and then http when Jellyfin URL has no protocol', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce({
                    ok: false,
                    status: 502,
                    statusText: 'Bad Gateway',
                    headers: { get: () => null },
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: { get: () => null },
                    json: async () => ({ ServerName: 'Test' }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: { get: () => null },
                    json: async () => ({ ServerName: 'Test' }),
                });
            vi.stubGlobal('fetch', fetchMock);

            const res = await app.inject({
                method: 'POST',
                url: '/api/sources/test',
                payload: { type: 'jellyfin', config: { url: 'jf.local:8096', apiKey: 'valid-key' } },
            });
            expect(res.statusCode).toBe(200);
            expect(fetchMock.mock.calls[0][0]).toBe('https://jf.local:8096/System/Info');
            expect(fetchMock.mock.calls[1][0]).toBe('http://jf.local:8096/System/Info');
            expect(fetchMock.mock.calls[2][0]).toBe('http://jf.local:8096/System/Info');
            expect(res.json()).toEqual({
                success: true,
                config: { url: 'http://jf.local:8096', apiKey: 'valid-key' },
            });

            vi.unstubAllGlobals();
        });

        it('returns 400 when Jellyfin returns 401', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                headers: { get: () => null },
                json: async () => ({}),
            }));

            const res = await app.inject({
                method: 'POST',
                url: '/api/sources/test',
                payload: { type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'bad-key' } },
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBeTruthy();

            vi.unstubAllGlobals();
        });
    });

    // -----------------------------------------------------------------------
    describe('GET /api/sources/:id/tree', () => {
        it('returns 404 when source not found', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/sources/00000000-0000-0000-0000-000000000000/tree',
            });
            expect(res.statusCode).toBe(404);
        });

        it('returns 400 for unsupported source type', async () => {
            const created = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'GDrive', type: 'gdrive', config: {} },
            });
            const { id } = created.json();

            const res = await app.inject({ method: 'GET', url: `/api/sources/${id}/tree` });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toMatch(/Unsupported/);
        });

        it('returns Node[] from JellyfinAdapter.listDirectory()', async () => {
            const created = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'JF', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'k', userId: 'u1' } },
            });
            const { id } = created.json();

            // Mock Jellyfin to return one folder
            vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: { get: () => null },
                json: async () => ({ Items: [{ Id: 'lib-1', Name: 'Movies', IsFolder: true, Type: 'CollectionFolder' }] }),
            }));

            const res = await app.inject({ method: 'GET', url: `/api/sources/${id}/tree` });
            expect(res.statusCode).toBe(200);
            const nodes = res.json();
            expect(nodes).toHaveLength(1);
            expect(nodes[0]).toMatchObject({ id: 'lib-1', name: 'Movies', type: 'folder' });

            vi.unstubAllGlobals();
        });

        it('passes parentId query param to the adapter', async () => {
            const created = await app.inject({
                method: 'POST',
                url: '/api/sources',
                payload: { name: 'JF', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'k', userId: 'u1' } },
            });
            const { id } = created.json();

            const fetchMock = vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: { get: () => null },
                json: async () => ({ Items: [] }),
            });
            vi.stubGlobal('fetch', fetchMock);

            await app.inject({ method: 'GET', url: `/api/sources/${id}/tree?parentId=folder-99` });
            expect(fetchMock.mock.calls[0][0]).toContain('ParentId=folder-99');

            vi.unstubAllGlobals();
        });
    });
});
