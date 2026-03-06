import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePGLite } from 'drizzle-orm/pglite';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import { migrate as migratePGLite } from 'drizzle-orm/pglite/migrator';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: any = null;

export const getDb = async () => {
    if (dbInstance) return dbInstance;

    const dbType = process.env.DB_TYPE || 'pglite';
    const migrationsFolder = path.resolve(__dirname, '../../../packages/db/drizzle');

    if (dbType === 'postgres') {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL is not set when DB_TYPE=postgres');
        }
        const client = postgres(connectionString);
        dbInstance = drizzlePg(client, { schema });
        await migratePg(dbInstance, { migrationsFolder });
    } else {
        // Default to pglite
        let dir = process.env.PGLITE_DIR || 'memory://';
        if (dir !== 'memory://' && !path.isAbsolute(dir)) {
            // __dirname will be packages/db/dist, so root is ../../../
            dir = path.resolve(__dirname, '../../../', dir);
        }

        const client = new PGlite(dir);
        await client.waitReady;
        dbInstance = drizzlePGLite(client, { schema });
        await migratePGLite(dbInstance, { migrationsFolder });
    }

    return dbInstance;
};

export * from './schema.js';
