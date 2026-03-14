import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distPath = resolve(process.cwd(), 'dist/index.js');
const source = readFileSync(distPath, 'utf8');

if (source.includes('from "shaka-player"') || source.includes("from 'shaka-player'")) {
    throw new Error('video-player dist still contains a bare shaka-player import');
}

if (source.includes('from "zod"') || source.includes("from 'zod'")) {
    throw new Error('video-player dist still contains a bare zod import');
}

console.log('video-player dist bundles shaka-player and zod locally');
