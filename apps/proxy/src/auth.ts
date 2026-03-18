import type { FastifyReply, FastifyRequest } from 'fastify';
import {
    createSignedLinkAccessToken,
    getLinkAccessCookieName,
    parseBasicAuthHeader,
    verifyPasswordRule,
    verifySignedLinkAccessToken,
} from '@share-proxy/core';
import { parseCookies } from './http.js';
import type { AccessRuleRow, ResolvedLink } from './proxy-types.js';

const ACCESS_COOKIE_TTL_SECONDS = 60 * 60 * 6;

export function hasPublicAccess(ruleRows: AccessRuleRow[]): boolean {
    return ruleRows.some((rule) => rule.type === 'public');
}

export function getPasswordRules(ruleRows: AccessRuleRow[]): AccessRuleRow[] {
    return ruleRows.filter((rule) => rule.type === 'password');
}

function getSecret(): string {
    return process.env.SECRET ?? 'changeme';
}

export function buildAccessCookie(linkId: string, value: string): string {
    const cookieParts = [
        `${getLinkAccessCookieName(linkId)}=${encodeURIComponent(value)}`,
        `Path=/${linkId}`,
        `Max-Age=${ACCESS_COOKIE_TTL_SECONDS}`,
        'HttpOnly',
        'SameSite=Lax',
    ];

    if ((process.env.PROXY_ORIGIN ?? '').startsWith('https://')) {
        cookieParts.push('Secure');
    }

    return cookieParts.join('; ');
}

export function buildClearedAccessCookie(linkId: string): string {
    return [
        `${getLinkAccessCookieName(linkId)}=`,
        `Path=/${linkId}`,
        'Max-Age=0',
        'HttpOnly',
        'SameSite=Lax',
    ].join('; ');
}

export function hasValidAccessCookie(request: FastifyRequest, linkId: string): boolean {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[getLinkAccessCookieName(linkId)];

    if (!token) {
        return false;
    }

    return verifySignedLinkAccessToken(token, getSecret(), linkId);
}

export async function matchesAnyPassword(password: string, ruleRows: AccessRuleRow[]): Promise<boolean> {
    for (const rule of ruleRows) {
        if (await verifyPasswordRule(password, rule.params)) {
            return true;
        }
    }

    return false;
}

export async function authorizeStream(request: FastifyRequest, resolvedLink: ResolvedLink): Promise<boolean> {
    if (hasPublicAccess(resolvedLink.accessRules)) {
        return true;
    }

    if (hasValidAccessCookie(request, resolvedLink.link.id)) {
        return true;
    }

    const passwordRules = getPasswordRules(resolvedLink.accessRules);
    if (passwordRules.length === 0) {
        return false;
    }

    const credentials = parseBasicAuthHeader(request.headers.authorization);
    if (!credentials) {
        return false;
    }

    return matchesAnyPassword(credentials.password, passwordRules);
}

export function issueAccessCookie(linkId: string): string {
    const token = createSignedLinkAccessToken({
        linkId,
        exp: Date.now() + (ACCESS_COOKIE_TTL_SECONDS * 1000),
    }, getSecret());

    return buildAccessCookie(linkId, token);
}

export function sendBasicAuthChallenge(reply: FastifyReply): void {
    reply.header('WWW-Authenticate', 'Basic realm="Share Proxy"');
}
