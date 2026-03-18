import { describe, expect, it } from 'vitest';
import { createLruCache } from '../src/cache.js';

describe('createLruCache', () => {
    it('evicts the least recently used entry when the cache exceeds maxSize', () => {
        const cache = createLruCache<string, number>({ maxSize: 2 });

        cache.set('a', 1);
        cache.set('b', 2);
        expect(cache.get('a')).toBe(1);

        cache.set('c', 3);

        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false);
        expect(cache.get('c')).toBe(3);
    });

    it('invalidates expired entries on access', () => {
        let currentTime = 1_000;
        const cache = createLruCache<string, string>({
            maxSize: 2,
            now: () => currentTime,
        });

        cache.set('token', 'value', { lifetimeMs: 50 });
        expect(cache.get('token')).toBe('value');

        currentTime = 1_051;

        expect(cache.has('token')).toBe(false);
        expect(cache.get('token')).toBeUndefined();
    });

    it('drops entries immediately when their lifetime is already expired at set time', () => {
        const cache = createLruCache<string, string>({
            maxSize: 1,
            now: () => 5_000,
        });

        cache.set('stale', 'value', { lifetimeMs: 0 });

        expect(cache.has('stale')).toBe(false);
        expect(cache.get('stale')).toBeUndefined();
    });
});
