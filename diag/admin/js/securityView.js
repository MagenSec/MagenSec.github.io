// securityView.js: Handles security telemetry view
// Fetches and displays SecurityTelemetry data for the current org
window.securityViewInit = async function securityViewInit(filterParams) {
  const container = document.getElementById('securityTelemetryContainer');
  if (!container) return;
  const org = sessionStorage.getItem('org');
  container.innerHTML = '<div class="loading">Loading security telemetry...';
  if (window.__debugLog) window.__debugLog('Loading SecurityTelemetry for org: ' + org);
  if (window.__debugLog) window.__debugLog('securityViewInit() called. Container: ' + !!container);
  try {
    const params = filterParams || {};
    const data = await dataService.fetchOData('SecurityTelemetry', org, params);
    if (!data || !data.value || !data.value.length) {
      container.innerHTML = '<div class="error">No security telemetry found for this org.';
      if (window.__debugLog) window.__debugLog('No SecurityTelemetry data found. Data: ' + JSON.stringify(data));
      return;
    }
    let html = '<table class="telemetry-table"><thead><tr>';
    html += '<th>Timestamp</th><th>Device</th><th>Event</th><th>Severity</th></tr></thead><tbody>';
    for (const row of data.value) {
      html += `<tr><td>${row.Timestamp || ''}</td><td>${row.DeviceId || ''}</td><td>${row.Event || ''}</td><td>${row.Severity || ''}</td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
    if (window.__debugLog) window.__debugLog('SecurityTelemetry loaded.');
    // Filtering UI (severity)
    const filterDiv = document.createElement('div');
    filterDiv.innerHTML = `
      <label>Severity: <input type="text" id="securitySeverity"></label>
      <button id="securityFilterBtn">Apply</button>
    `;
    container.prepend(filterDiv);
    document.getElementById('securityFilterBtn').onclick = async () => {
      const severity = document.getElementById('securitySeverity').value;
      if (window.__debugLog) window.__debugLog('SecurityTelemetry filter: ' + severity);
      await window.securityViewInit({ severity });
    };
    // TODO: Add filtering UI (date, device)
  } catch (e) {
    container.innerHTML = `<div class="error">Failed to load data: ${e.message}`;
    if (window.__debugLog) window.__debugLog('SecurityTelemetry error: ' + e.message + ' Stack: ' + (e.stack||''));
  }
};
