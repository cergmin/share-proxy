import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: any = null;
let dbInitPromise: Promise<any> | null = null;

export const getDb = async () => {
    if (dbInstance) return dbInstance;
    if (dbInitPromise) return dbInitPromise;

    dbInitPromise = (async () => {
        const migrationsFolder = path.resolve(__dirname, '../../../packages/db/drizzle');
        const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/share_proxy';

        const client = postgres(connectionString);
        dbInstance = drizzlePg(client, { schema });
        await migratePg(dbInstance, { migrationsFolder });

        return dbInstance;
    })().catch((error) => {
        dbInitPromise = null;
        dbInstance = null;
        throw error;
    });

    return dbInitPromise;
};

export * from './schema.js';
