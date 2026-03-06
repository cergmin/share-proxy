import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // Allow vitest to resolve .js imports to .ts source files (ESM compat)
        extensions: ['.ts', '.js'],
    },
    test: {
        environment: 'node',
        globals: true,
    },
});
