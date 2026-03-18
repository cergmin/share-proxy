import type { FastifyInstance } from 'fastify';
import {
    buildClearedAccessCookie,
    getPasswordRules,
    hasPublicAccess,
    hasValidAccessCookie,
    issueAccessCookie,
    matchesAnyPassword,
} from '../auth.js';
import { sendHtml } from '../http.js';
import { isLinkUnavailable, resolveLink } from '../links.js';
import { renderMessagePage, renderPasswordPage, renderViewerPage } from '../viewer-pages.js';

export function registerViewerRoutes(app: FastifyInstance): void {
    app.get('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return sendHtml(reply, renderMessagePage('Link not found', 'This video link does not exist.'), 404);
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return sendHtml(reply, renderMessagePage('Link unavailable', 'This video link is inactive or expired.'), 410);
        }

        if (resolvedLink.accessRules.length === 0) {
            return sendHtml(reply, renderMessagePage('Access denied', 'This link has no access rules and cannot be opened.'), 403);
        }

        if (hasPublicAccess(resolvedLink.accessRules) || hasValidAccessCookie(request, id)) {
            return sendHtml(reply, await renderViewerPage(resolvedLink, id));
        }

        return sendHtml(reply, renderPasswordPage(resolvedLink));
    });

    app.post('/:id/unlock', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return sendHtml(reply, renderMessagePage('Link not found', 'This video link does not exist.'), 404);
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return sendHtml(reply, renderMessagePage('Link unavailable', 'This video link is inactive or expired.'), 410);
        }

        const passwordRules = getPasswordRules(resolvedLink.accessRules);
        if (passwordRules.length === 0) {
            return sendHtml(reply, renderMessagePage('Access denied', 'Password unlock is not configured for this link.'), 403);
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const password = typeof body.password === 'string' ? body.password : '';

        if (!password || !(await matchesAnyPassword(password, passwordRules))) {
            reply.header('set-cookie', buildClearedAccessCookie(id));
            return sendHtml(reply, renderPasswordPage(resolvedLink, 'Incorrect password. Try again.'), 401);
        }

        reply.header('set-cookie', issueAccessCookie(id));
        return reply.redirect(`/${id}`);
    });
}
