import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { accessRules, getDb, links, resources } from '@share-proxy/db';
import { AccessRuleInput, AccessRuleSummary, buildViewerUrl, hashPasswordRule } from '@share-proxy/core';
import { eq, inArray } from 'drizzle-orm';

type LinkRow = typeof links.$inferSelect;
type ResourceRow = typeof resources.$inferSelect;
type AccessRuleRow = typeof accessRules.$inferSelect;
type Database = Awaited<ReturnType<typeof getDb>>;
type LinkSummaryRow = Pick<LinkRow, 'active' | 'createdAt' | 'expiresAt' | 'id'>;
type LinkListRow = {
    active: boolean;
    createdAt: Date;
    expiresAt: Date | null;
    id: string;
    resource: ResourceRow;
};

interface LinkResponse {
    accessRules: AccessRuleSummary[];
    active: boolean;
    createdAt: Date;
    expiresAt: Date | null;
    id: string;
    resource: {
        externalId: string;
        id: string;
        name: string;
        sourceId: string;
        type: string;
    };
    viewerUrl: string;
}

function mapAccessRuleSummary(rule: AccessRuleRow): AccessRuleSummary {
    return {
        id: rule.id,
        type: rule.type === 'password' ? 'password' : 'public',
    };
}

function mapExistingRuleInput(rule: AccessRuleRow): AccessRuleInput {
    return {
        id: rule.id,
        type: rule.type === 'password' ? 'password' : 'public',
    };
}

function buildLinkResponse(link: LinkSummaryRow, resource: ResourceRow, ruleRows: AccessRuleRow[]): LinkResponse {
    return {
        id: link.id,
        active: link.active,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
        viewerUrl: buildViewerUrl(link.id),
        accessRules: ruleRows.map(mapAccessRuleSummary),
        resource: {
            id: resource.id,
            name: resource.name,
            type: resource.type,
            externalId: resource.externalId,
            sourceId: resource.sourceId,
        },
    };
}

function normalizeAccessRuleInput(rule: unknown, index: number): AccessRuleInput {
    if (!rule || typeof rule !== 'object') {
        throw new Error(`Access rule at index ${index} must be an object`);
    }

    const candidate = rule as Record<string, unknown>;
    const type = candidate.type;
    const id = candidate.id;
    const password = candidate.password;

    if (type !== 'public' && type !== 'password') {
        throw new Error(`Access rule at index ${index} has unsupported type`);
    }

    if (id !== undefined && typeof id !== 'string') {
        throw new Error(`Access rule at index ${index} has invalid id`);
    }

    if (password !== undefined && typeof password !== 'string') {
        throw new Error(`Access rule at index ${index} has invalid password`);
    }

    if (type === 'password' && (!id || password !== undefined) && !password?.trim()) {
        throw new Error(`Password rule at index ${index} requires a password`);
    }

    return {
        id,
        type,
        password: password?.trim(),
    };
}

function normalizeAccessRules(value: unknown): AccessRuleInput[] {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw new Error('accessRules must be an array');
    }

    return value.map((rule, index) => normalizeAccessRuleInput(rule, index));
}

async function syncAccessRules(
    tx: Database,
    linkId: string,
    submittedRules: AccessRuleInput[],
    existingRules: AccessRuleRow[],
): Promise<AccessRuleRow[]> {
    const existingById = new Map(existingRules.map((rule) => [rule.id, rule]));
    const keptRuleIds = new Set<string>();

    for (const rule of submittedRules) {
        if (rule.id) {
            const existingRule = existingById.get(rule.id);
            if (!existingRule || existingRule.linkId !== linkId) {
                throw new Error(`Unknown access rule id: ${rule.id}`);
            }

            if (existingRule.type !== rule.type) {
                throw new Error(`Access rule ${rule.id} cannot change type`);
            }

            keptRuleIds.add(rule.id);

            if (rule.type === 'password' && rule.password) {
                await tx.update(accessRules)
                    .set({
                        params: await hashPasswordRule(rule.password),
                        updatedAt: new Date(),
                    })
                    .where(eq(accessRules.id, rule.id));
            }

            continue;
        }

        await tx.insert(accessRules).values({
            linkId,
            type: rule.type,
            params: rule.type === 'password' ? await hashPasswordRule(rule.password ?? '') : null,
        });
    }

    const removableRuleIds = existingRules
        .filter((rule) => !keptRuleIds.has(rule.id))
        .map((rule) => rule.id);

    if (removableRuleIds.length > 0) {
        await tx.delete(accessRules).where(inArray(accessRules.id, removableRuleIds));
    }

    return tx.select().from(accessRules).where(eq(accessRules.linkId, linkId));
}

export const linksRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.get('/api/links', async () => {
        const db = await getDb();
        const linkRows: LinkListRow[] = await db.select({
            id: links.id,
            active: links.active,
            expiresAt: links.expiresAt,
            createdAt: links.createdAt,
            resource: {
                id: resources.id,
                name: resources.name,
                type: resources.type,
                externalId: resources.externalId,
                sourceId: resources.sourceId,
            },
        })
            .from(links)
            .innerJoin(resources, eq(links.resourceId, resources.id));

        if (linkRows.length === 0) {
            return [];
        }

        const dbAccessRules = await db.select()
            .from(accessRules)
            .where(inArray(accessRules.linkId, linkRows.map((link: LinkListRow) => link.id)));

        const groupedRules = new Map<string, AccessRuleRow[]>();
        for (const rule of dbAccessRules) {
            const current = groupedRules.get(rule.linkId) ?? [];
            current.push(rule);
            groupedRules.set(rule.linkId, current);
        }

        return linkRows.map((link: LinkListRow) => buildLinkResponse(link, link.resource, groupedRules.get(link.id) ?? []));
    });

    fastify.post('/api/links', async (request, reply) => {
        const { sourceId, externalId, type, name, active, expiresAt } = request.body as Record<string, unknown>;

        if (!sourceId || !externalId || !type || !name) {
            return reply.code(400).send({ error: 'Missing generic resource fields' });
        }

        let submittedRules: AccessRuleInput[];
        try {
            submittedRules = normalizeAccessRules((request.body as Record<string, unknown>).accessRules);
        } catch (error) {
            return reply.code(400).send({ error: error instanceof Error ? error.message : 'Invalid access rules' });
        }

        const db = await getDb();

        try {
            const created = await db.transaction(async (tx: Database) => {
                const [resource] = await tx.insert(resources).values({
                    sourceId: String(sourceId),
                    externalId: String(externalId),
                    type: String(type),
                    name: String(name),
                }).returning();

                const [link] = await tx.insert(links).values({
                    resourceId: resource.id,
                    active: typeof active === 'boolean' ? active : true,
                    expiresAt: expiresAt ? new Date(String(expiresAt)) : null,
                }).returning();

                const ruleRows = await syncAccessRules(tx, link.id, submittedRules, []);

                return buildLinkResponse(link, resource, ruleRows);
            });

            return reply.code(201).send(created);
        } catch (error) {
            return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to create link' });
        }
    });

    fastify.put('/api/links/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const { name, active, expiresAt } = request.body as Record<string, unknown>;

        const db = await getDb();
        const [existingLink] = await db.select().from(links).where(eq(links.id, id)).limit(1);

        if (!existingLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        const [existingResource] = await db.select().from(resources).where(eq(resources.id, existingLink.resourceId)).limit(1);
        if (!existingResource) {
            return reply.code(404).send({ error: 'Resource not found' });
        }

        const existingRuleRows = await db.select().from(accessRules).where(eq(accessRules.linkId, id));
        let submittedRules: AccessRuleInput[];
        try {
            submittedRules = (request.body as Record<string, unknown>).accessRules === undefined
                ? existingRuleRows.map(mapExistingRuleInput)
                : normalizeAccessRules((request.body as Record<string, unknown>).accessRules);
        } catch (error) {
            return reply.code(400).send({ error: error instanceof Error ? error.message : 'Invalid access rules' });
        }

        try {
            const updated = await db.transaction(async (tx: Database) => {
                const [updatedLink] = await tx.update(links).set({
                    active: typeof active === 'boolean' ? active : existingLink.active,
                    expiresAt: expiresAt === undefined
                        ? existingLink.expiresAt
                        : (expiresAt ? new Date(String(expiresAt)) : null),
                    updatedAt: new Date(),
                }).where(eq(links.id, id)).returning();

                const updatedResource = name
                    ? (await tx.update(resources).set({
                        name: String(name),
                        updatedAt: new Date(),
                    }).where(eq(resources.id, existingResource.id)).returning())[0]
                    : existingResource;

                const ruleRows = await syncAccessRules(tx, id, submittedRules, existingRuleRows);

                return buildLinkResponse(updatedLink, updatedResource, ruleRows);
            });

            return reply.code(200).send(updated);
        } catch (error) {
            return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to update link' });
        }
    });

    fastify.delete('/api/links/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const db = await getDb();

        const existingLink = await db.select().from(links).where(eq(links.id, id)).limit(1);

        if (!existingLink.length) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        await db.delete(resources).where(eq(resources.id, existingLink[0].resourceId));

        return reply.code(204).send();
    });
};
