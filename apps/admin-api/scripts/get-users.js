import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
    const dbDir = resolve(__dirname, '../../storage/db');
    const db = new PGlite(dbDir);
    const users = await db.query('SELECT * FROM "user"');
    console.log(users.rows);
    process.exit(0);
}

run();
