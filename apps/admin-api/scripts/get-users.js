import { getDb, user } from '@share-proxy/db';

async function run() {
    const db = await getDb();
    const users = await db.select().from(user);
    console.log(users);
    process.exit(0);
}

run();
