import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [, , portArg = '6017', rootArg = 'storybook-static'] = process.argv;
const port = Number.parseInt(portArg, 10);
const root = path.resolve(process.cwd(), rootArg);

const mimeTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.map', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.woff', 'font/woff'],
    ['.woff2', 'font/woff2'],
]);

function getContentType(filePath) {
    return mimeTypes.get(path.extname(filePath)) ?? 'application/octet-stream';
}

function resolveFile(urlPath) {
    const cleanPath = decodeURIComponent((urlPath || '/').split('?')[0]);
    const relativePath = cleanPath === '/' ? '/index.html' : cleanPath;
    return path.join(root, relativePath);
}

const server = http.createServer(async (request, response) => {
    const candidate = resolveFile(request.url);
    const filePath = path.extname(candidate) ? candidate : path.join(candidate, 'index.html');

    try {
        const body = await readFile(filePath);
        response.writeHead(200, { 'content-type': getContentType(filePath) });
        response.end(body);
    } catch {
        try {
            const fallback = path.join(root, 'index.html');
            const body = await readFile(fallback);
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end(body);
        } catch {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end('Not found');
        }
    }
});

server.listen(port, '127.0.0.1', () => {
    console.log(`storybook-static server listening on http://127.0.0.1:${port}`);
});
