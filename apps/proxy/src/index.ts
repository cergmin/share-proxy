import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProxyApp } from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const port = Number(process.env.PROXY_PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

const start = async (): Promise<void> => {
    const app = await buildProxyApp();

    try {
        await app.listen({ port, host });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};

void start();
