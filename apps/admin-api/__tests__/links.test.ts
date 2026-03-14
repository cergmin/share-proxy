import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './buildApp.js';
import { clearDatabase } from './clearDatabase.js';

let app: FastifyInstance;

async function createSource() {
    const res = await app.inject({
        method: 'POST',
        url: '/api/sources',
        payload: { name: 'JF Source', type: 'jellyfin', config: { url: 'http://jf.local', apiKey: 'k' } },
    });
    return res.json() as { id: string };
}

async function createLink(sourceId: string, overrides: Record<string, unknown> = {}) {
    return app.inject({
        method: 'POST',
        url: '/api/links',
        payload: {
            sourceId,
            externalId: 'item-001',
            type: 'file',
            name: 'Test Video',
            active: true,
            accessRules: [],
            ...overrides,
        },
    });
}

describe('Links API', () => {
    beforeEach(async () => {
        process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/share_proxy';
        process.env.PROXY_ORIGIN = 'https://proxy.example.com';
        app = await buildApp();
        await clearDatabase();
    });

    afterEach(async () => {
        await app.close();
    });

    describe('GET /api/links', () => {
        it('returns empty array when no links exist', async () => {
            const res = await app.inject({ method: 'GET', url: '/api/links' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
        });

        it('returns viewerUrl and safe accessRules metadata', async () => {
            const { id: sourceId } = await createSource();
            await createLink(sourceId, {
                accessRules: [
                    { type: 'public' },
                    { type: 'password', password: 'one' },
                ],
            });

            const res = await app.inject({ method: 'GET', url: '/api/links' });
            expect(res.statusCode).toBe(200);
            const [link] = res.json() as any[];
            expect(link.viewerUrl).toBe('https://proxy.example.com/' + link.id);
            expect(link.accessRules).toHaveLength(2);
            expect(link.accessRules).toEqual([
                expect.objectContaining({ type: 'public' }),
                expect.objectContaining({ type: 'password' }),
            ]);
            expect(JSON.stringify(link.accessRules)).not.toContain('hash');
            expect(link.resource).toMatchObject({
                name: 'Test Video',
                externalId: 'item-001',
            });
        });
    });

    describe('POST /api/links', () => {
        it('creates resource + link with empty access rules', async () => {
            const { id: sourceId } = await createSource();
            const res = await createLink(sourceId);

            expect(res.statusCode).toBe(201);
            const body = res.json();
            expect(body.id).toBeTruthy();
            expect(body.viewerUrl).toBe(`https://proxy.example.com/${body.id}`);
            expect(body.accessRules).toEqual([]);
            expect(body.resource).toMatchObject({ name: 'Test Video', externalId: 'item-001' });
        });

        it('stores a public rule', async () => {
            const { id: sourceId } = await createSource();
            const res = await createLink(sourceId, {
                accessRules: [{ type: 'public' }],
            });

            expect(res.statusCode).toBe(201);
            expect(res.json().accessRules).toEqual([
                expect.objectContaining({ type: 'public' }),
            ]);
        });

        it('stores multiple password rules without exposing secrets', async () => {
            const { id: sourceId } = await createSource();
            const res = await createLink(sourceId, {
                accessRules: [
                    { type: 'password', password: 'alpha' },
                    { type: 'password', password: 'beta' },
                ],
            });

            expect(res.statusCode).toBe(201);
            const body = res.json();
            expect(body.accessRules).toHaveLength(2);
            expect(body.accessRules.every((rule: any) => rule.type === 'password')).toBe(true);
            expect(JSON.stringify(body)).not.toContain('alpha');
            expect(JSON.stringify(body)).not.toContain('beta');
        });

        it('returns 400 for a new password rule without password', async () => {
            const { id: sourceId } = await createSource();
            const res = await createLink(sourceId, {
                accessRules: [{ type: 'password' }],
            });

            expect(res.statusCode).toBe(400);
        });

        it('returns 400 when sourceId is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/api/links',
                payload: { externalId: 'x', type: 'file', name: 'x', accessRules: [] },
            });
            expect(res.statusCode).toBe(400);
        });
    });

    describe('PUT /api/links/:id', () => {
        it('preserves an existing password rule by id', async () => {
            const { id: sourceId } = await createSource();
            const created = (await createLink(sourceId, {
                accessRules: [{ type: 'password', password: 'secret-1' }],
            })).json();

            const ruleId = created.accessRules[0].id;

            const res = await app.inject({
                method: 'PUT',
                url: `/api/links/${created.id}`,
                payload: {
                    active: true,
                    name: 'Updated name',
                    accessRules: [{ id: ruleId, type: 'password' }],
                },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({
                active: true,
                resource: { name: 'Updated name' },
                accessRules: [{ id: ruleId, type: 'password' }],
            });
        });

        it('replaces and deletes rules based on the submitted array', async () => {
            const { id: sourceId } = await createSource();
            const created = (await createLink(sourceId, {
                accessRules: [
                    { type: 'public' },
                    { type: 'password', password: 'secret-1' },
                ],
            })).json();

            const passwordRuleId = created.accessRules.find((rule: any) => rule.type === 'password')?.id;

            const res = await app.inject({
                method: 'PUT',
                url: `/api/links/${created.id}`,
                payload: {
                    active: false,
                    accessRules: [
                        { id: passwordRuleId, type: 'password', password: 'secret-2' },
                    ],
                },
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.active).toBe(false);
            expect(body.accessRules).toHaveLength(1);
            expect(body.accessRules[0]).toMatchObject({ id: passwordRuleId, type: 'password' });
        });

        it('allows clearing all rules', async () => {
            const { id: sourceId } = await createSource();
            const created = (await createLink(sourceId, {
                accessRules: [{ type: 'public' }],
            })).json();

            const res = await app.inject({
                method: 'PUT',
                url: `/api/links/${created.id}`,
                payload: {
                    active: true,
                    accessRules: [],
                },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json().accessRules).toEqual([]);
        });

        it('preserves existing rules when accessRules is omitted', async () => {
            const { id: sourceId } = await createSource();
            const created = (await createLink(sourceId, {
                accessRules: [
                    { type: 'public' },
                    { type: 'password', password: 'secret-1' },
                ],
            })).json();

            const originalRuleIds = created.accessRules.map((rule: any) => rule.id).sort();

            const res = await app.inject({
                method: 'PUT',
                url: `/api/links/${created.id}`,
                payload: {
                    name: 'Still accessible',
                },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json().resource.name).toBe('Still accessible');
            expect(res.json().accessRules).toHaveLength(2);
            expect(res.json().accessRules.map((rule: any) => rule.id).sort()).toEqual(originalRuleIds);
        });

        it('returns 404 when link not found', async () => {
            const res = await app.inject({
                method: 'PUT',
                url: '/api/links/00000000-0000-0000-0000-000000000000',
                payload: { active: false, accessRules: [] },
            });
            expect(res.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/links/:id', () => {
        it('deletes link and resource, returns 204', async () => {
            const { id: sourceId } = await createSource();
            const { id } = (await createLink(sourceId)).json();

            const res = await app.inject({ method: 'DELETE', url: `/api/links/${id}` });
            expect(res.statusCode).toBe(204);

            const listRes = await app.inject({ method: 'GET', url: '/api/links' });
            expect(listRes.json()).toHaveLength(0);
        });
    });
});
