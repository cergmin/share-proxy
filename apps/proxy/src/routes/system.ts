import type { FastifyInstance } from 'fastify';
import { getVideoPlayerModuleSource } from '../viewer-pages.js';

export function registerSystemRoutes(app: FastifyInstance): void {
    app.get('/', async (_request, reply) => reply.code(404).send({
        error: 'Link not found',
    }));

    app.get('/_health', async () => ({ status: 'ok' }));

    app.get('/_video-player.js', async (_request, reply) => {
        reply.header('content-type', 'text/javascript; charset=utf-8');
        return reply.send(await getVideoPlayerModuleSource());
    });

    app.get('/favicon.ico', async (_request, reply) => reply.code(404).send());
}
