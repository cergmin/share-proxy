import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
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

const postgresDataRoot = resolve(rootDir, mergedEnv.POSTGRES_DATA_DIR || './storage/db');
const postgresMajor = mergedEnv.POSTGRES_MAJOR || '17';
const postgresDataDir = resolve(postgresDataRoot, postgresMajor, 'docker');
const postgresBackupRoot = resolve(postgresDataRoot, '..', `${basename(postgresDataRoot)}-backups`);

function hasLegacyPostgresLayout(dirPath) {
    return ['PG_VERSION', 'base', 'global'].some((entry) => existsSync(resolve(dirPath, entry)));
}

function hasExpectedPostgresLayout(dirPath) {
    return ['PG_VERSION', 'base', 'global'].some((entry) => existsSync(resolve(dirPath, entry)));
}

function readPgVersion(dirPath) {
    const versionPath = resolve(dirPath, 'PG_VERSION');
    if (!existsSync(versionPath)) {
        return null;
    }
    return readFileSync(versionPath, 'utf8').trim();
}

function migrateLegacyPostgresLayout(rootPath, targetPath) {
    const legacyEntries = readdirSync(rootPath).filter((entry) => entry !== '18');
    if (legacyEntries.length === 0) {
        return;
    }

    if (existsSync(targetPath) && readdirSync(targetPath).length > 0) {
        throw new Error(
            `POSTGRES_DATA_DIR at ${rootPath} contains both legacy root-level postgres files and ${targetPath}. ` +
                'Please clean up the directory manually before continuing.',
        );
    }

    mkdirSync(targetPath, { recursive: true });
    for (const entry of legacyEntries) {
        renameSync(resolve(rootPath, entry), resolve(targetPath, entry));
    }
}

function migrateVersionedPostgresLayout(rootPath, desiredMajor, targetPath) {
    if (hasExpectedPostgresLayout(targetPath)) {
        return;
    }

    const versionDirs = readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((entry) => entry !== desiredMajor && /^\d+$/.test(entry));

    for (const versionDir of versionDirs) {
        const candidatePath = resolve(rootPath, versionDir, 'docker');
        if (readPgVersion(candidatePath) !== desiredMajor) {
            continue;
        }

        mkdirSync(targetPath, { recursive: true });
        for (const entry of readdirSync(candidatePath)) {
            renameSync(resolve(candidatePath, entry), resolve(targetPath, entry));
        }
        return;
    }
}

function relocateBackupDirs(rootPath, backupRoot) {
    mkdirSync(backupRoot, { recursive: true });

    const backupDirs = readdirSync(rootPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'))
        .map((entry) => entry.name);

    for (const backupDir of backupDirs) {
        const source = resolve(rootPath, backupDir);
        const target = resolve(backupRoot, backupDir);
        if (!existsSync(target)) {
            renameSync(source, target);
            continue;
        }

        renameSync(source, resolve(backupRoot, `${backupDir}-${Date.now()}`));
    }
}

mkdirSync(postgresDataRoot, { recursive: true });
relocateBackupDirs(postgresDataRoot, postgresBackupRoot);

migrateVersionedPostgresLayout(postgresDataRoot, postgresMajor, postgresDataDir);

if (hasLegacyPostgresLayout(postgresDataRoot) && !hasExpectedPostgresLayout(postgresDataDir)) {
    migrateLegacyPostgresLayout(postgresDataRoot, postgresDataDir);
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
    const versionRoot = resolve(postgresDataRoot, postgresMajor);
    const backupDir = resolve(postgresBackupRoot, `backup-${postgresMajor}-${Date.now()}`);

    spawnSync('docker', ['compose', 'rm', '-sf', 'postgres'], {
        cwd: rootDir,
        env: mergedEnv,
        stdio: 'inherit',
    });

    if (existsSync(versionRoot)) {
        mkdirSync(postgresBackupRoot, { recursive: true });
        renameSync(versionRoot, backupDir);
    }

    mkdirSync(postgresDataDir, { recursive: true });
    console.warn(
        `[ensure-postgres] Archived incompatible PostgreSQL data directory to ${backupDir} and will initialize a fresh cluster.`,
    );
}

let compose = startPostgres();

if (compose.status !== 0) {
    const logs = readPostgresLogs();
    if (isIncompatibleDataDir(logs) && hasExpectedPostgresLayout(postgresDataDir)) {
        archiveIncompatibleDataDir();
        compose = startPostgres();
    }
}

if (compose.status !== 0) {
    process.exit(compose.status ?? 1);
}
