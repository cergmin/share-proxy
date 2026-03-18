import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const envPath = resolve(rootDir, '.env');

function readEnvFile(filePath) {
    if (!existsSync(filePath)) {
        return {};
    }

    const env = {};
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex === -1) continue;
        const key = trimmed.slice(0, equalsIndex).trim();
        const value = trimmed.slice(equalsIndex + 1).trim();
        env[key] = value.replace(/^['"]|['"]$/g, '');
    }
    return env;
}

const fileEnv = readEnvFile(envPath);
const mergedEnv = {
    ...process.env,
    ...fileEnv,
};

const postgresDataDir = resolve(rootDir, mergedEnv.POSTGRES_DATA_DIR || './storage/db');
const postgresBackupRoot = resolve(dirname(postgresDataDir), `${basename(postgresDataDir)}-backups`);

function hasPostgresClusterLayout(dirPath) {
    return ['PG_VERSION', 'base', 'global'].some((entry) => existsSync(resolve(dirPath, entry)));
}

mkdirSync(postgresDataDir, { recursive: true });

function getDatabaseEndpoint(databaseUrl) {
    if (!databaseUrl) {
        return null;
    }

    try {
        const parsed = new URL(databaseUrl);
        if (!parsed.hostname) {
            return null;
        }

        return {
            host: parsed.hostname,
            port: Number.parseInt(parsed.port || '5432', 10),
        };
    } catch {
        return null;
    }
}

async function canReachDatabase(databaseUrl) {
    const endpoint = getDatabaseEndpoint(databaseUrl);
    if (!endpoint) {
        return false;
    }

    return new Promise((resolve) => {
        const socket = createConnection({
            host: endpoint.host,
            port: endpoint.port,
        });

        let settled = false;
        const finish = (result) => {
            if (settled) {
                return;
            }

            settled = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(800);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });
}

if (await canReachDatabase(mergedEnv.DATABASE_URL)) {
    const endpoint = getDatabaseEndpoint(mergedEnv.DATABASE_URL);
    console.log(
        `[ensure-postgres] Using reachable PostgreSQL at ${endpoint?.host ?? 'unknown'}:${endpoint?.port ?? 5432}; Docker startup skipped.`,
    );
    process.exit(0);
}

function startPostgres() {
    return spawnSync('docker', ['compose', 'up', '-d', '--wait', 'postgres'], {
        cwd: rootDir,
        env: mergedEnv,
        stdio: 'inherit',
    });
}

function readPostgresLogs() {
    const result = spawnSync('docker', ['compose', 'logs', '--no-color', 'postgres'], {
        cwd: rootDir,
        env: mergedEnv,
        encoding: 'utf8',
    });

    return result.stdout || result.stderr || '';
}

function isIncompatibleDataDir(logs) {
    return (
        logs.includes('database files are incompatible with server') ||
        logs.includes('initialized without USE_FLOAT8_BYVAL') ||
        logs.includes('initialized by PostgreSQL version')
    );
}

function archiveIncompatibleDataDir() {
    const backupDir = resolve(postgresBackupRoot, `backup-${Date.now()}`);

    spawnSync('docker', ['compose', 'rm', '-sf', 'postgres'], {
        cwd: rootDir,
        env: mergedEnv,
        stdio: 'inherit',
    });

    if (existsSync(postgresDataDir)) {
        mkdirSync(postgresBackupRoot, { recursive: true });
        renameSync(postgresDataDir, backupDir);
    }

    mkdirSync(postgresDataDir, { recursive: true });
    console.warn(
        `[ensure-postgres] Archived incompatible PostgreSQL data directory to ${backupDir} and will initialize a fresh cluster.`,
    );
}

let compose = startPostgres();

if (compose.status !== 0) {
    const logs = readPostgresLogs();
    if (isIncompatibleDataDir(logs) && hasPostgresClusterLayout(postgresDataDir)) {
        archiveIncompatibleDataDir();
        compose = startPostgres();
    }
}

if (compose.status !== 0) {
    process.exit(compose.status ?? 1);
}
