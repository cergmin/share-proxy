import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from './buildApp.js';
import { clearDatabase } from './clearDatabase.js';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let app: FastifyInstance;

async function createSource() {
    const res = await app.inject({
        method: 'POST',
        url: '/api/sources',
        payload: { name: 'JF Source', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'k' } },
    });
    return res.json() as { id: string };
}

async function createLink(sourceId: string, overrides: Record<string, any> = {}) {
    const res = await app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
            sourceId,
            externalId: 'item-001',
            type: 'file',
            name: 'Test Video',
            active: true,
            ...overrides,
        },
    });
    return res;
}

// ---------------------------------------------------------------------------

describe('Links API', () => {
    beforeEach(async () => {
        process.env.DB_TYPE = 'pglite';
        process.env.PGLITE_DIR = 'memory://';
        app = await buildApp();
        await clearDatabase();
    });

    afterEach(async () => {
        await app.close();
    });

    // -----------------------------------------------------------------------
    describe('GET /api/links', () => {
        it('returns empty array when no links exist', async () => {
            const res = await app.inject({ method: 'GET', url: '/api/links' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
        });

        it('returns link joined with resource data', async () => {
            const { id: sourceId } = await createSource();
            await createLink(sourceId);

            const res = await app.inject({ method: 'GET', url: '/api/links' });
            expect(res.statusCode).toBe(200);
            const links = res.json() as any[];
            expect(links).toHaveLength(1);

            const link = links[0];
            expect(link).toMatchObject({
                active: true,
                resource: expect.objectContaining({
                    name: 'Test Video',
                    type: 'file',
                    externalId: 'item-001',
                }),
            });
            expect(link.id).toBeTruthy();
        });
    });

    // -----------------------------------------------------------------------
    describe('POST /api/links', () => {
        it('creates resource + link and returns 201', async () => {
            const { id: sourceId } = await createSource();
            const res = await createLink(sourceId);

            expect(res.statusCode).toBe(201);
            const body = res.json();
            expect(body.id).toBeTruthy();
            expect(body.resource).toMatchObject({ name: 'Test Video', externalId: 'item-001' });
        });

        it('sets expiresAt to null when not provided', async () => {
            const { id: sourceId } = await createSource();
            const res = await createLink(sourceId);

            expect(res.json().expiresAt).toBeNull();
        });

        it('stores expiresAt when ISO date string is provided', async () => {
            const { id: sourceId } = await createSource();
            const futureDate = new Date(Date.now() + 86400000).toISOString();
            const res = await createLink(sourceId, { expiresAt: futureDate });

            expect(res.statusCode).toBe(201);
            expect(res.json().expiresAt).toBeTruthy();
        });

        it('returns 400 when sourceId is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/links',
                payload: { externalId: 'x', type: 'file', name: 'x' },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 400 when externalId is missing', async () => {
            const { id: sourceId } = await createSource();
            const res = await app.inject({
                method: 'POST',
                url: '/api/links',
                payload: { sourceId, type: 'file', name: 'x' },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 400 when type is missing', async () => {
            const { id: sourceId } = await createSource();
            const res = await app.inject({
                method: 'POST',
                url: '/api/links',
                payload: { sourceId, externalId: 'x', name: 'x' },
            });
            expect(res.statusCode).toBe(400);
        });

        it('returns 400 when name is missing', async () => {
            const { id: sourceId } = await createSource();
            const res = await app.inject({
                method: 'POST',
                url: '/api/links',
                payload: { sourceId, externalId: 'x', type: 'file' },
            });
            expect(res.statusCode).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    describe('PUT /api/links/:id', () => {
        it('updates active status', async () => {
            const { id: sourceId } = await createSource();
            const { id } = (await createLink(sourceId)).json();

            const res = await app.inject({
                method: 'PUT',
                url: `/api/links/${id}`,
                payload: { active: false },
            });
            expect(res.statusCode).toBe(200);
            expect(res.json().active).toBe(false);
        });

        it('updates resource name when provided', async () => {
            const { id: sourceId } = await createSource();
            const { id } = (await createLink(sourceId)).json();

            const res = await app.inject({
                method: 'PUT',
                url: `/api/links/${id}`,
                payload: { active: true, name: 'New Name' },
            });
            expect(res.statusCode).toBe(200);
            expect(res.json().resource.name).toBe('New Name');
        });

        it('sets expiresAt when updated', async () => {
            const { id: sourceId } = await createSource();
            const { id } = (await createLink(sourceId)).json();
            const future = new Date(Date.now() + 3600000).toISOString();

            const res = await app.inject({
                method: 'PUT',
                url: `/api/links/${id}`,
                payload: { active: true, expiresAt: future },
            });
            expect(res.statusCode).toBe(200);
            expect(res.json().expiresAt).toBeTruthy();
        });

        it('returns 404 when link not found', async () => {
            const res = await app.inject({
                method: 'PUT',
                url: '/api/links/00000000-0000-0000-0000-000000000000',
                payload: { active: false },
            });
            expect(res.statusCode).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    describe('DELETE /api/links/:id', () => {
        it('deletes link and resource, returns 204', async () => {
            const { id: sourceId } = await createSource();
            const { id } = (await createLink(sourceId)).json();

            const res = await app.inject({ method: 'DELETE', url: `/api/links/${id}` });
            expect(res.statusCode).toBe(204);

            const listRes = await app.inject({ method: 'GET', url: '/api/links' });
            expect(listRes.json()).toHaveLength(0);
        });

        it('returns 404 when link not found', async () => {
            const res = await app.inject({
                method: 'DELETE',
                url: '/api/links/00000000-0000-0000-0000-000000000000',
            });
            expect(res.statusCode).toBe(404);
        });
    });
});
