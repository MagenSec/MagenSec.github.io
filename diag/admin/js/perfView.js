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
    // Example OData params: date range, aggregation, etc. (extend as needed)
    const params = {};
    const data = await dataService.fetchOData('PerfTelemetry', org, params);
    if (!data || !data.value || !data.value.length) {
      container.innerHTML = '<div class="error">No performance telemetry found for this org.';
      if (window.__debugLog) window.__debugLog('No PerfTelemetry data found. Data: ' + JSON.stringify(data));
      return;
    }
    if (window.__debugLog) window.__debugLog('First PerfTelemetry row: ' + JSON.stringify(data.value[0]));
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
    // Render a simple table and chart
    let html = '<table class="telemetry-table"><thead><tr>';
    html += '<th>Timestamp</th><th>Device</th><th>CPU Avg</th><th>Mem Avg (MB)</th></tr></thead><tbody>';
    const chartLabels = [], cpuData = [], memData = [];
    for (const row of data.value) {
      html += `<tr><td>${row.Timestamp ?? ''}</td><td>${row.Context2 ?? ''}</td><td>${row.CpuAvg ?? ''}</td><td>${row.MemAvgMB ?? ''}</td></tr>`;
      chartLabels.push(row.Timestamp ?? '');
      cpuData.push(row.CpuAvg ?? null);
      memData.push(row.MemAvgMB ?? null);
    }
    html += '</tbody></table>';
    html += '<canvas id="perfChart" style="max-width:100%;height:300px;"></canvas>';
    container.innerHTML = kpiHtml + html;
    // Chart.js rendering
    if (window.Chart) {
      new Chart(document.getElementById('perfChart').getContext('2d'), {
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [
            { label: 'CPU Avg', data: cpuData, borderColor: '#2e7be4', fill: false },
            { label: 'Mem Avg', data: memData, borderColor: '#6ad1ff', fill: false }
          ]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
      });
    }
    if (window.__debugLog) window.__debugLog('PerfTelemetry loaded and chart rendered.');
    // Filtering UI (date range)
    const filterDiv = document.createElement('div');
    filterDiv.innerHTML = `
      <label>Start: <input type="date" id="perfStart"></label>
      <label>End: <input type="date" id="perfEnd"></label>
      <button id="perfFilterBtn">Apply</button>
    `;
    container.prepend(filterDiv);
    document.getElementById('perfFilterBtn').onclick = async () => {
      const start = document.getElementById('perfStart').value;
      const end = document.getElementById('perfEnd').value;
      if (window.__debugLog) window.__debugLog('PerfTelemetry filter: ' + start + ' to ' + end);
      // Reload with filter params
      await window.perfViewInit({ start, end });
    };
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load data: ${e.message}`;
    if (window.__debugLog) window.__debugLog('PerfTelemetry error: ' + e.message + ' Stack: ' + (e.stack||''));
  }
};
