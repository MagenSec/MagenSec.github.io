// installsView.js: Handles install telemetry view
// Fetches and displays InstallTelemetry data for the current org
window.installsViewInit = async function installsViewInit(filterParams) {
  const container = document.getElementById('installsTelemetryContainer');
  if (!container) return;
  const org = sessionStorage.getItem('org');
  container.innerHTML = '<div class="loading">Loading install telemetry...';
  if (window.__debugLog) window.__debugLog('Loading InstallTelemetry for org: ' + org);
  if (window.__debugLog) window.__debugLog('installsViewInit() called. Container: ' + !!container);
  try {
    const params = filterParams || {};
    const data = await dataService.fetchOData('InstallTelemetry', org, params);
    if (!data || !data.value || !data.value.length) {
      container.innerHTML = '<div class="error">No install telemetry found for this org.';
      if (window.__debugLog) window.__debugLog('No InstallTelemetry data found. Data: ' + JSON.stringify(data));
      return;
    }
    if (window.__debugLog) window.__debugLog('First InstallTelemetry row: ' + JSON.stringify(data.value[0]));
    let html = '<table class="telemetry-table"><thead><tr>';
    html += '<th>Timestamp</th><th>Device</th><th>App Name</th><th>Status</th></tr></thead><tbody>';
    for (const row of data.value) {
      html += `<tr><td>${row.Timestamp ?? ''}</td><td>${row.Context2 ?? ''}</td><td>${row.Context3 ?? ''}</td><td>${row.Status ?? ''}</td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
    if (window.__debugLog) window.__debugLog('InstallTelemetry loaded.');
    // Filtering UI (status)
    const filterDiv = document.createElement('div');
    filterDiv.innerHTML = `
      <label>Status: <input type="text" id="installsStatus"></label>
      <button id="installsFilterBtn">Apply</button>
    `;
    container.prepend(filterDiv);
    document.getElementById('installsFilterBtn').onclick = async () => {
      const status = document.getElementById('installsStatus').value;
      if (window.__debugLog) window.__debugLog('InstallTelemetry filter: ' + status);
      await window.installsViewInit({ status });
    };
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load data: ${e.message}`;
    if (window.__debugLog) window.__debugLog('InstallTelemetry error: ' + e.message + ' Stack: ' + (e.stack||''));
  }
};

/*
 * TODO: Modernize and modularize installsView.js using dashboardView.js patterns:
 * - Modular filter dropdowns (Org, Process, Version, Aggregation)
 * - Animated KPI cards for install metrics (e.g., Installs, Failures, Updates)
 * - Timezone/theme toggles (reuse modular logic)
 * - Responsive, modern tables/charts
 * - Patch time displays for timezone
 * - Preserve org/session/security logic
 * - Add comments for extensibility
 */
