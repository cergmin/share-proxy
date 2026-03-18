/**
 * Test helper: builds a Fastify instance with Sources and Links routes registered,
 * but WITHOUT authentication middleware — suitable for unit/integration testing.
 *
 * Uses the same PostgreSQL-backed DB module as production code.
 */
import Fastify, { FastifyInstance } from 'fastify';
import { sourcesRoutes } from '../src/routes/sources.js';
import { linksRoutes } from '../src/routes/links.js';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.get('/', async () => ({
        service: 'admin-api',
        status: 'ok',
    }));
    await app.register(sourcesRoutes);
    await app.register(linksRoutes);
    await app.ready();
    return app;
}
