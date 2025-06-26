// reportsView.js: Handles the generation and display of comprehensive reports.

/**
 * Generates the HTML for the main report summary section.
 * @param {object} report - The aggregated report data.
 * @returns {string} HTML string for the summary cards.
 */
function renderReportSummary(report) {
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
                                    ${report.liveDevices}
                                </span> / 
                                <span class="text-muted d-inline-flex align-items-center lh-1">
                                    ${report.coldDevices}
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
                                    ${report.vulnerableApps}
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
                                    ${report.securityEventsBySeverity.Critical}
                                </span> /
                                <span class="text-warning d-inline-flex align-items-center lh-1">
                                    ${report.securityEventsBySeverity.High}
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
    const bodyHtml = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');

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
window.reportsViewInit = async function reportsViewInit() {
  const container = document.getElementById('reportsContainer') || document.querySelector('h1');
  if (!container) {
    console.warn('Reports container not found');
    return;
  }

    const org = sessionStorage.getItem('org');
    container.innerHTML = '<div class="text-center p-4"><div class="spinner-border" role="status"></div><p class="mt-2">Generating comprehensive report...</p></div>';
    if (window.__debugLog) window.__debugLog(`Generating report for org: ${org}`);

    try {
        const report = await dataService.getReportsData(org);

        if (!report) {
            container.innerHTML = '<div class="alert alert-info">Could not generate a report. Data may be unavailable.</div>';
            return;
        }

        // --- Build Report Sections ---

        // 1. Summary Cards
        let html = renderReportSummary(report);

        // 2. Device Table
        const deviceHeaders = ['Name', 'OS', 'Client Version', 'Status', 'Last Seen'];
        const deviceRows = report.devices.map(d => [
            d.name,
            d.os,
            d.clientVersion,
            d.status === 'Live' ? `<span class="badge bg-green-lt">Live</span>` : `<span class="badge bg-gray-lt">Cold</span>`,
            timeUtils.formatDate(d.lastSeenTimestamp)
        ]);
        html += renderReportTable('Device Fleet Overview', deviceHeaders, deviceRows);

        // 3. Application Table
        const appHeaders = ['Name', 'Publisher', 'Versions', 'Installations', 'Risk Level'];
        const appRows = report.applications.map(a => [
            a.name,
            a.publisher,
            `<div class="text-truncate" style="max-width: 200px;">${a.versions}</div>`,
            a.installCount,
            a.riskLevel
        ]);
        html += renderReportTable('Application Landscape', appHeaders, appRows);
        
        // 4. Security Events Table
        const eventHeaders = ['Timestamp', 'Device ID', 'Event', 'Severity'];
        const eventRows = report.securityEvents.slice(0, 20).map(e => [ // Limit to most recent 20 for brevity
            timeUtils.formatDate(e.Timestamp),
            e.DeviceId || 'N/A',
            e.Event || 'N/A',
            e.Severity || 'Informational'
        ]);
        html += renderReportTable('Recent Security Events (Top 20)', eventHeaders, eventRows);


        container.innerHTML = `
            <div class="page-header">
                <div class="d-flex-inline">
                    <h2 class="page-title">Comprehensive Security Report</h2>
                    <div class="text-muted mt-1">For organization: ${org} | Generated on: ${new Date().toLocaleDateString()}</div>
                </div>
                <div class="ms-auto">
                     <button id="printReportBtn" class="btn btn-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" /><path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" /><path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" /></svg>
                        Print Report
                    </button>
                </div>
            </div>
            ${html}
        `;

        // Add event listener for the print button
        document.getElementById('printReportBtn').addEventListener('click', () => {
            window.print();
        });

        if (window.__debugLog) window.__debugLog('Report view generated successfully.');

    } catch (e) {
        console.error('Failed to generate report:', e);
        container.innerHTML = `<div class="alert alert-danger">Failed to generate report: ${e.message}</div>`;
        if (window.__debugLog) window.__debugLog(`Report generation error: ${e.message} Stack: ${e.stack || ''}`);
    }
};
