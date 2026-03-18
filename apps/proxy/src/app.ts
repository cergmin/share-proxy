import Fastify, { FastifyInstance } from 'fastify';
import { registerPlaybackRoutes } from './routes/playback.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerViewerRoutes } from './routes/viewer.js';

export async function buildProxyApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
    const app = Fastify({
        logger: options.logger ?? true,
    });

    app.addContentTypeParser(
        'application/x-www-form-urlencoded',
        { parseAs: 'string' },
        (_request, body, done) => {
            done(null, Object.fromEntries(new URLSearchParams(body as string)));
        },
    );

    registerSystemRoutes(app);
    registerPlaybackRoutes(app);
    registerViewerRoutes(app);

    return app;
}
