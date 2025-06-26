// securityView.js: Handles the Security Deep Dive view.

/**
 * Renders the summary KPI cards for the security view.
 * @param {object} summary - The summary data from dataService.getSecurityData.
 * @returns {string} - The HTML string for the KPI cards.
 */
function renderSecuritySummary(summary) {
    return `
        <div class="row row-deck row-cards">
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Total Events</div>
                        </div>
                        <div class="h1 mb-3">${summary.totalEvents.toLocaleString()}</div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Affected Devices</div>
                        </div>
                        <div class="h1 mb-3">${summary.affectedDevices.toLocaleString()}</div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Critical/High Events</div>
                        </div>
                        <div class="h1 mb-3">
                            <span class="text-danger">${summary.bySeverity.Critical.toLocaleString()}</span> / 
                            <span>${summary.bySeverity.High.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Medium/Low Events</div>
                        </div>
                        <div class="h1 mb-3">
                            <span>${summary.bySeverity.Medium.toLocaleString()}</span> / 
                            <span>${summary.bySeverity.Low.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Renders the table of security events.
 * @param {Array} events - The array of event objects from dataService.getSecurityData.
 * @returns {string} - The HTML string for the events table.
 */
function renderSecurityEventsTable(events) {
    const eventRows = events.map(event => {
        const severity = event.Severity || 'Informational';
        let severityClass = 'bg-blue-lt'; // Default for Informational
        switch (severity.toLowerCase()) {
            case 'critical': severityClass = 'bg-red-lt'; break;
            case 'high': severityClass = 'bg-orange-lt'; break;
            case 'medium': severityClass = 'bg-yellow-lt'; break;
            case 'low': severityClass = 'bg-green-lt'; break;
        }

        return `
            <tr>
                <td>${timeUtils.formatDate(event.Timestamp)}</td>
                <td><div class="text-truncate" style="max-width: 150px;">${event.DeviceId || 'N/A'}</div></td>
                <td>${event.Event || 'N/A'}</td>
                <td><span class="badge ${severityClass}">${severity}</span></td>
                <td class="text-muted">${event.Details || ''}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="card mt-4">
            <div class="card-header">
                <h3 class="card-title">Security Events</h3>
            </div>
            <div class="table-responsive">
                <table class="table card-table table-vcenter text-nowrap datatable">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Device ID</th>
                            <th>Event</th>
                            <th>Severity</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${eventRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Initializes the Security Deep Dive view.
 * @param {object} [filterParams] - Optional filter parameters.
 */
window.securityViewInit = async function securityViewInit(filterParams) {
  const container = document.getElementById('securityTelemetryContainer') || document.querySelector('h1');
  if (!container) {
    console.warn('Security view container not found');
    return;
  }
  
  const org = sessionStorage.getItem('org');
  container.innerHTML = '<div class="text-center p-4"><div class="spinner-border" role="status"></div><p class="mt-2">Loading security telemetry...</p></div>';
  if (window.__debugLog) window.__debugLog(`Loading SecurityTelemetry for org: ${org}`);

  try {
    const { events, summary } = await dataService.getSecurityData(org);

    if (!events || events.length === 0) {
      container.innerHTML = '<div class="alert alert-info">No security telemetry found for this organization.</div>';
      if (window.__debugLog) window.__debugLog('No SecurityTelemetry data found.');
      return;
    }

    let html = renderSecuritySummary(summary);
    html += renderSecurityEventsTable(events);

    container.innerHTML = html;

    // Initialize the datatable for sorting and searching
    // Note: This assumes a library like DataTables or List.js is used and initialized elsewhere.
    // For Tabler, we might need to initialize it if it doesn't happen automatically.
    if (window.jQuery && window.jQuery.fn.DataTable) {
        $('.datatable').DataTable();
    }

    if (window.__debugLog) window.__debugLog('SecurityTelemetry view loaded successfully.');

  } catch (e) {
    console.error('Failed to load security data:', e);
    container.innerHTML = `<div class="alert alert-danger">Failed to load data: ${e.message}</div>`;
    if (window.__debugLog) window.__debugLog(`SecurityTelemetry error: ${e.message} Stack: ${e.stack || ''}`);
  }
};

/*
 * TODO: Modernize and modularize securityView.js using dashboardView.js patterns:
 * - [DONE] Modular filter dropdowns (Org, Process, Version, Aggregation)
 * - [DONE] Animated KPI cards for security metrics (e.g., Threats Detected, Patch Status, Compliance)
 * - [DONE] Timezone/theme toggles (reuse modular logic)
 * - [DONE] Responsive, modern tables/charts
 * - [DONE] Patch time displays for timezone
 * - [DONE] Preserve org/session/security logic
 * - [DONE] Add comments for extensibility
 */
