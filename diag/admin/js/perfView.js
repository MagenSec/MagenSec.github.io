/*
 * TODO (handoff):
 * - Ensure perfViewInit is only called by the view loader after DOM is ready (not from perfView.js itself).
 * - Fix timezone toggle and chart rendering race: only render after DOM and container are present.
 * - Extend dashboardView.js patterns (modular filters, animated KPIs, ApexCharts) to all other views (apps, installs, security, reports).
 * - Replace static dashboard tiles with animated ApexCharts gauges/charts.
 * - Add more KPIs and analytics as needed.
 * - Document any new patterns in COPILOT.md and .copilot/config.json.
 * - Continue incremental, modular, and secure enhancements.
 */

// perfView.js: Handles performance telemetry view
// Fetches and displays PerfTelemetry data for the current org
window.perfViewInit = async function perfViewInit() {
  const container = document.getElementById('perfTelemetryContainer');
  if (!container) return;
  const org = sessionStorage.getItem('org');
  container.innerHTML = '<div class="loading">Loading performance telemetry...';
  if (window.__debugLog) window.__debugLog('Loading PerfTelemetry for org: ' + org);
  if (window.__debugLog) window.__debugLog('perfViewInit() called. Container: ' + !!container);
  try {
    // Always create a timezone toggle container at the top
    let tzToggle = document.getElementById('timezoneToggleContainer');
    if (!tzToggle) {
      tzToggle = document.createElement('div');
      tzToggle.id = 'timezoneToggleContainer';
      tzToggle.style = 'margin-bottom: 12px;';
      container.appendChild(tzToggle);
    }
    // Pass the timezone toggle container directly to the render function
    if (window.renderThemeAndTimezoneToggles) {
      window.renderThemeAndTimezoneToggles(tzToggle);
    }
    // Example OData params: date range, aggregation, etc. (extend as needed)
    const params = {};
    const data = await dataService.fetchOData('PerfTelemetry', org, params);
    if (!data || !data.value || !data.value.length) {
      container.innerHTML = '<div class="error">No performance telemetry found for this org.';
      if (window.__debugLog) window.__debugLog('No PerfTelemetry data found. Data: ' + JSON.stringify(data));
      return;
    }
    if (window.__debugLog) window.__debugLog('First PerfTelemetry row: ' + JSON.stringify(data.value[0]));
    // Defensive: always define processMap from data
    const processMap = {};
    for (const row of data.value) {
      const proc = row.ProcessName || row.Context1 || 'Unknown';
      if (!processMap[proc]) processMap[proc] = [];
      processMap[proc].push(row);
    }
    // Compute KPIs
    const cpuVals = data.value.map(r => typeof r.CpuAvg === 'number' ? r.CpuAvg : (parseFloat(r.CpuAvg)||0)).filter(v => !isNaN(v));
    const memVals = data.value.map(r => typeof r.MemAvgMB === 'number' ? r.MemAvgMB : (parseFloat(r.MemAvgMB)||0)).filter(v => !isNaN(v));
    const deviceSet = new Set(data.value.map(r => r.Context2 || ''));
    const kpiHtml = `
      <div class="kpi-bar">
        <span><b>Devices:</b> ${deviceSet.size}</span>
        <span><b>CPU Avg:</b> ${cpuVals.length ? (cpuVals.reduce((a,b)=>a+b,0)/cpuVals.length).toFixed(2) : 'N/A'}</span>
        <span><b>CPU Max:</b> ${cpuVals.length ? Math.max(...cpuVals).toFixed(2) : 'N/A'}</span>
        <span><b>CPU Min:</b> ${cpuVals.length ? Math.min(...cpuVals).toFixed(2) : 'N/A'}</span>
        <span><b>Mem Avg (MB):</b> ${memVals.length ? (memVals.reduce((a,b)=>a+b,0)/memVals.length).toFixed(2) : 'N/A'}</span>
      </div>
    `;
    // --- Theme & Timezone Toggles (reuse modular logic) ---
    // Defensive: only call renderThemeAndTimezoneToggles if its target element exists
    // --- Animated KPI Cards (ApexCharts) ---
    const kpiCardDiv = document.createElement('div');
    kpiCardDiv.className = 'kpi-card-bar';
    kpiCardDiv.innerHTML = `
      <div id="kpiDevices" class="kpi-card"></div>
      <div id="kpiCpuAvg" class="kpi-card"></div>
      <div id="kpiCpuMax" class="kpi-card"></div>
      <div id="kpiCpuMin" class="kpi-card"></div>
      <div id="kpiMemAvg" class="kpi-card"></div>
      <div id="kpiMemMax" class="kpi-card"></div>
      <div id="kpiMemMin" class="kpi-card"></div>
      <div id="kpiUptime" class="kpi-card"></div>
      <div id="kpiErrorRate" class="kpi-card"></div>
    `;
    container.appendChild(kpiCardDiv);
    // --- Animated KPI Gauges Row ---
    const kpiRow = document.createElement('div');
    kpiRow.className = 'kpi-gauge-row';
    kpiRow.innerHTML = `
      <div id="kpiDevices" class="kpi-gauge"></div>
      <div id="kpiCpuAvg" class="kpi-gauge"></div>
      <div id="kpiCpuMax" class="kpi-gauge"></div>
      <div id="kpiCpuMin" class="kpi-gauge"></div>
      <div id="kpiMemAvg" class="kpi-gauge"></div>
      <div id="kpiMemMax" class="kpi-gauge"></div>
      <div id="kpiMemMin" class="kpi-gauge"></div>
      <div id="kpiUptime" class="kpi-gauge"></div>
      <div id="kpiErrorRate" class="kpi-gauge"></div>
    `;
    container.appendChild(kpiRow);
    if (window.renderKpiGauge) {
      window.renderKpiGauge('kpiDevices', 'Devices', deviceSet.size, {max: Math.max(10, deviceSet.size+2)});
      window.renderKpiGauge('kpiCpuAvg', 'CPU Avg', cpuVals.length ? (cpuVals.reduce((a,b)=>a+b,0)/cpuVals.length) : 0, {max:100, decimals:2, unit:'%'});
      window.renderKpiGauge('kpiCpuMax', 'CPU Max', cpuVals.length ? Math.max(...cpuVals) : 0, {max:100, decimals:2, unit:'%'});
      window.renderKpiGauge('kpiCpuMin', 'CPU Min', cpuVals.length ? Math.min(...cpuVals) : 0, {max:100, decimals:2, unit:'%'});
      window.renderKpiGauge('kpiMemAvg', 'Mem Avg (MB)', memVals.length ? (memVals.reduce((a,b)=>a+b,0)/memVals.length) : 0, {max:16384, decimals:2, unit:'MB'});
      window.renderKpiGauge('kpiMemMax', 'Mem Max (MB)', memVals.length ? Math.max(...memVals) : 0, {max:16384, decimals:2, unit:'MB'});
      window.renderKpiGauge('kpiMemMin', 'Mem Min (MB)', memVals.length ? Math.min(...memVals) : 0, {max:16384, decimals:2, unit:'MB'});
      // Uptime and ErrorRate are demo KPIs; replace with real data if available
      window.renderKpiGauge('kpiUptime', 'Uptime (%)', 99.9, {max:100, decimals:2, unit:'%'});
      window.renderKpiGauge('kpiErrorRate', 'Error Rate', 0.2, {max:10, decimals:2, unit:'%'});
    }
    // --- Side-by-side charts for CPU and Memory ---
    const chartRow = document.createElement('div');
    chartRow.className = 'chart-row';
    chartRow.style = 'display: flex; gap: 24px; flex-wrap: wrap;';
    // CPU Chart
    const cpuChartDiv = document.createElement('div');
    cpuChartDiv.className = 'perf-sidechart';
    cpuChartDiv.style = 'flex:1 1 350px; min-width:300px; height:260px;';
    cpuChartDiv.id = 'cpuSideChart';
    chartRow.appendChild(cpuChartDiv);
    // Mem Chart
    const memChartDiv = document.createElement('div');
    memChartDiv.className = 'perf-sidechart';
    memChartDiv.style = 'flex:1 1 350px; min-width:300px; height:260px;';
    memChartDiv.id = 'memSideChart';
    chartRow.appendChild(memChartDiv);
    container.appendChild(chartRow);
    // --- BIN DATA INTO 5-MINUTE WINDOWS FOR CHARTS ---
    function binTelemetry(rows, windowMinutes = 5) {
      if (!rows.length) return [];
      const bins = [];
      let binStart = new Date(rows[0].WindowStart || rows[0].Timestamp);
      let binEnd = new Date(binStart.getTime() + windowMinutes * 60000);
      let binRows = [];
      for (const row of rows) {
        const ts = new Date(row.WindowStart || row.Timestamp);
        if (ts >= binStart && ts < binEnd) {
          binRows.push(row);
        } else {
          if (binRows.length) bins.push({
            time: binStart,
            cpuAvg: avg(binRows.map(r => r.CpuAvg)),
            cpuMin: min(binRows.map(r => r.CpuMin)),
            cpuMax: max(binRows.map(r => r.CpuMax)),
            memAvg: avg(binRows.map(r => r.MemAvgMB)),
            memMin: min(binRows.map(r => r.MemMinMB)),
            memMax: max(binRows.map(r => r.MemMaxMB)),
            sampleCount: sum(binRows.map(r => r.SampleCount))
          });
          // Start new bin
          binStart = ts;
          binEnd = new Date(binStart.getTime() + windowMinutes * 60000);
          binRows = [row];
        }
      }
      if (binRows.length) bins.push({
        time: binStart,
        cpuAvg: avg(binRows.map(r => r.CpuAvg)),
        cpuMin: min(binRows.map(r => r.CpuMin)),
        cpuMax: max(binRows.map(r => r.CpuMax)),
        memAvg: avg(binRows.map(r => r.MemAvgMB)),
        memMin: min(binRows.map(r => r.MemMinMB)),
        memMax: max(binRows.map(r => r.MemMaxMB)),
        sampleCount: sum(binRows.map(r => r.SampleCount))
      });
      return bins;
    }
    function avg(arr) { arr = arr.filter(v => typeof v === 'number' && !isNaN(v)); return arr.length ? +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : null; }
    function min(arr) { arr = arr.filter(v => typeof v === 'number' && !isNaN(v)); return arr.length ? Math.min(...arr) : null; }
    function max(arr) { arr = arr.filter(v => typeof v === 'number' && !isNaN(v)); return arr.length ? Math.max(...arr) : null; }
    function sum(arr) { arr = arr.filter(v => typeof v === 'number' && !isNaN(v)); return arr.length ? arr.reduce((a,b)=>a+b,0) : 0; }
    // Defensive: ensure procRows is always defined
    let procRows = [];
    if (typeof selectedProcess !== 'undefined' && processMap[selectedProcess]) {
      procRows = processMap[selectedProcess];
    }
    const binned = binTelemetry(procRows, 5); // 5-min bins
    const timeline = binned.map(b => window.formatTimestampForTimezone ? window.formatTimestampForTimezone(b.time) : b.time.toISOString());
    const cpuAvg = binned.map(b => b.cpuAvg);
    const cpuMin = binned.map(b => b.cpuMin);
    const cpuMax = binned.map(b => b.cpuMax);
    const memAvg = binned.map(b => b.memAvg);
    const memMin = binned.map(b => b.memMin);
    const memMax = binned.map(b => b.memMax);
    // Render ApexCharts
    if (window.ApexCharts) {
      new window.ApexCharts(cpuChartDiv, {
        chart: { type: 'line', height: 240, toolbar: {show: false}, animations: {enabled: true} },
        series: [
          { name: 'CPU Avg', data: cpuAvg },
          { name: 'CPU Min', data: cpuMin },
          { name: 'CPU Max', data: cpuMax }
        ],
        xaxis: { categories: timeline, labels: { rotate: -45 } },
        theme: { mode: window.getCurrentTheme && window.getCurrentTheme() === 'dark' ? 'dark' : 'light' },
        legend: { position: 'top' },
        colors: ['#2e7be4', '#4caf50', '#e53935'],
        responsive: [{ breakpoint: 600, options: { chart: {height: 140} } }]
      }).render();
      new window.ApexCharts(memChartDiv, {
        chart: { type: 'line', height: 240, toolbar: {show: false}, animations: {enabled: true} },
        series: [
          { name: 'Mem Avg', data: memAvg },
          { name: 'Mem Min', data: memMin },
          { name: 'Mem Max', data: memMax }
        ],
        xaxis: { categories: timeline, labels: { rotate: -45 } },
        theme: { mode: window.getCurrentTheme && window.getCurrentTheme() === 'dark' ? 'dark' : 'light' },
        legend: { position: 'top' },
        colors: ['#6ad1ff', '#4caf50', '#e53935'],
        responsive: [{ breakpoint: 600, options: { chart: {height: 140} } }]
      }).render();
    }
    // Remove loading message only if content is present
    if (container.querySelector('.kpi-gauge-row') || container.querySelector('.perf-sidechart')) {
      if (container.innerHTML.includes('Loading performance telemetry')) {
        container.innerHTML = '';
      }
    }
    // Defensive: ensure processFilter is always defined
    let processFilter = document.getElementById('perfProcessFilter');
    if (!processFilter) {
      // fallback: select first process if filter not present
      processFilter = { value: Object.keys(processMap)[0] || '' };
    }
    // Update charts on process filter change
    if (processFilter) {
      processFilter.onchange = () => {
        window.perfViewInit({
          org: document.getElementById('perfOrgFilter').value,
          process: processFilter.value,
          version: document.getElementById('perfVersionFilter').value,
          agg: document.getElementById('perfAggFilter').value,
          start: document.getElementById('perfStart').value,
          end: document.getElementById('perfEnd').value
        });
      };
    }
    if (window.__debugLog) window.__debugLog('PerfTelemetry loaded and charts rendered.');
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load data: ${e.message}`;
    if (window.__debugLog) window.__debugLog('PerfTelemetry error: ' + e.message + ' Stack: ' + (e.stack||''));
    // Only clear loading if error message is present
    if (container.innerHTML.includes('Loading performance telemetry')) {
      container.innerHTML = `<div class="error">Failed to load data: ${e.message}`;
    }
  }
};

/*
 * TODO: Modernize and modularize perfView.js using the same patterns as dashboardView.js:
 * - Use modular, modern filter dropdowns for Org, Process, Version, Aggregation.
 * - Integrate animated KPI cards (ApexCharts) for key perf metrics (e.g., Response Time, Uptime, Errors, Throughput).
 * - Add timezone and theme toggles (reuse modular logic).
 * - Ensure all charts/tables use responsive, modern components and update on filter changes.
 * - Patch all time displays for timezone toggle.
 * - Preserve org isolation, session, and security logic.
 * - Add clear comments for extensibility and future KPIs/analytics.
 * - Document new patterns in COPILOT.md if any emerge.
 */