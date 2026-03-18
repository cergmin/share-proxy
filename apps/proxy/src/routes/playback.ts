import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { JellyfinAdapter } from '@share-proxy/adapters';
import { openSealedProxyToken } from '@share-proxy/core';
import { authorizeStream, sendBasicAuthChallenge } from '../auth.js';
import { parseRangeHeader } from '../http.js';
import {
    buildJellyfinAdaptiveMasterManifest,
    buildPreviewImageUrl,
    fetchJellyfinResponse,
    getCachedJellyfinTrickplayEntries,
    isAllowedJellyfinTarget,
    resolveJellyfinConfigForSource,
    resolveJellyfinPlaybackContext,
    rewriteManifestBody,
} from '../jellyfin.js';
import { isLinkUnavailable, resolveLink } from '../links.js';
import type { MediaProxyTokenData } from '../proxy-types.js';

export function registerPlaybackRoutes(app: FastifyInstance): void {
    app.get('/:id/manifest.m3u8', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            sendBasicAuthChallenge(reply);
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(404).send({ error: 'Adaptive manifest unsupported' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        const playbackContext = await resolveJellyfinPlaybackContext(jellyfinConfig, resolvedLink.resource.externalId);
        try {
            const manifest = await buildJellyfinAdaptiveMasterManifest(
                jellyfinConfig,
                id,
                resolvedLink.resource.externalId,
                playbackContext,
            );
            reply.header('content-type', 'application/vnd.apple.mpegurl');
            return reply.send(manifest);
        } catch (error) {
            request.log.error(error);
            return reply.code(502).send({ error: 'Adaptive manifest unavailable' });
        }
    });

    app.get('/:id/media/*', async (request, reply) => {
        const { id } = request.params as { id: string };
        const token = (request.params as { '*': string })['*'];
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            sendBasicAuthChallenge(reply);
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(400).send({ error: 'Invalid media target' });
        }

        const sealedToken = openSealedProxyToken<MediaProxyTokenData>(token, process.env.SECRET ?? 'changeme', {
            expectedLinkId: id,
            expectedPurpose: 'media',
        });
        const target = sealedToken?.data.target;

        if (!target) {
            return reply.code(400).send({ error: 'Invalid media target' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        if (!isAllowedJellyfinTarget(target, jellyfinConfig)) {
            return reply.code(400).send({ error: 'Invalid upstream target' });
        }

        const response = await fetchJellyfinResponse(jellyfinConfig, target, {
            headers: request.headers.range ? { Range: request.headers.range } : undefined,
        });
        if (!response.ok || !response.body) {
            return reply.code(response.status || 502).send({ error: `Upstream media error: ${response.statusText}` });
        }

        reply.code(response.status);
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        reply.header('content-type', contentType);

        const cacheControl = response.headers.get('cache-control');
        if (cacheControl) {
            reply.header('cache-control', cacheControl);
        }

        if (contentType.includes('mpegurl') || target.includes('.m3u8')) {
            const manifest = await response.text();
            return reply.send(rewriteManifestBody(manifest, target, id));
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            reply.header('content-length', contentLength);
        }

        const acceptRanges = response.headers.get('accept-ranges');
        if (acceptRanges) {
            reply.header('accept-ranges', acceptRanges);
        }

        const contentRange = response.headers.get('content-range');
        if (contentRange) {
            reply.header('content-range', contentRange);
        }

        return reply.send(Readable.fromWeb(response.body as never));
    });

    app.get('/:id/preview-tracks.json', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            sendBasicAuthChallenge(reply);
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.send({ entries: [] });
        }

        const entries = await getCachedJellyfinTrickplayEntries(resolvedLink.source, resolvedLink.resource.externalId);
        return reply.send({
            entries: entries.map(({ upstreamUrl, sheetIndex, ...entry }) => ({
                ...entry,
                url: buildPreviewImageUrl(id, sheetIndex),
            })),
        });
    });

    app.get('/:id/preview/:sheetIndex.jpg', async (request, reply) => {
        const { id, sheetIndex: sheetIndexParam } = request.params as { id: string; sheetIndex: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (!(await authorizeStream(request, resolvedLink))) {
            sendBasicAuthChallenge(reply);
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(404).send({ error: 'Preview unavailable' });
        }

        const sheetIndex = Number(sheetIndexParam);
        if (!Number.isInteger(sheetIndex) || sheetIndex < 0) {
            return reply.code(400).send({ error: 'Invalid preview image' });
        }

        const entries = await getCachedJellyfinTrickplayEntries(resolvedLink.source, resolvedLink.resource.externalId);
        const previewSheet = entries.find((entry) => entry.sheetIndex === sheetIndex);

        if (!previewSheet) {
            return reply.code(404).send({ error: 'Preview unavailable' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        const response = await fetchJellyfinResponse(jellyfinConfig, previewSheet.upstreamUrl);
        if (!response.ok || !response.body) {
            return reply.code(response.status || 502).send({ error: 'Preview unavailable' });
        }

        reply.code(response.status);
        reply.header('content-type', response.headers.get('content-type') ?? 'image/jpeg');
        const cacheControl = response.headers.get('cache-control');
        if (cacheControl) {
            reply.header('cache-control', cacheControl);
        }

        return reply.send(Readable.fromWeb(response.body as never));
    });

    app.get('/:id/stream', async (request, reply) => {
        const { id } = request.params as { id: string };
        const resolvedLink = await resolveLink(id);

        if (!resolvedLink) {
            return reply.code(404).send({ error: 'Link not found' });
        }

        if (isLinkUnavailable(resolvedLink.link)) {
            return reply.code(410).send({ error: 'Link unavailable' });
        }

        if (resolvedLink.accessRules.length === 0) {
            return reply.code(403).send({ error: 'Access denied' });
        }

        const isAuthorized = await authorizeStream(request, resolvedLink);
        if (!isAuthorized) {
            sendBasicAuthChallenge(reply);
            return reply.code(401).send({ error: 'Authentication required' });
        }

        if (resolvedLink.source.type !== 'jellyfin') {
            return reply.code(400).send({ error: 'Unsupported source type' });
        }

        const jellyfinConfig = await resolveJellyfinConfigForSource(resolvedLink.source);
        const adapter = new JellyfinAdapter(jellyfinConfig);

        const range = parseRangeHeader(request.headers.range);
        const streamResult = await adapter.getFileStream(resolvedLink.resource.externalId, range);

        reply.code(streamResult.statusCode);
        reply.header('Content-Type', streamResult.mimeType);
        reply.header('Accept-Ranges', streamResult.acceptRanges);

        if (streamResult.contentLength > 0) {
            reply.header('Content-Length', String(streamResult.contentLength));
        }

        if (streamResult.contentRange) {
            reply.header('Content-Range', streamResult.contentRange);
        }

        return reply.send(streamResult.stream);
    });
}
