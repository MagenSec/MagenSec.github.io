// appsView.js: Handles applications telemetry view
// Fetches and displays AppTelemetry data for the current org
window.appsViewInit = async function appsViewInit(filterParams) {
  const container = document.getElementById('appsTelemetryContainer');
  if (!container) return;
  const org = sessionStorage.getItem('org');
  container.innerHTML = '<div class="loading">Loading applications telemetry...';
  if (window.__debugLog) window.__debugLog('Loading AppTelemetry for org: ' + org);
  if (window.__debugLog) window.__debugLog('appsViewInit() called. Container: ' + !!container);
  try {
    const params = filterParams || {};
    const data = await dataService.fetchOData('AppTelemetry', org, params);
    if (!data || !data.value || !data.value.length) {
      container.innerHTML = '<div class="error">No applications telemetry found for this org.';
      if (window.__debugLog) window.__debugLog('No AppTelemetry data found. Data: ' + JSON.stringify(data));
      return;
    }
    // Debug log for first row
    if (window.__debugLog) window.__debugLog('First AppTelemetry row: ' + JSON.stringify(data.value[0]));
    let html = '<table class="telemetry-table"><thead><tr>';
    html += '<th>Timestamp</th><th>Device</th><th>App Name</th><th>Version</th></tr></thead><tbody>';
    for (const row of data.value) {
      html += `<tr><td>${row.Timestamp ?? ''}</td><td>${row.Context2 ?? ''}</td><td>${row.AppName ?? ''}</td><td>${row.AppVersion ?? ''}</td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
    if (window.__debugLog) window.__debugLog('AppTelemetry loaded.');
    // Filtering UI (app name)
    const filterDiv = document.createElement('div');
    filterDiv.innerHTML = `
      <label>App Name: <input type="text" id="appsAppName"></label>
      <button id="appsFilterBtn">Apply</button>
    `;
    container.prepend(filterDiv);
    document.getElementById('appsFilterBtn').onclick = async () => {
      const appName = document.getElementById('appsAppName').value;
      if (window.__debugLog) window.__debugLog('AppTelemetry filter: ' + appName);
      await window.appsViewInit({ appName });
    };
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load data: ${e.message}`;
    if (window.__debugLog) window.__debugLog('AppTelemetry error: ' + e.message + ' Stack: ' + (e.stack||''));
  }
};

/*
 * TODO: Modernize and modularize appsView.js using dashboardView.js patterns:
 * - Modular filter dropdowns (Org, Process, Version, Aggregation)
 * - Animated KPI cards for app metrics (e.g., App Count, Active Users, Errors)
 * - Timezone/theme toggles (reuse modular logic)
 * - Responsive, modern tables/charts
 * - Patch time displays for timezone
 * - Preserve org/session/security logic
 * - Add comments for extensibility
 */
