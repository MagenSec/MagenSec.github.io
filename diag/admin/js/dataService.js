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

  // Dashboard KPIs and Charts for Performance View with filtering and binning
  async function getKpis(view, org, process, range) {
    // Default params
    org = org || sessionStorage.getItem('org');
    process = process || 'all';
    range = range || '1d';
    // For demo, use PerfTelemetry for KPIs
    const data = await fetchOData('PerfTelemetry', org, { range, process });
    if (!data || !data.value || !data.value.length) return [];
    // Filter by process
    let filtered = process === 'all' ? data.value : data.value.filter(r => r.ProcessName === process);
    // Time range filtering (assume Timestamp is ISO string)
    let now = Date.now();
    let msMap = { '5m': 5*60*1000, '15m': 15*60*1000, '30m': 30*60*1000, '1h': 60*60*1000, '2h': 2*60*60*1000, '6h': 6*60*60*1000, '12h': 12*60*60*1000, '1d': 24*60*60*1000, '7d': 7*24*60*60*1000, '15d': 15*24*60*60*1000 };
    if (range in msMap) {
      filtered = filtered.filter(r => now - new Date(r.Timestamp).getTime() <= msMap[range]);
    }
    // KPIs
    const cpuVals = filtered.map(r => typeof r.CpuAvg === 'number' ? r.CpuAvg : (parseFloat(r.CpuAvg)||0)).filter(v => !isNaN(v));
    const memVals = filtered.map(r => typeof r.MemAvgMB === 'number' ? r.MemAvgMB : (parseFloat(r.MemAvgMB)||0)).filter(v => !isNaN(v));
    const deviceSet = new Set(filtered.map(r => r.Context2 || ''));
    const processSet = new Set(filtered.map(r => r.ProcessName || ''));
    return [
      { title: 'Devices', value: deviceSet.size, desc: 'Reporting PerfTelemetry' },
      { title: 'Processes', value: processSet.size, desc: 'Distinct Processes' },
      { title: 'CPU Avg', value: cpuVals.length ? (cpuVals.reduce((a,b)=>a+b,0)/cpuVals.length).toFixed(2) : 'N/A', desc: 'Average CPU Usage' },
      { title: 'CPU Max', value: cpuVals.length ? Math.max(...cpuVals).toFixed(2) : 'N/A', desc: 'Max CPU Usage' },
      { title: 'CPU Min', value: cpuVals.length ? Math.min(...cpuVals).toFixed(2) : 'N/A', desc: 'Min CPU Usage' },
      { title: 'Mem Avg (MB)', value: memVals.length ? (memVals.reduce((a,b)=>a+b,0)/memVals.length).toFixed(2) : 'N/A', desc: 'Average Memory Usage' },
      { title: 'Mem Max (MB)', value: memVals.length ? Math.max(...memVals).toFixed(2) : 'N/A', desc: 'Max Memory Usage' },
      { title: 'Mem Min (MB)', value: memVals.length ? Math.min(...memVals).toFixed(2) : 'N/A', desc: 'Min Memory Usage' }
    ];
  }

  async function getCharts(view, org, process) {
    org = org || sessionStorage.getItem('org');
    process = process || 'all';
    const data = await fetchOData('PerfTelemetry', org, { process });
    if (!data || !data.value || !data.value.length) return [];
    // Filter by process
    let filtered = process === 'all' ? data.value : data.value.filter(r => r.ProcessName === process);
    // Chart 1: CPU (min/avg/max)
    let chartLabels = filtered.map(r => r.Timestamp ? new Date(r.Timestamp).toLocaleString() : '');
    let cpuAvg = filtered.map(r => typeof r.CpuAvg === 'number' ? r.CpuAvg : (parseFloat(r.CpuAvg)||null));
    let cpuMin = filtered.map(r => typeof r.CpuMin === 'number' ? r.CpuMin : (parseFloat(r.CpuMin)||null));
    let cpuMax = filtered.map(r => typeof r.CpuMax === 'number' ? r.CpuMax : (parseFloat(r.CpuMax)||null));
    // Chart 2: Memory (min/avg/max)
    let memAvg = filtered.map(r => typeof r.MemAvgMB === 'number' ? r.MemAvgMB : (parseFloat(r.MemAvgMB)||null));
    let memMin = filtered.map(r => typeof r.MemMinMB === 'number' ? r.MemMinMB : (parseFloat(r.MemMinMB)||null));
    let memMax = filtered.map(r => typeof r.MemMaxMB === 'number' ? r.MemMaxMB : (parseFloat(r.MemMaxMB)||null));
    // Distinct process list for filter
    let processList = Array.from(new Set(filtered.map(r => r.ProcessName || ''))).filter(Boolean);
    return [
      {
        id: 'cpuChart',
        title: 'CPU Usage (Min/Avg/Max)',
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [
            { label: 'CPU Avg', data: cpuAvg, borderColor: '#2e7be4', backgroundColor: 'rgba(46,123,228,0.1)', fill: false },
            { label: 'CPU Min', data: cpuMin, borderColor: '#a0c4ff', borderDash: [4,2], fill: false },
            { label: 'CPU Max', data: cpuMax, borderColor: '#003566', borderDash: [4,2], fill: false }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top',
              labels: { usePointStyle: true, font: { weight: 'bold' } }
            },
            tooltip: { mode: 'index', intersect: false }
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false },
          scales: { x: { title: { display: true, text: 'Time' } }, y: { title: { display: true, text: 'CPU %' } } }
        },
        processList
      },
      {
        id: 'memChart',
        title: 'Memory Usage (Min/Avg/Max)',
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [
            { label: 'Mem Avg', data: memAvg, borderColor: '#6ad1ff', backgroundColor: 'rgba(106,209,255,0.1)', fill: false },
            { label: 'Mem Min', data: memMin, borderColor: '#b2f0ff', borderDash: [4,2], fill: false },
            { label: 'Mem Max', data: memMax, borderColor: '#005f73', borderDash: [4,2], fill: false }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'top',
              labels: { usePointStyle: true, font: { weight: 'bold' } }
            },
            tooltip: { mode: 'index', intersect: false }
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false },
          scales: { x: { title: { display: true, text: 'Time' } }, y: { title: { display: true, text: 'Mem MB' } } }
        },
        processList
      }
    ];
  }

  return { fetchOData, getExpiry, setExpiry, fetchSasExpiry, loadSasUrl, getKpis, getCharts };
})();

window.dataService = dataService;
console.log('window.dataService set:', window.dataService);
