import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export type AccessRuleType = 'public' | 'password';

export interface PasswordRuleParams {
    algo: 'scrypt';
    hash: string;
    salt: string;
}

export interface AccessRuleInput {
    id?: string;
    type: AccessRuleType;
    password?: string;
}

export interface AccessRuleSummary {
    id: string;
    type: AccessRuleType;
}

export interface LinkAccessTokenPayload {
    exp: number;
    linkId: string;
}

export interface SealedProxyTokenPayload<T = unknown> {
    data: T;
    exp: number;
    linkId: string;
    purpose: string;
}

function toBase64Url(value: Buffer | string): string {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64');
}

export function getProxyOrigin(env: NodeJS.ProcessEnv = process.env): string {
    if (env.PROXY_ORIGIN) {
        return env.PROXY_ORIGIN.replace(/\/$/, '');
    }

    const port = env.PROXY_PORT ?? '3001';
    return `http://localhost:${port}`;
}

export function buildViewerUrl(linkId: string, env: NodeJS.ProcessEnv = process.env): string {
    return `${getProxyOrigin(env)}/${linkId}`;
}

export function getLinkAccessCookieName(linkId: string): string {
    return `share_proxy_link_${linkId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export async function hashPasswordRule(password: string): Promise<PasswordRuleParams> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64) as Buffer;

    return {
        algo: 'scrypt',
        hash: derivedKey.toString('hex'),
        salt,
    };
}

export async function verifyPasswordRule(
    password: string,
    params: unknown,
): Promise<boolean> {
    if (!params || typeof params !== 'object') {
        return false;
    }

    const candidate = params as Partial<PasswordRuleParams>;
    if (candidate.algo !== 'scrypt' || !candidate.hash || !candidate.salt) {
        return false;
    }

    const expectedHash = Buffer.from(candidate.hash, 'hex');
    const actualHash = await scrypt(password, candidate.salt, expectedHash.length) as Buffer;

    if (expectedHash.length !== actualHash.length) {
        return false;
    }

    return timingSafeEqual(expectedHash, actualHash);
}

export function parseBasicAuthHeader(header: string | undefined): { password: string; username: string } | null {
    if (!header?.startsWith('Basic ')) {
        return null;
    }

    try {
        const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
        const separatorIndex = decoded.indexOf(':');

        if (separatorIndex === -1) {
            return null;
        }

        return {
            username: decoded.slice(0, separatorIndex),
            password: decoded.slice(separatorIndex + 1),
        };
    } catch {
        return null;
    }
}

export function createSignedLinkAccessToken(
    payload: LinkAccessTokenPayload,
    secret: string,
): string {
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(encodedPayload).digest();
    return `${encodedPayload}.${toBase64Url(signature)}`;
}

export function verifySignedLinkAccessToken(
    token: string,
    secret: string,
    expectedLinkId: string,
    now = Date.now(),
): boolean {
    const [encodedPayload, encodedSignature] = token.split('.');
    if (!encodedPayload || !encodedSignature) {
        return false;
    }

    const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();
    const actualSignature = fromBase64Url(encodedSignature);

    if (expectedSignature.length !== actualSignature.length) {
        return false;
    }

    if (!timingSafeEqual(expectedSignature, actualSignature)) {
        return false;
    }

    try {
        const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as LinkAccessTokenPayload;
        return payload.linkId === expectedLinkId && payload.exp > now;
    } catch {
        return false;
    }
}

function deriveSealedTokenKey(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
}

export function createSealedProxyToken<T>(
    payload: SealedProxyTokenPayload<T>,
    secret: string,
): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveSealedTokenKey(secret), iv);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${toBase64Url(iv)}.${toBase64Url(ciphertext)}.${toBase64Url(authTag)}`;
}

export function openSealedProxyToken<T>(
    token: string,
    secret: string,
    options: { expectedLinkId: string; expectedPurpose: string; now?: number },
): SealedProxyTokenPayload<T> | null {
    const [encodedIv, encodedCiphertext, encodedAuthTag] = token.split('.');
    if (!encodedIv || !encodedCiphertext || !encodedAuthTag) {
        return null;
    }

    try {
        const decipher = createDecipheriv(
            'aes-256-gcm',
            deriveSealedTokenKey(secret),
            fromBase64Url(encodedIv),
        );
        decipher.setAuthTag(fromBase64Url(encodedAuthTag));
        const plaintext = Buffer.concat([
            decipher.update(fromBase64Url(encodedCiphertext)),
            decipher.final(),
        ]);
        const payload = JSON.parse(plaintext.toString('utf8')) as SealedProxyTokenPayload<T>;

        if (
            payload.linkId !== options.expectedLinkId
            || payload.purpose !== options.expectedPurpose
            || payload.exp <= (options.now ?? Date.now())
        ) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}
