/**
 * Utility to reset all application tables between tests.
 * Deletes in dependency order (children before parents).
 */
import { getDb, links, resources, sources } from '@share-proxy/db';

export async function clearDatabase() {
    const db = await getDb();
    // Delete in order: links first (FK → resources), then resources (FK → sources), then sources
    await db.delete(links);
    await db.delete(resources);
    await db.delete(sources);
}
