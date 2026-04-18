/**
 * NVD CVE Cache — lightweight localStorage-backed NVD API client.
 *
 * Fetches CVE details from NVD 2.0 API and caches them for 24 hours.
 * Rate-limited to 5 requests per 30 seconds (NVD public API limit).
 *
 * Usage:
 *   import { nvdCveCache } from '../utils/nvdCveCache.js';
 *   const data = await nvdCveCache.get('CVE-2024-1234');
 *   // data: { descriptions, references, metrics, ... } or null
 */

const NVD_API = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CACHE_PREFIX = 'nvd_cve_';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_WINDOW_MS = 30_000;       // 30 seconds
const MAX_REQUESTS = 5;              // NVD public limit per window

let requestTimestamps = [];

function isRateLimited() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(t => now - t < RATE_WINDOW_MS);
    return requestTimestamps.length >= MAX_REQUESTS;
}

function recordRequest() {
    requestTimestamps.push(Date.now());
}

function getCached(cveId) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + cveId);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts > TTL_MS) {
            localStorage.removeItem(CACHE_PREFIX + cveId);
            return null;
        }
        return data;
    } catch { return null; }
}

function setCache(cveId, data) {
    try {
        localStorage.setItem(CACHE_PREFIX + cveId, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* storage full — ignore */ }
}

/**
 * Fetch CVE from NVD API. Returns simplified object or null.
 * Respects public API rate limits.
 */
async function fetchFromNvd(cveId) {
    if (isRateLimited()) return null;

    recordRequest();

    try {
        const resp = await fetch(`${NVD_API}?cveId=${encodeURIComponent(cveId)}`);
        if (!resp.ok) return null;
        const json = await resp.json();
        const vuln = json?.vulnerabilities?.[0]?.cve;
        if (!vuln) return null;

        return {
            id: vuln.id,
            description: vuln.descriptions?.find(d => d.lang === 'en')?.value ?? '',
            references: (vuln.references || []).slice(0, 5).map(r => ({ url: r.url, source: r.source })),
            cvssV31: vuln.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ?? null,
            cvssV40: vuln.metrics?.cvssMetricV40?.[0]?.cvssData?.baseScore ?? null,
            epss: null, // EPSS is from a different API
            published: vuln.published,
            lastModified: vuln.lastModified,
        };
    } catch { return null; }
}

export const nvdCveCache = {
    /**
     * Get CVE details — from cache or NVD API.
     * Returns null if rate limited or API unavailable.
     */
    async get(cveId) {
        if (!cveId) return null;
        const cached = getCached(cveId);
        if (cached) return cached;

        const data = await fetchFromNvd(cveId);
        if (data) setCache(cveId, data);
        return data;
    },

    /** Check cache without calling API. */
    peek(cveId) {
        return getCached(cveId);
    },

    /** Clear all NVD cache entries. */
    clearAll() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
        }
        keys.forEach(k => localStorage.removeItem(k));
    }
};

export default nvdCveCache;
