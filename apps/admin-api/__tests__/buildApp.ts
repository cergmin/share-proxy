/**
 * Test helper: builds a Fastify instance with Sources and Links routes registered,
 * but WITHOUT authentication middleware — suitable for unit/integration testing.
 *
 * Uses the same DB module as production code, so test setup must call
 * initTestDb() from this module first to point getDb() at a fresh in-memory DB.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { sourcesRoutes } from '../src/routes/sources.js';
import { linksRoutes } from '../src/routes/links.js';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    await app.register(sourcesRoutes);
    await app.register(linksRoutes);
    await app.ready();
    return app;
}
