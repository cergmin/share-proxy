import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDb, links, resources } from '@share-proxy/db';
import { eq } from 'drizzle-orm';

// The Links CRUD needs to handle both links and resources, 
// since a Link must point to a Resource.
export const linksRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

    fastify.get('/api/links', async (request, reply) => {
        const db = await getDb();
        // Return links joined with resources to display in UI
        const allLinks = await db.select({
            id: links.id,
            active: links.active,
            expiresAt: links.expiresAt,
            createdAt: links.createdAt,
            resource: {
                id: resources.id,
                name: resources.name,
                type: resources.type,
                externalId: resources.externalId,
                sourceId: resources.sourceId
            }
        })
            .from(links)
            .innerJoin(resources, eq(links.resourceId, resources.id));

        return allLinks;
    });

    fastify.post('/api/links', async (request, reply) => {
        const { sourceId, externalId, type, name, active, expiresAt } = request.body as any;

        if (!sourceId || !externalId || !type || !name) {
            return reply.code(400).send({ error: "Missing generic resource fields" });
        }

        const db = await getDb();

        // 1. Create a Resource
        const newResource = await db.insert(resources).values({
            sourceId,
            externalId,
            type,
            name,
        }).returning();

        // 2. Create the Link pointing to the Resource
        const newLink = await db.insert(links).values({
            resourceId: newResource[0].id,
            active: active ?? true,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
        }).returning();

        return reply.code(201).send({
            ...newLink[0],
            resource: newResource[0]
        });
    });

    fastify.put('/api/links/:id', async (request, reply) => {
        const { id } = request.params as any;
        const { name, active, expiresAt } = request.body as any;

        const db = await getDb();

        // First get the link to find the resourceId
        const existingLink = await db.select().from(links).where(eq(links.id, id)).limit(1);

        if (!existingLink.length) {
            return reply.code(404).send({ error: "Link not found" });
        }

        // Update the link
        const updatedLink = await db.update(links).set({
            active,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            updatedAt: new Date()
        }).where(eq(links.id, id)).returning();

        // Update the resource name if provided
        let updatedResource = null;
        if (name) {
            const res = await db.update(resources).set({
                name,
                updatedAt: new Date()
            }).where(eq(resources.id, existingLink[0].resourceId)).returning();
            updatedResource = res[0];
        } else {
            const res = await db.select().from(resources).where(eq(resources.id, existingLink[0].resourceId)).limit(1);
            updatedResource = res[0];
        }

        return reply.code(200).send({
            ...updatedLink[0],
            resource: updatedResource
        });
    });

    fastify.delete('/api/links/:id', async (request, reply) => {
        const { id } = request.params as any;
        const db = await getDb();

        // Find link to get resourceId so we delete both
        const existingLink = await db.select().from(links).where(eq(links.id, id)).limit(1);

        if (!existingLink.length) {
            return reply.code(404).send({ error: "Link not found" });
        }

        // Delete resource (which cascades to link, aliases, access rules based on our schema)
        await db.delete(resources).where(eq(resources.id, existingLink[0].resourceId));

        return reply.code(204).send();
    });
};
