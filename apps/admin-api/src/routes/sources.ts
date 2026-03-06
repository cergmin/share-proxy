import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDb, sources } from '@share-proxy/db';
import { eq } from 'drizzle-orm';
import { JellyfinAdapter } from '@share-proxy/adapters';

export const sourcesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // @ts-ignore - Temporary ignore until better-auth context is typed inside fastify
    // Ideally, we'd add preHandler hooks to ensure user is logged in

    fastify.get('/api/sources', async (request, reply) => {
        const db = await getDb();
        const allSources = await db.select().from(sources);

        // Do not return raw config (containing secrets) to the frontend
        const safeSources = allSources.map((s: typeof sources.$inferSelect) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
        }));

        return safeSources;
    });

    fastify.post('/api/sources/test', async (request, reply) => {
        const { type, config } = request.body as any;

        if (!type || !config) {
            return reply.code(400).send({ error: "Missing type or config" });
        }

        try {
            if (type === 'jellyfin') {
                const adapter = new JellyfinAdapter(config);
                await adapter.initialize();
                return reply.code(200).send({ success: true });
            }
            return reply.code(400).send({ error: "Unsupported source type for testing" });
        } catch (e: any) {
            return reply.code(400).send({ error: e.message });
        }
    });

    fastify.post('/api/sources', async (request, reply) => {
        const { name, type, config } = request.body as any;

        if (!name || !type || !config) {
            return reply.code(400).send({ error: "Missing fields" });
        }

        const db = await getDb();
        const newSource = await db.insert(sources).values({
            name,
            type,
            config: JSON.stringify(config), // Ideally encrypt this before storing
        }).returning();

        return reply.code(201).send(newSource[0]);
    });

    fastify.delete('/api/sources/:id', async (request, reply) => {
        const { id } = request.params as any;

        const db = await getDb();
        await db.delete(sources).where(eq(sources.id, id));

        return reply.code(204).send();
    });

    fastify.get('/api/sources/:id/tree', async (request, reply) => {
        const { id } = request.params as any;
        const { parentId } = request.query as any;

        const db = await getDb();
        const sourceList = await db.select().from(sources).where(eq(sources.id, id));
        if (!sourceList.length) {
            return reply.code(404).send({ error: "Source not found" });
        }

        const source = sourceList[0];
        try {
            const config = JSON.parse(source.config);
            if (source.type === 'jellyfin') {
                const adapter = new JellyfinAdapter(config);
                const tree = await adapter.listDirectory(parentId);
                return reply.code(200).send(tree);
            }
            return reply.code(400).send({ error: "Unsupported source type for tree browsing" });
        } catch (e: any) {
            return reply.code(400).send({ error: e.message });
        }
    });

    fastify.put('/api/sources/:id', async (request, reply) => {
        const { id } = request.params as any;
        const { name, type, config } = request.body as any;

        if (!name || !type || !config) {
            return reply.code(400).send({ error: "Missing fields" });
        }

        const db = await getDb();
        const updatedSource = await db.update(sources).set({
            name,
            type,
            config: typeof config === 'string' ? config : JSON.stringify(config),
            updatedAt: new Date()
        }).where(eq(sources.id, id)).returning();

        if (!updatedSource.length) {
            return reply.code(404).send({ error: "Source not found" });
        }

        return reply.code(200).send(updatedSource[0]);
    });
};
