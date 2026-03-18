import { accessRules, getDb, links, resources, sources } from '@share-proxy/db';
import { eq } from 'drizzle-orm';
import { createLruCache } from './cache.js';
import type { LinkRow, ResolvedLink } from './proxy-types.js';

const RESOLVED_LINK_CACHE_TTL_MS = 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resolvedLinkCache = createLruCache<string, ResolvedLink | null>({
    maxSize: 100,
});

export function isLinkUnavailable(link: LinkRow, now = Date.now()): boolean {
    return !link.active || (link.expiresAt ? link.expiresAt.getTime() <= now : false);
}

export function clearResolvedLinkCache(): void {
    resolvedLinkCache.clear();
}

export async function resolveLink(linkId: string): Promise<ResolvedLink | null> {
    if (!UUID_PATTERN.test(linkId)) {
        return null;
    }

    if (resolvedLinkCache.has(linkId)) {
        return resolvedLinkCache.get(linkId) ?? null;
    }

    const db = await getDb();
    let resolved;

    try {
        [resolved] = await db
            .select({
                link: links,
                resource: resources,
                source: sources,
            })
            .from(links)
            .innerJoin(resources, eq(links.resourceId, resources.id))
            .innerJoin(sources, eq(resources.sourceId, sources.id))
            .where(eq(links.id, linkId))
            .limit(1);
    } catch (error: unknown) {
        if (
            typeof error === 'object'
            && error !== null
            && 'code' in error
            && error.code === '22P02'
        ) {
            resolvedLinkCache.set(linkId, null, { lifetimeMs: RESOLVED_LINK_CACHE_TTL_MS });
            return null;
        }

        throw error;
    }

    if (!resolved) {
        resolvedLinkCache.set(linkId, null, { lifetimeMs: RESOLVED_LINK_CACHE_TTL_MS });
        return null;
    }

    const ruleRows = await db.select().from(accessRules).where(eq(accessRules.linkId, linkId));

    const resolvedLink = {
        link: resolved.link,
        resource: resolved.resource,
        source: resolved.source,
        accessRules: ruleRows,
    };

    resolvedLinkCache.set(linkId, resolvedLink, { lifetimeMs: RESOLVED_LINK_CACHE_TTL_MS });
    return resolvedLink;
}
