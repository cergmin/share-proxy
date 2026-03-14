import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
    schema: './src/schema.ts',
    out: './drizzle',
    driver: 'pg',
    dbCredentials: {
        // @ts-ignore - drizzle-kit 0.20.14 might not have typed the url properly for pg
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/share_proxy',
    },
});
