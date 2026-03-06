async function fetchApi(path: string, options?: RequestInit) {
    const res = await fetch(path, {
        ...options,
        headers: {
            ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options?.headers || {})
        },
        credentials: 'include'
    });

    if (!res.ok) {
        let err;
        try {
            err = await res.json();
        } catch (e) {
            err = { error: await res.text() };
        }
        throw new Error(err.error || `HTTP ${res.status}`);
    }

    if (res.status === 204) return null;
    return res.json();
}

export const api = {
    get: (path: string) => fetchApi(path),
    post: (path: string, body: any) => fetchApi(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path: string, body: any) => fetchApi(path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (path: string) => fetchApi(path, { method: 'DELETE' })
};
