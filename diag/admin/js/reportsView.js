// reportsView.js: Handles the generation and display of comprehensive reports.

/**
 * Generates the HTML for the main report summary section.
 * @param {object} report - The aggregated report data.
 * @returns {string} HTML string for the summary cards.
 */
function renderReportSummary(report) {
    const securityCritical = report.securityEventsBySeverity?.Critical || 0;
    const securityHigh = report.securityEventsBySeverity?.High || 0;

    return `
        <div class="row row-deck row-cards">
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Security Score</div>
                        </div>
                        <div class="h1 mb-3">${report.securityScore} / 100</div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Managed Devices</div>
                        </div>
                        <div class="h1 mb-3">${report.managedDevices}</div>
                        <div class="d-flex mb-2">
                            <div>Live / Cold</div>
                            <div class="ms-auto">
                                <span class="text-green d-inline-flex align-items-center lh-1">
                                    ${report.liveDevices || 0}
                                </span> / 
                                <span class="text-muted d-inline-flex align-items-center lh-1">
                                    ${report.coldDevices || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Application Landscape</div>
                        </div>
                        <div class="h1 mb-3">${report.totalApps}</div>
                         <div class="d-flex mb-2">
                            <div>Vulnerable Apps</div>
                            <div class="ms-auto">
                                <span class="text-danger d-inline-flex align-items-center lh-1">
                                    ${report.vulnerableApps || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Security Events</div>
                        </div>
                        <div class="h1 mb-3">${report.totalSecurityEvents}</div>
                        <div class="d-flex mb-2">
                            <div>Critical / High</div>
                            <div class="ms-auto">
                                <span class="text-danger d-inline-flex align-items-center lh-1">
                                    ${securityCritical}
                                </span> /
                                <span class="text-warning d-inline-flex align-items-center lh-1">
                                    ${securityHigh}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generates the HTML for the detailed tables in the report.
 * @param {string} title - The title of the table section.
 * @param {Array<string>} headers - The table headers.
 * @param {Array<Array<string>>} rows - The data rows for the table.
 * @returns {string} HTML string for the table.
 */
function renderReportTable(title, headers, rows) {
    const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
    let bodyHtml;

    if (!rows || rows.length === 0) {
        bodyHtml = `<tr><td colspan="${headers.length}" class="text-center text-muted">No data available for this section.</td></tr>`;
    } else {
        bodyHtml = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
    }

    return `
        <div class="card mt-4">
            <div class="card-header">
                <h3 class="card-title">${title}</h3>
            </div>
            <div class="table-responsive">
                <table class="table card-table table-vcenter text-nowrap">
                    <thead>
                        <tr>${headerHtml}</tr>
                    </thead>
                    <tbody>
                        ${bodyHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Initializes the Reports view.
 */
window.reportsViewInit = async function reportsViewInit(container, { dataService }) {
  if (!container) {
    console.error('Reports view requires a container element.');
    return;
  }

    const org = sessionStorage.getItem('org') || 'all';
    container.innerHTML = `
        <div class="page-header">
            <div class="d-flex-inline">
                <h2 class="page-title">Comprehensive Security Report</h2>
                <div class="text-muted mt-1">For organization: <span id="report-org-name">${org}</span> | Generated on: <span id="report-generated-date">${new Date().toLocaleDateString()}</span></div>
            </div>
            <div class="ms-auto">
                 <button id="printReportBtn" class="btn btn-primary">
                    <i class="ti ti-printer me-2"></i>
                    Print Report
                </button>
            </div>
        </div>
        <div id="report-content" class="mt-4">
            <div class="text-center p-4">
                <div class="spinner-border" role="status"></div>
                <p class="mt-2">Generating comprehensive report...</p>
            </div>
        </div>
    `;

    const reportContent = container.querySelector('#report-content');

    try {
        const report = await dataService.getReportsData(org);

        if (!report) {
            reportContent.innerHTML = '<div class="alert alert-info">Could not generate a report. Data may be unavailable.</div>';
            return;
        }

        // Update header placeholders
        container.querySelector('#report-org-name').textContent = report.org;
        container.querySelector('#report-generated-date').textContent = report.generated.toLocaleString();

        // --- Build Report Sections ---

        // 1. Summary Cards
        let html = renderReportSummary(report);

        // 2. Device Table
        const deviceHeaders = ['Device ID', 'OS Version', 'Client Version', 'Status', 'Last Seen'];
        const deviceRows = report.devices.map(d => [
            d.id || 'N/A',
            d.osVersion || 'N/A',
            d.clientVersion || 'N/A',
            d.status === 'Online' ? `<span class="badge bg-success-lt">Online</span>` : `<span class="badge bg-secondary-lt">Offline</span>`,
            d.lastSeen ? window.timeUtils.formatTimestamp(d.lastSeen) : 'Never'
        ]);
        html += renderReportTable('Device Fleet Overview', deviceHeaders, deviceRows);

        // 3. Application Table
        const appHeaders = ['Application', 'Publisher', 'Versions', 'Installations', 'Highest Risk'];
        const appRows = report.applications.map(a => [
            a.name || 'N/A',
            a.publisher || 'N/A',
            `<div class="text-truncate" style="max-width: 200px;" title="${a.versions}">${a.versions || 'N/A'}</div>`,
            a.installCount || 0,
            a.riskLevel || 'N/A'
        ]);
        html += renderReportTable('Application Landscape (Aggregated)', appHeaders, appRows);
        
        // 4. Security Events Table
        const eventHeaders = ['Timestamp', 'Device', 'Description', 'Severity'];
        const eventRows = report.securityEvents.slice(0, 50).map(e => { // Limit to most recent 50
            const severityClass = {
                'Critical': 'danger',
                'High': 'warning',
                'Medium': 'yellow',
                'Low': 'secondary'
            }[e.severity] || 'info';

            return [
                e.detected ? window.timeUtils.formatTimestamp(e.detected) : 'N/A',
                e.device || 'N/A',
                e.description || 'N/A',
                `<span class="badge bg-${severityClass}-lt">${e.severity || 'N/A'}</span>`
            ];
        });
        html += renderReportTable('Recent Security Events (Top 50)', eventHeaders, eventRows);

        reportContent.innerHTML = html;

        // Add event listener for the print button
        container.querySelector('#printReportBtn').addEventListener('click', () => {
            window.print();
        });

    } catch (e) {
        console.error('Failed to generate report:', e);
        reportContent.innerHTML = `<div class="alert alert-danger">Failed to generate report: ${e.message}</div>`;
    }
};

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.reportsViewInit;
