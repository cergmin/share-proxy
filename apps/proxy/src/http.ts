import type { FastifyReply } from 'fastify';

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function parseCookies(header: string | undefined): Record<string, string> {
    if (!header) {
        return {};
    }

    return header.split(';').reduce<Record<string, string>>((result, chunk) => {
        const separatorIndex = chunk.indexOf('=');
        if (separatorIndex === -1) {
            return result;
        }

        const key = chunk.slice(0, separatorIndex).trim();
        const value = chunk.slice(separatorIndex + 1).trim();
        try {
            result[key] = decodeURIComponent(value);
        } catch {
            // Ignore malformed cookie values and continue parsing the rest.
        }
        return result;
    }, {});
}

export function parseRangeHeader(header: string | undefined): { end?: number; start: number } | undefined {
    if (!header) {
        return undefined;
    }

    const match = /^bytes=(\d+)-(\d*)$/i.exec(header.trim());
    if (!match) {
        return undefined;
    }

    return {
        start: Number(match[1]),
        end: match[2] ? Number(match[2]) : undefined,
    };
}

export function sendHtml(reply: FastifyReply, html: string, statusCode = 200): FastifyReply {
    return reply.code(statusCode).header('content-type', 'text/html; charset=utf-8').send(html);
}
