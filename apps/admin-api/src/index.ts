import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initAuth } from './lib/auth.js';
import dotenv from 'dotenv';
import path from 'path';
import { toNodeHandler } from 'better-auth/node';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load variables from monorepo root if not running in docker
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const start = async () => {
    const fastify = Fastify({ logger: true });

    fastify.get('/', async () => ({
        service: 'admin-api',
        status: 'ok',
    }));

    await fastify.register(cors, {
        origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
        credentials: true,
    });

    const auth = await initAuth();

    fastify.register(async (app) => {
        // Disable body parsing inside /api/auth/* so better-auth can read the stream
        app.removeAllContentTypeParsers();
        app.addContentTypeParser('*', function (request, payload, done) {
            done(null, payload);
        });

        // BetterAuth Fastify Middleware
        app.all('/*', async (request, reply) => {
            const origin = request.headers.origin;
            if (origin) {
                reply.raw.setHeader('Access-Control-Allow-Origin', origin);
                reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
            }

            reply.hijack();
            const nodeHandler = toNodeHandler(auth);
            await nodeHandler(request.raw, reply.raw);
        });
    }, { prefix: '/api/auth' });

    const pingHandler = async (request: any, reply: any) => {
        return { status: 'ok', time: new Date().toISOString() };
    };
    fastify.get('/ping', pingHandler);
    fastify.get('/api/ping', pingHandler);

    fastify.get('/api/setup/status', async (request, reply) => {
        const dbModule = await import('@share-proxy/db');
        const db = await dbModule.getDb();
        const existingUsers = await db.select().from(dbModule.user).limit(1);
        return { hasUsers: existingUsers.length > 0 };
    });

    const { sourcesRoutes } = await import('./routes/sources.js');
    await fastify.register(sourcesRoutes);

    const { linksRoutes } = await import('./routes/links.js');
    await fastify.register(linksRoutes);

    const port = parseInt(process.env.ADMIN_API_PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    try {
        await fastify.listen({ port, host });
        console.log(`Admin API explicitly listening on ${host}:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
