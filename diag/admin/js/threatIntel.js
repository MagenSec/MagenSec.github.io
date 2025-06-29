// threatIntel.js: Fetches and manages external threat intelligence feeds.
console.log('threatIntel.js loaded');

window.threatIntel = (() => {
    const LOCAL_KEV_URL = './data/known_exploited_vulnerabilities.json';
    const CACHE_KEY = 'magenSecCache:kevCatalog';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    let kevCatalog = null;

    /**
     * Fetches the CISA Known Exploited Vulnerabilities (KEV) catalog.
     * Uses sessionStorage with a TTL to avoid excessive network requests.
     */
    async function loadKevCatalog() {
        const cachedItem = JSON.parse(sessionStorage.getItem(CACHE_KEY));

        if (cachedItem && Date.now() < cachedItem.expiry) {
            console.log('[ThreatIntel] Using cached KEV catalog.');
            kevCatalog = new Set(cachedItem.data);
            return;
        }

        console.log('[ThreatIntel] Fetching KEV catalog from local file...');
        try {
            const response = await fetch(LOCAL_KEV_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch local KEV catalog: ${response.statusText}`);
            }
            const data = await response.json();
            
            // Extract just the CVE IDs into a Set for efficient lookups
            const cveIds = data.vulnerabilities.map(v => v.cveID);
            kevCatalog = new Set(cveIds);

            // Cache the Set
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                data: Array.from(kevCatalog), // Store as array
                expiry: Date.now() + CACHE_TTL
            }));

            console.log(`[ThreatIntel] Successfully loaded and cached ${kevCatalog.size} KEVs from local file.`);
            console.log(`[ThreatIntel] KEV catalog version: ${data.catalogVersion || 'unknown'}, released: ${data.dateReleased || 'unknown'}`);
            console.log(`[ThreatIntel] Sample KEVs: ${Array.from(kevCatalog).slice(0, 5).join(', ')}`);
        } catch (error) {
            console.error('[ThreatIntel] Could not load KEV catalog:', error);
            // Use stale cache if available
            if (cachedItem) {
                console.warn('[ThreatIntel] Using stale KEV catalog from cache.');
                kevCatalog = new Set(cachedItem.data);
            } else {
                console.error('[ThreatIntel] No KEV data available. KEV checking will be disabled.');
                kevCatalog = new Set(); // Empty set - no KEV data available
            }
        }
    }

    /**
     * Checks if a given CVE ID is in the CISA KEV catalog.
     * @param {string} cveId - The CVE ID to check (e.g., 'CVE-2021-44228').
     * @returns {boolean} - True if the CVE is known to be exploited, false otherwise.
     */
    function isKnownExploited(cveId) {
        if (!kevCatalog) {
            console.warn('[ThreatIntel] KEV catalog not loaded yet. Call init() first.');
            return false;
        }
        return kevCatalog.has(cveId);
    }

    return {
        init: loadKevCatalog,
        isKnownExploited
    };
})();
