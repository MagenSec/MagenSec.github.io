// Lightweight shared KEV loader with 24h in-memory cache.
// Tries local diag copy first, falls back to GitHub raw if unavailable.

const CACHE = { data: null, loadedAt: 0, ttlMs: 24 * 60 * 60 * 1000 };
const LOCAL_KEV_URL = '../diag/known_exploited_vulnerabilities.json';
const REMOTE_KEV_URL = 'https://raw.githubusercontent.com/MagenSec/MagenSec.github.io/main/diag/known_exploited_vulnerabilities.json';

async function fetchKev(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`KEV fetch failed: ${response.status}`);
    return response.json();
}

function extractIds(data) {
    if (!data) return new Set();
    const ids = [];
    if (Array.isArray(data)) {
        for (const entry of data) {
            if (typeof entry === 'string') ids.push(entry);
            else if (entry && typeof entry === 'object') ids.push(entry.cveID || entry.cveId);
        }
    } else if (Array.isArray(data.vulnerabilities)) {
        for (const v of data.vulnerabilities) {
            ids.push(v?.cveID || v?.cveId);
        }
    }
    return new Set(ids.filter(id => typeof id === 'string'));
}

export async function getKevSet(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && CACHE.data && now - CACHE.loadedAt < CACHE.ttlMs) {
        return CACHE.data;
    }

    let kevIds = new Set();
    try {
        const local = await fetchKev(LOCAL_KEV_URL);
        kevIds = extractIds(local);
    } catch (err) {
        console.warn('[kevCache] Local KEV load failed, falling back to remote:', err.message);
    }

    if (kevIds.size === 0) {
        try {
            const remote = await fetchKev(REMOTE_KEV_URL);
            kevIds = extractIds(remote);
        } catch (err) {
            console.warn('[kevCache] Remote KEV load failed:', err.message);
            kevIds = new Set();
        }
    }

    CACHE.data = kevIds;
    CACHE.loadedAt = now;
    return kevIds;
}
