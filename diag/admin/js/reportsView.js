// reportsView.js: Handles the generation and display of comprehensive reports.

(function() {
    if (!window.viewInitializers) {
        window.viewInitializers = {};
    }

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
    window.viewInitializers.reports = async function reportsViewInit(container, { dataService }) {
  if (!container) {
    console.error('Reports view requires a container element.');
    return;
  }

    const org = sessionStorage.getItem('org') || 'all';
    container.innerHTML = `
        <div class="page-header">
            <div class="d-flex-inline">
                <h2 class="page-title">Comprehensive Security Report</h2>
                <div class="text-muted mt-1">For organization: <strong id="report-org-name">${org}</strong> | Generated on: <strong id="report-generated-date">${new Date().toLocaleDateString()}</strong></div>
            </div>
            <div class="ms-auto">
                 <button id="printReportBtn" class="btn btn-primary">
                    <i class="ti ti-printer me-2"></i>
                    Print Report
                </button>
            </div>
        </div>
        <div id="report-content" class="mt-4">
            <div class="page-preloader"><div class="spinner"></div><p class="mt-2">Generating comprehensive report...</p></div>
        </div>
    `;

    const reportContent = container.querySelector('#report-content');

    try {
        const report = await dataService.getReportsData(org);
        await window.charting.googleChartsLoaded;

        if (!report) {
            reportContent.innerHTML = '<div class="alert alert-info">Could not generate a report. Data may be unavailable.</div>';
            return;
        }

        // Update header placeholders
        container.querySelector('#report-org-name').textContent = report.org;
        container.querySelector('#report-generated-date').textContent = report.generated.toLocaleString();

        // --- Build Report Sections ---

        // 0. Info Banner
        let html = `
            <div class="alert alert-info" role="alert">
                <div class="d-flex">
                    <div><i class="ti ti-info-circle me-2"></i></div>
                    <div>
                        <h4 class="alert-title">Report Information</h4>
                        <div class="text-muted">
                            This report is a snapshot of data for the selected organization(s): <strong>${report.org}</strong>.
                            All timestamps are displayed in your configured timezone (<strong>${window.timeUtils.isUtc() ? 'UTC' : 'Local'}</strong>).
                            Data is subject to a cache of up to 5 minutes.
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 1. Summary Cards
        html += renderReportSummary(report);

        // 2. AI Summary Placeholder
        html += `
            <div class="card mt-4">
                <div class="card-header">
                    <h3 class="card-title">AI-Powered Summary & Action Items</h3>
                    <div class="card-actions">
                        <span class="badge bg-blue-lt">Coming Soon</span>
                    </div>
                </div>
                <div class="card-body text-muted">
                    An AI-generated summary of key findings and recommended actions will be available here in a future update.
                </div>
            </div>
        `;

        // 3. Device Table
        const deviceHeaders = ['Hostname', 'OS Version', 'Client Version', 'Status', 'Last Seen'];
        const deviceRows = report.devices.map(d => {
            const outdatedHtml = d.isOutdated
                ? ` <span class="badge bg-yellow-lt ms-1" title="An updated client is available.">Outdated</span>`
                : '';
            return [
                d.hostname || d.id || 'N/A',
                d.osVersion || 'N/A',
                `${d.clientVersion || 'N/A'}${outdatedHtml}`,
                d.isOnline ? `<span class="badge bg-green-lt">Online</span>` : `<span class="badge bg-secondary-lt">Offline</span>`,
                d.lastSeen ? window.timeUtils.formatTimestamp(d.lastSeen) : 'Never'
            ];
        });
        html += renderReportTable('Device Fleet Overview', deviceHeaders, deviceRows);

        // 4. Security Events Table (Sorted by severity)
        const eventHeaders = ['Timestamp', 'Device', 'Description', 'Severity'];
        const severityOrder = { 'Critical': 1, 'High': 2, 'Medium': 3, 'Low': 4, 'Informational': 5 };
        report.securityEvents.sort((a, b) => {
            const severityA = severityOrder[a.severity] || 99;
            const severityB = severityOrder[b.severity] || 99;
            if (severityA !== severityB) {
                return severityA - severityB;
            }
            // Secondary sort by timestamp, newest first
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeB - timeA;
        });

        const eventRows = report.securityEvents.slice(0, 50).map(e => { // Limit to most recent 50
            const severityClass = {
                'Critical': 'danger',
                'High': 'warning',
                'Medium': 'yellow',
                'Low': 'secondary'
            }[e.severity] || 'info';

            return [
                e.timestamp ? window.timeUtils.formatTimestamp(e.timestamp) : 'N/A',
                e.device || 'N/A',
                e.event || 'N/A',
                `<span class="badge bg-${severityClass}-lt">${e.severity || 'N/A'}</span>`
            ];
        });
        html += renderReportTable('Recent Security Events (Top 50)', eventHeaders, eventRows);

        // 5. Application Landscape Section
        const getRiskBadge = (probability) => {
            const p = probability || 0;
            if (p > 0.9) return `<span class="badge bg-danger-lt">Critical</span>`;
            if (p > 0.7) return `<span class="badge bg-danger-lt">High</span>`;
            if (p > 0.4) return `<span class="badge bg-warning-lt">Medium</span>`;
            if (p > 0) return `<span class="badge bg-yellow-lt">Low</span>`;
            return `<span class="badge bg-secondary-lt">None</span>`;
        };

        const appRiskDistribution = report.applications.reduce((acc, app) => {
            const p = app.exploitProbability || 0;
            let riskLevel;
            if (p > 0.9) riskLevel = 'Critical';
            else if (p > 0.7) riskLevel = 'High';
            else if (p > 0.4) riskLevel = 'Medium';
            else if (p > 0) riskLevel = 'Low';
            else riskLevel = 'None';
            acc[riskLevel] = (acc[riskLevel] || 0) + 1; // Counting unique apps
            return acc;
        }, {});

        html += `
        <div class="row row-deck row-cards mt-4">
            <div class="col-lg-8">
                ${renderReportTable('Application Landscape (Aggregated)', 
                    ['Application', 'Publisher', 'Version', 'Installations', 'Highest Risk'], 
                    report.applications
                        .sort((a, b) => (b.installCount || 0) - (a.installCount || 0))
                        .map(a => [
                            a.appName || 'N/A',
                            a.publisher || 'N/A',
                            a.version || 'N/A',
                            a.installCount || 0,
                            getRiskBadge(a.exploitProbability)
                        ])
                )}
            </div>
            <div class="col-lg-4">
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Application Risk Distribution</h3></div>
                    <div class="card-body">
                        <div id="report-app-risk-chart" style="height: 250px"></div>
                    </div>
                </div>
            </div>
        </div>
        `;
        
        reportContent.innerHTML = html;

        // Render the chart now that the container is in the DOM
        const appRiskData = Object.entries(appRiskDistribution);
        const appRiskHeader = ['Application Risk', 'Count'];
        const appRiskOptions = { colors: ['#d63939', '#f76707', '#f59f00', '#adb5bd', '#206bc4'] };
        window.charting.renderPieChart('report-app-risk-chart', appRiskData, appRiskHeader, appRiskOptions);

        // Add event listener for the print button
        container.querySelector('#printReportBtn').addEventListener('click', () => {
            window.print();
        });

    } catch (e) {
        console.error('Failed to generate report:', e);
        reportContent.innerHTML = `<div class="alert alert-danger">Failed to generate report: ${e.message}</div>`;
    }
}; 

})();
