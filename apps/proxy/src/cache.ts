interface CacheEntry<TValue> {
    expiresAt?: number;
    value: TValue;
}

interface CreateLruCacheOptions {
    maxSize: number;
    now?: () => number;
}

interface SetCacheValueOptions {
    lifetimeMs?: number;
}

export interface LruCache<TKey, TValue> {
    clear(): void;
    delete(key: TKey): boolean;
    get(key: TKey): TValue | undefined;
    has(key: TKey): boolean;
    set(key: TKey, value: TValue, options?: SetCacheValueOptions): void;
}

export function createLruCache<TKey, TValue>(
    options: CreateLruCacheOptions,
): LruCache<TKey, TValue> {
    if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
        throw new Error('LRU cache maxSize must be a positive integer');
    }

    const now = options.now ?? (() => Date.now());
    const entries = new Map<TKey, CacheEntry<TValue>>();

    const isExpired = (entry: CacheEntry<TValue>): boolean => (
        typeof entry.expiresAt === 'number' && entry.expiresAt <= now()
    );

    const pruneIfExpired = (key: TKey, entry: CacheEntry<TValue> | undefined): boolean => {
        if (!entry) {
            return false;
        }

        if (!isExpired(entry)) {
            return false;
        }

        entries.delete(key);
        return true;
    };

    const trimToMaxSize = () => {
        while (entries.size > options.maxSize) {
            const oldestKey = entries.keys().next().value;
            if (oldestKey === undefined) {
                return;
            }

            entries.delete(oldestKey);
        }
    };

    return {
        clear() {
            entries.clear();
        },
        delete(key) {
            return entries.delete(key);
        },
        get(key) {
            const entry = entries.get(key);
            if (!entry || pruneIfExpired(key, entry)) {
                return undefined;
            }

            entries.delete(key);
            entries.set(key, entry);
            return entry.value;
        },
        has(key) {
            const entry = entries.get(key);
            if (!entry || pruneIfExpired(key, entry)) {
                return false;
            }

            return true;
        },
        set(key, value, setOptions = {}) {
            const expiresAt = typeof setOptions.lifetimeMs === 'number'
                ? now() + setOptions.lifetimeMs
                : undefined;

            if (typeof expiresAt === 'number' && expiresAt <= now()) {
                entries.delete(key);
                return;
            }

            if (entries.has(key)) {
                entries.delete(key);
            }

            entries.set(key, {
                value,
                expiresAt,
            });

            trimToMaxSize();
        },
    };
}
