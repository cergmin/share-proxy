import { defineConfig } from 'tsup';

export default defineConfig({
    bundle: true,
    clean: true,
    dts: true,
    entry: ['src/index.ts'],
    format: ['esm'],
    noExternal: ['shaka-player', 'zod'],
    target: 'es2020',
});
