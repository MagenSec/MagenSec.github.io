// dataService.js: OData fetch, caching, expiry logic
console.log('dataService.js loaded');
const dataService = (() => {
  let cache = {};
  let expiry = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 min
  let sasUrlBase = null;
  let sasUrlLoaded = false;
  // Cache SAS URLs for each table
  let sasUrlMap = {};

  async function loadSasUrl(table) {
    if (sasUrlMap[table]) return sasUrlMap[table];
    if (!sasUrlBase) {
      // Dynamically import keyMaterial.js using relative path
      if (!window.loadPerfKeyMaterial) {
        const mod = await import('./keyMaterial.js');
        window.loadPerfKeyMaterial = mod.loadPerfKeyMaterial;
      }
      sasUrlBase = await window.loadPerfKeyMaterial('../temp.a');
    }
    // Replace 'PerfTelemetry()' with the correct table name
    // e.g. PerfTelemetry() -> AppTelemetry(), InstallTelemetry(), etc.
    let tableUrl = sasUrlBase.replace(/PerfTelemetry\(\)/, table + '()');
    sasUrlMap[table] = tableUrl;
    return tableUrl;
  }

  async function fetchOData(table, org, params = {}) {
    const key = `${table}:${org}:${JSON.stringify(params)}`;
    if (cache[key] && Date.now() < cache[key].expiry) {
      return cache[key].data;
    }
    // Use SAS URL logic
    const url = await loadSasUrl(table);
    if (!url) throw new Error('SAS URL not loaded');
    // Add org and params as query string
    const urlObj = new URL(url);
    urlObj.searchParams.set('org', org);
    for (const [k, v] of Object.entries(params)) {
      urlObj.searchParams.set(k, v);
    }
    const res = await fetch(urlObj.toString());
    if (!res.ok) throw new Error('Data fetch failed');
    const data = await res.json();
    cache[key] = { data, expiry: Date.now() + CACHE_TTL };
    return data;
  }

  function getExpiry() {
    // TODO: Wire to SAS expiry
    return expiry;
  }

  function setExpiry(ts) {
    expiry = ts;
  }

  async function fetchSasExpiry() {
    // Derive expiry from SAS URL 'se' parameter
    try {
      const url = await loadSasUrl('PerfTelemetry'); // Any table, just to get the SAS
      const urlObj = new URL(url);
      const se = urlObj.searchParams.get('se');
      if (se) setExpiry(Date.parse(se));
      else setExpiry(0);
    } catch (e) {
      setExpiry(0);
    }
  }

  return { fetchOData, getExpiry, setExpiry, fetchSasExpiry, loadSasUrl };
})();

window.dataService = dataService;
console.log('window.dataService set:', window.dataService);
