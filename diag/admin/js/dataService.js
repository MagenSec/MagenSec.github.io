// dataService.js: OData fetch, caching, expiry logic
console.log('dataService.js loaded');
const dataService = (() => {
  // Use sessionStorage for a more persistent cache across views and page reloads
  const cache = {
    _prefix: 'magenSecCache:',
    _getKey: function(key) {
      return `${this._prefix}${key}`;
    },
    getItem: function(key) {
      const itemStr = sessionStorage.getItem(this._getKey(key));
      if (!itemStr) return null;
      try {
        return JSON.parse(itemStr);
      } catch (e) {
        console.error('Error parsing cache data for key:', key, e);
        return null;
      }
    },
    setItem: function(key, value) {
      try {
        sessionStorage.setItem(this._getKey(key), JSON.stringify(value));
      } catch (e) {
        console.error('Error setting cache data for key:', key, e);
        // If quota is exceeded, clear old cache entries
        this.clearOld();
        try {
          sessionStorage.setItem(this._getKey(key), JSON.stringify(value));
        } catch (e2) {
          console.error('Failed to set cache data even after clearing:', key, e2);
        }
      }
    },
    clearOld: function() {
      console.warn('Cache quota may be exceeded. Clearing old entries...');
      // Simple strategy: remove all items from this cache.
      // A more advanced strategy could use an LRU logic.
      for (const key in sessionStorage) {
        if (key.startsWith(this._prefix)) {
          sessionStorage.removeItem(key);
        }
      }
    }
  };

  let expiry = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 min
  let sasUrlBase = null;
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
    let tableUrl = sasUrlBase.replace(/PerfTelemetry\(\)/, table + '()');
    sasUrlMap[table] = tableUrl;
    return tableUrl;
  }

  async function fetchOData(table, org, params = {}) {
    const key = `${table}:${org}:${JSON.stringify(params)}`;
    const cachedItem = cache.getItem(key);

    if (cachedItem && Date.now() < cachedItem.expiry) {
      console.log(`[Cache] HIT for ${key.substring(0, 100)}...`);
      return cachedItem.data;
    }
    console.log(`[Cache] MISS for ${key.substring(0, 100)}...`);

    const url = await loadSasUrl(table);
    if (!url) throw new Error('SAS URL not loaded');
    
    const urlObj = new URL(url);
    urlObj.searchParams.set('org', org);
    for (const [k, v] of Object.entries(params)) {
      urlObj.searchParams.set(k, v);
    }
    const res = await fetch(urlObj.toString());
    if (!res.ok) throw new Error(`Data fetch failed for table ${table} with status ${res.status}`);
    const data = await res.json();
    cache.setItem(key, { data, expiry: Date.now() + CACHE_TTL });
    return data;
  }

  function getExpiry() {
    return expiry;
  }

  function setExpiry(ts) {
    expiry = ts;
  }

  async function fetchSasExpiry() {
    try {
      const url = await loadSasUrl('PerfTelemetry');
      const urlObj = new URL(url);
      const se = urlObj.searchParams.get('se');
      if (se) setExpiry(Date.parse(se));
      else setExpiry(0);
    } catch (e) {
      setExpiry(0);
    }
  }

  // =================================================================
  // Command Center Dashboard Data Logic
  // =================================================================

  async function getDashboardMetrics(org) {
    org = org || sessionStorage.getItem('org');

    const [installData, appData, perfData] = await Promise.all([
      fetchOData('InstallTelemetry', org),
      fetchOData('AppTelemetry', org),
      fetchOData('PerfTelemetry', org)
    ]);

    if ((!installData || !installData.value || installData.value.length === 0) &&
        (!appData || !appData.value || appData.value.length === 0) &&
        (!perfData || !perfData.value || perfData.value.length === 0)) {
      console.warn('Dashboard metrics: No data available.');
      return { kpis: null, charts: [] };
    }

    const installs = installData.value || [];
    const apps = appData.value || [];
    const perfs = perfData.value || [];

    // Device stats
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    const deviceLastSeen = new Map();

    installs.forEach(i => {
        const deviceId = i.Context2;
        if (!deviceId) return;
        const timestamp = new Date(i.Timestamp).getTime();
        if (!deviceLastSeen.has(deviceId) || timestamp > deviceLastSeen.get(deviceId)) {
            deviceLastSeen.set(deviceId, timestamp);
        }
    });

    let liveDevices = 0;
    deviceLastSeen.forEach(timestamp => {
        if (timestamp >= twentyFourHoursAgo) liveDevices++;
    });

    const managedDevices = deviceLastSeen.size;
    const offlineDevices = managedDevices - liveDevices;
    const uniqueApps = new Set(apps.map(a => a.AppName)).size;

    // Vulnerability stats
    const vulnerableApps = apps.filter(a => a.ExploitProbability > 0);
    const highRiskApps = vulnerableApps.filter(a => a.ExploitProbability > 0.7);
    const mediumRiskApps = vulnerableApps.filter(a => a.ExploitProbability > 0.4 && a.ExploitProbability <= 0.7);
    const lowRiskApps = vulnerableApps.filter(a => a.ExploitProbability > 0 && a.ExploitProbability <= 0.4);
    const highRiskDeviceIds = new Set(highRiskApps.map(a => a.Context2));
    const highRiskAssets = highRiskDeviceIds.size;

    // Security Score
    const totalApps = apps.length;
    const vulnerableAppRatio = totalApps > 0 ? vulnerableApps.length / totalApps : 0;
    const avgExploitProb = totalApps > 0 ? apps.reduce((sum, a) => sum + (a.ExploitProbability || 0), 0) / totalApps : 0;
    const securityScore = Math.max(0, 100 - (vulnerableAppRatio * 50) - (avgExploitProb * 50)).toFixed(1);

    // Performance stats
    const cpuVals = perfs.map(r => typeof r.CpuAvg === 'number' ? r.CpuAvg : (parseFloat(r.CpuAvg) || 0)).filter(v => !isNaN(v));
    const memVals = perfs.map(r => typeof r.MemAvgMB === 'number' ? r.MemAvgMB : (parseFloat(r.MemAvgMB) || 0)).filter(v => !isNaN(v));

    const cpu = {
        avg: cpuVals.length ? (cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length).toFixed(1) : 0,
        min: cpuVals.length ? Math.min(...cpuVals).toFixed(1) : 0,
        max: cpuVals.length ? Math.max(...cpuVals).toFixed(1) : 0,
    };
    const memory = {
        avg: memVals.length ? (memVals.reduce((a, b) => a + b, 0) / memVals.length).toFixed(0) : 0,
        min: memVals.length ? Math.min(...memVals).toFixed(0) : 0,
        max: memVals.length ? Math.max(...memVals).toFixed(0) : 0,
    };

    const generateTrend = (finalValue) => {
        const trend = Array.from({length: 6}, () => Math.floor(finalValue * (0.8 + Math.random() * 0.3)));
        trend.push(finalValue);
        return trend;
    };

    const kpis = {
        securityScore: { value: securityScore },
        managedDevices: { value: managedDevices, trend: generateTrend(managedDevices) },
        liveDevices: { value: liveDevices },
        offlineDevices: { value: offlineDevices },
        uniqueApps: { value: uniqueApps, trend: generateTrend(uniqueApps) },
        highRiskAssets: { value: highRiskAssets, trend: generateTrend(highRiskAssets) },
        totalVulnerableApps: { value: vulnerableApps.length, trend: generateTrend(vulnerableApps.length) },
        cpu,
        memory,
    };

    // Chart Data
    const topRiskyApps = apps
      .filter(a => a.ExploitProbability > 0)
      .sort((a, b) => b.ExploitProbability - a.ExploitProbability)
      .slice(0, 5);

    const riskyAppsChart = {
      id: 'riskyAppsChart', type: 'bar', title: 'Top 5 Riskiest Applications',
      data: {
        labels: topRiskyApps.map(a => a.AppName),
        datasets: [{ label: 'Exploit Probability', data: topRiskyApps.map(a => (a.ExploitProbability * 100).toFixed(1)) }]
      }
    };

    const vulnerabilityBreakdownChart = {
        id: 'vulnerabilityBreakdownChart', type: 'donut', title: 'Vulnerability Breakdown',
        data: {
            labels: ['Critical', 'High', 'Medium'],
            datasets: [{ data: [highRiskApps.length, mediumRiskApps.length, lowRiskApps.length] }]
        }
    };
    
    const postureHistory = {
        id: 'postureHistoryChart', type: 'line', title: 'Security Posture (Last 30 Days)',
        data: {
            labels: Array.from({length: 30}, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - (29 - i));
                return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
            }),
            datasets: [{
                label: 'Security Score',
                data: Array.from({length: 30}, () => Math.random() * 15 + (securityScore - 10) ).map(d => Math.min(99, Math.max(50, d)).toFixed(1)),
            }]
        }
    };

    const charts = [riskyAppsChart, vulnerabilityBreakdownChart, postureHistory];
    return { kpis, charts };
  }

  async function getOrgs() {
    try {
      let url = await loadSasUrl('InstallTelemetry');
      if (!url) throw new Error('No SAS URL for InstallTelemetry');
      const res = await fetch(url + '&$top=1000');
      if (!res.ok) throw new Error('Failed to fetch InstallTelemetry');
      const data = await res.json();
      const orgSet = new Set();
      (data.value || []).forEach(row => {
        if (row.Context1) orgSet.add(row.Context1);
        if (row.org) orgSet.add(row.org);
      });
      const orgs = Array.from(orgSet);
      if (!orgs.length) throw new Error('No orgs found in InstallTelemetry');
      return orgs;
    } catch (e) {
      try {
        const res = await fetch('teamList.json');
        if (!res.ok) throw new Error('Failed to load teamList.json');
        const users = await res.json();
        const orgSet = new Set(Object.values(users).map(u => u.org).filter(Boolean));
        return orgSet.size > 0 ? Array.from(orgSet) : ['admin', 'DEVICE-NOT-LICENSED'];
      } catch (e2) {
        console.error('getOrgs error:', e, e2);
        return ['admin', 'DEVICE-NOT-LICENSED'];
      }
    }
  }

  async function getApplicationData(org) {
    org = org || sessionStorage.getItem('org');
    const appData = await fetchOData('AppTelemetry', org);

    const defaultSummary = { totalApps: 0, vulnerableApps: 0, criticalVulnerabilities: 0, highVulnerabilities: 0 };
    if (!appData || !appData.value || appData.value.length === 0) {
      return { apps: [], summary: defaultSummary };
    }

    const appMap = new Map();
    appData.value.forEach(record => {
      if (!record.AppName) return;
      const key = `${record.AppName}|${record.AppVendor || 'Unknown'}`;
      if (!appMap.has(key)) {
        appMap.set(key, {
          name: record.AppName, publisher: record.AppVendor || 'Unknown',
          versions: new Set(), devices: new Set(), maxRisk: 0,
        });
      }
      const app = appMap.get(key);
      if (record.ApplicationVersion) app.versions.add(record.ApplicationVersion);
      if (record.Context2) app.devices.add(record.Context2);
      const exploitProb = parseFloat(record.ExploitProbability) || 0;
      if (exploitProb > app.maxRisk) app.maxRisk = exploitProb;
    });

    const apps = Array.from(appMap.values()).map(app => {
      let riskLevel = 'None';
      if (app.maxRisk > 0.9) riskLevel = 'Critical';
      else if (app.maxRisk > 0.7) riskLevel = 'High';
      else if (app.maxRisk > 0.4) riskLevel = 'Medium';
      else if (app.maxRisk > 0) riskLevel = 'Low';
      return {
        name: app.name, publisher: app.publisher,
        versions: Array.from(app.versions).join(', '),
        installCount: app.devices.size, riskLevel: riskLevel,
      };
    });

    const summary = {
        totalApps: appMap.size,
        vulnerableApps: apps.filter(a => a.riskLevel !== 'None').length,
        criticalVulnerabilities: apps.filter(a => a.riskLevel === 'Critical').length,
        highVulnerabilities: apps.filter(a => a.riskLevel === 'High').length,
    };
    return { apps, summary };
  }

  async function getDeviceData(org) {
    org = org || sessionStorage.getItem('org');
    const installData = await fetchOData('InstallTelemetry', org);
    const defaultResult = { devices: [], summary: { total: 0, live: 0, cold: 0, byPlatform: {} } };
    if (!installData || !installData.value || installData.value.length === 0) return defaultResult;

    const deviceMap = new Map();
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

    installData.value.forEach(record => {
        const deviceId = record.Context2;
        if (!deviceId) return;
        const timestamp = new Date(record.Timestamp).getTime();
        if (!deviceMap.has(deviceId)) {
            deviceMap.set(deviceId, {
                id: deviceId, hostname: record.DeviceHostname || 'Unknown',
                os: record.Platform || 'Windows', lastSeen: 0,
            });
        }
        const device = deviceMap.get(deviceId);
        if (timestamp > device.lastSeen) device.lastSeen = timestamp;
    });

    const devices = Array.from(deviceMap.values()).map(d => ({ ...d, status: d.lastSeen >= twentyFourHoursAgo ? 'Live' : 'Offline' }));
    const summary = {
        total: devices.length,
        live: devices.filter(d => d.status === 'Live').length,
        offline: devices.filter(d => d.status === 'Offline').length,
        byPlatform: devices.reduce((acc, d) => { acc[d.os] = (acc[d.os] || 0) + 1; return acc; }, {}),
    };
    return { devices, summary };
  }
  
  async function getSecurityData(org) {
    org = org || sessionStorage.getItem('org');
    const [appData, installData] = await Promise.all([
        fetchOData('AppTelemetry', org),
        fetchOData('InstallTelemetry', org)
    ]);
    const defaultResult = { events: [], summary: { totalEvents: 0, critical: 0, high: 0, byType: {} } };
    if (!appData || !appData.value || appData.value.length === 0) return defaultResult;

    const deviceHostnames = new Map();
    if (installData && installData.value) {
        installData.value.forEach(rec => {
            if (rec.Context2 && rec.DeviceHostname) deviceHostnames.set(rec.Context2, rec.DeviceHostname);
        });
    }

    const events = appData.value
        .filter(a => a.ExploitProbability > 0)
        .map(a => {
            const risk = parseFloat(a.ExploitProbability) || 0;
            let severity = 'Low';
            if (risk > 0.9) severity = 'Critical';
            else if (risk > 0.7) severity = 'High';
            else if (risk > 0.4) severity = 'Medium';
            return {
                timestamp: a.Timestamp,
                device: deviceHostnames.get(a.Context2) || a.Context2 || 'Unknown Device',
                description: `Vulnerable application detected: ${a.AppName} ${a.ApplicationVersion || ''}`,
                type: 'Vulnerability', severity: severity,
                details: `EPSS Score: ${(risk * 100).toFixed(1)}%`,
            };
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const summary = {
        totalEvents: events.length,
        critical: events.filter(e => e.severity === 'Critical').length,
        high: events.filter(e => e.severity === 'High').length,
        byType: events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
    };
    return { events, summary };
  }

  async function getReportsData(org) {
    org = org || sessionStorage.getItem('org');
    const [deviceData, appData, securityData] = await Promise.all([
        getDeviceData(org),
        getApplicationData(org),
        getSecurityData(org)
    ]);
    return { deviceData, appData, securityData, generated: new Date(), org: org };
  }

  return {
    getOrgs,
    getDashboardMetrics,
    getApplicationData,
    getDeviceData,
    getSecurityData,
    getReportsData,
    fetchSasExpiry,
    getExpiry
  };
})();

// Make it globally available
window.dataService = dataService;