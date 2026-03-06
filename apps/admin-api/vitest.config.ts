import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        extensions: ['.ts', '.js'],
    },
    test: {
        environment: 'node',
        globals: true,
        // Run in a separate process per file to avoid shared DB singleton
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: false,
            },
        },
    },
});
