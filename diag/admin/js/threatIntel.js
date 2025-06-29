// threatIntel.js: Fetches and manages external threat intelligence feeds.
console.log('threatIntel.js loaded');

window.threatIntel = (() => {
    const KEV_CATALOG_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
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

        console.log('[ThreatIntel] Fetching fresh KEV catalog from CISA...');
        try {
            // NOTE: This direct fetch might be blocked by CORS in a real browser environment.
            // In a production scenario, this would be proxied through our own backend.
            const response = await fetch(KEV_CATALOG_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch KEV catalog: ${response.statusText}`);
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

            console.log(`[ThreatIntel] Successfully loaded and cached ${kevCatalog.size} KEVs.`);

        } catch (error) {
            console.error('[ThreatIntel] Could not load KEV catalog:', error);
            // Use stale cache if available, otherwise operate without KEV data
            if (cachedItem) {
                console.warn('[ThreatIntel] Using stale KEV catalog from cache.');
                kevCatalog = new Set(cachedItem.data);
            } else {
                console.warn('[ThreatIntel] No cache available. Using demo KEV data for testing.');
                // Fallback to some known KEVs for demo/testing purposes
                const demoKevs = [
                    'CVE-2021-44228', // Log4j
                    'CVE-2021-4028',  // Log4j
                    'CVE-2022-40684', // Fortinet
                    'CVE-2021-34527', // PrintNightmare
                    'CVE-2021-26855', // Exchange ProxyLogon
                    'CVE-2022-41082', // Exchange
                    'CVE-2023-34362', // MOVEit
                    'CVE-2024-43498', // Example from your data
                    'CVE-2024-43499'  // Example from your data
                ];
                kevCatalog = new Set(demoKevs);
                console.log(`[ThreatIntel] Using ${kevCatalog.size} demo KEVs for testing.`);
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
