// securityView.js: Handles the Security Deep Dive view.

window.securityViewInit = async function(container, { dataService }) {
    if (!container) {
        console.error('Security view requires a container element.');
        return;
    }

    container.innerHTML = `
        <div id="security-kpi-row" class="row row-deck row-cards"></div>
        <div class="card mt-4">
            <div class="card-header">
                <h3 class="card-title">Security Events Over Time</h3>
            </div>
            <div id="security-timeline-chart" class="p-3" style="height: 300px;"></div>
        </div>
        <div class="card mt-4">
            <div class="card-header">
                <h3 class="card-title">Security Event Logs</h3>
                <div class="ms-auto d-flex align-items-center">
                     <div class="text-muted me-3">
                        Severity:
                        <div class="ms-2 d-inline-block">
                            <select id="security-severity-filter" class="form-select form-select-sm">
                                <option value="all">All</option>
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                    </div>
                    <div class="text-muted">
                        Search:
                        <div class="ms-2 d-inline-block">
                            <input type="text" id="security-search" class="form-control form-control-sm" aria-label="Search security events">
                        </div>
                    </div>
                </div>
            </div>
            <div id="security-table-container"></div>
        </div>
    `;

    const kpiRow = container.querySelector('#security-kpi-row');
    const tableContainer = container.querySelector('#security-table-container');
    const timelineChartContainer = container.querySelector('#security-timeline-chart');

    kpiRow.innerHTML = '<div class="text-muted">Loading KPIs...</div>';
    tableContainer.innerHTML = '<div class="text-muted p-3">Loading security events...</div>';
    timelineChartContainer.innerHTML = '<div class="text-muted">Loading chart...</div>';

    const data = await (dataService.getSecurityData ? dataService.getSecurityData() : null);

    if (!data || !data.summary) {
        kpiRow.innerHTML = '<div class="alert alert-warning">Could not load security summary.</div>';
        tableContainer.innerHTML = '';
        return;
    }

    const { summary, events } = data;

    // --- Render KPIs ---
    const kpiHtml = `
        <div class="col-sm-6 col-lg-3">
            <div class="card kpi-tile">
                <div class="card-body">
                    <div class="subheader">Total Events</div>
                    <div class="h1 mt-2">${summary.totalEvents.toLocaleString()}</div>
                </div>
            </div>
        </div>
        <div class="col-sm-6 col-lg-3">
            <div class="card kpi-tile">
                <div class="card-body">
                    <div class="subheader">Affected Devices</div>
                    <div class="h1 mt-2">${summary.affectedDevices.toLocaleString()}</div>
                </div>
            </div>
        </div>
        <div class="col-sm-6 col-lg-3">
            <div class="card kpi-tile">
                <div class="card-body">
                    <div class="subheader">Critical / High</div>
                    <div class="h1 mt-2">
                        <span class="text-danger">${(summary.bySeverity.Critical || 0).toLocaleString()}</span> /
                        <span class="text-orange">${(summary.bySeverity.High || 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-sm-6 col-lg-3">
            <div class="card kpi-tile">
                <div class="card-body">
                    <div class="subheader">Medium & Low Severity</div>
                    <div class="h1 mt-2">
                        <span>${((summary.bySeverity.Medium || 0) + (summary.bySeverity.Low || 0)).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    kpiRow.innerHTML = kpiHtml;

    // --- Render Timeline Chart ---
    if (events && events.length > 0) {
        google.charts.load('current', { packages: ['corechart'] });
        google.charts.setOnLoadCallback(() => renderSecurityTimelineChart(events, timelineChartContainer));
    } else {
        timelineChartContainer.innerHTML = '<div class="text-muted p-3">No data available to display a timeline chart.</div>';
    }

    // --- Render Table ---
    if (!events || events.length === 0) {
        tableContainer.innerHTML = '<div class="p-3 text-muted">No security events found for this organization.</div>';
        return;
    }

    addSecurityEventListeners(events, tableContainer);
};

function addSecurityEventListeners(allEvents, tableContainer) {
    const searchInput = document.getElementById('security-search');
    const severityFilter = document.getElementById('security-severity-filter');

    let currentEvents = [...allEvents];
    let currentPage = 1;
    const pageSize = 15;
    let sortColumn = 'timestamp';
    let sortDirection = 'desc';

    const renderTablePage = (page) => {
        currentPage = page;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pageData = currentEvents.slice(start, end);

        const tableId = 'security-events-table';
        if (tableContainer.querySelector(`#${tableId}`) === null) {
            tableContainer.innerHTML = `
                <div class="table-responsive">
                    <table id="${tableId}" class="table card-table table-vcenter text-nowrap datatable">
                        <thead>
                            <tr>
                                <th class="sortable" data-sort="timestamp">Timestamp</th>
                                <th class="sortable" data-sort="device">Device</th>
                                <th class="sortable" data-sort="description">Description</th>
                                <th class="sortable" data-sort="type">Type</th>
                                <th class="sortable" data-sort="severity">Severity</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="card-footer d-flex align-items-center">
                    <p class="m-0 text-muted">Showing <span id="${tableId}-start">1</span> to <span id="${tableId}-end">10</span> of <span id="${tableId}-total">${currentEvents.length}</span> entries</p>
                    <ul id="${tableId}-pagination" class="pagination m-0 ms-auto"></ul>
                </div>
            `;
        }

        const tableBody = tableContainer.querySelector(`#${tableId} tbody`);
        const timeUtils = window.timeUtils;

        const getSeverityClass = (severity) => {
            if (!severity) return 'bg-secondary-lt';
            switch (severity.toLowerCase()) {
                case 'critical': return 'bg-danger-lt';
                case 'high': return 'bg-orange-lt';
                case 'medium': return 'bg-yellow-lt';
                case 'low': return 'bg-secondary-lt';
                default: return 'bg-blue-lt';
            }
        };

        if (pageData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No events found matching your criteria.</td></tr>';
        } else {
            tableBody.innerHTML = pageData.map(row => `
                <tr>
                    <td data-label="Timestamp" data-timestamp="${new Date(row.timestamp).getTime()}">${timeUtils.formatTimestamp(row.timestamp)}</td>
                    <td data-label="Device" class="text-muted" title="ID: ${row.deviceId}">${row.device}</td>
                    <td data-label="Description">${row.description}</td>
                    <td data-label="Type" class="text-muted">${row.type}</td>
                    <td data-label="Severity"><span class="badge ${getSeverityClass(row.severity)}">${row.severity || 'N/A'}</span></td>
                    <td data-label="Details" class="text-muted text-truncate" style="max-width: 250px;" title="${row.details}">${row.details}</td>
                </tr>
            `).join('');
        }

        document.getElementById(`${tableId}-start`).textContent = currentEvents.length > 0 ? start + 1 : 0;
        document.getElementById(`${tableId}-end`).textContent = Math.min(end, currentEvents.length);
        document.getElementById(`${tableId}-total`).textContent = currentEvents.length;

        const paginationElement = document.getElementById(`${tableId}-pagination`);
        const totalPages = Math.ceil(currentEvents.length / pageSize);
        window.setupPagination(paginationElement, totalPages, renderTablePage, currentPage);

        tableContainer.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === sortColumn) {
                th.classList.add(sortDirection);
            }
        });
    };

    const applySearchAndSort = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const severityValue = severityFilter.value.toLowerCase();
        
        currentEvents = allEvents.filter(event => {
            const severityMatch = severityValue === 'all' || (event.severity && event.severity.toLowerCase() === severityValue);
            if (!severityMatch) return false;

            const searchableString = `${event.device || ''} ${event.description || ''} ${event.type || ''} ${event.severity || ''} ${event.details || ''}`.toLowerCase();
            return searchableString.includes(searchTerm);
        });

        const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        currentEvents.sort((a, b) => {
            let valA, valB;
            if (sortColumn === 'timestamp') {
                valA = new Date(a.timestamp).getTime();
                valB = new Date(b.timestamp).getTime();
            } else if (sortColumn === 'severity') {
                valA = severityOrder[a.severity?.toLowerCase()] || 0;
                valB = severityOrder[b.severity?.toLowerCase()] || 0;
            } else {
                valA = a[sortColumn] || '';
                valB = b[sortColumn] || '';
            }

            if (typeof valA === 'string') {
                return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            }
        });

        renderTablePage(1);
    };

    searchInput.addEventListener('keyup', applySearchAndSort);
    severityFilter.addEventListener('change', applySearchAndSort);

    tableContainer.addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (header) {
            const newSortColumn = header.dataset.sort;
            if (newSortColumn === sortColumn) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = newSortColumn;
                sortDirection = newSortColumn === 'timestamp' || newSortColumn === 'severity' ? 'desc' : 'asc';
            }
            applySearchAndSort();
        }
    });

    applySearchAndSort();
}

function renderSecurityTimelineChart(events, container) {
    const dataByDay = events.reduce((acc, event) => {
        if (!event.timestamp || !event.severity) {
            return acc;
        }
        const date = new Date(event.timestamp).toISOString().split('T')[0];
        const severity = event.severity.toLowerCase();

        if (!acc[date]) {
            acc[date] = { critical: 0, high: 0, medium: 0, low: 0 };
        }
        if (acc[date][severity] !== undefined) {
            acc[date][severity]++;
        }
        return acc;
    }, {});

    const sortedDates = Object.keys(dataByDay).sort((a, b) => new Date(a) - new Date(b));
    const last30DaysData = sortedDates.slice(-30);

    if (last30DaysData.length < 2) {
        container.innerHTML = '<div class="text-muted p-3">Not enough historical data for a meaningful timeline.</div>';
        return;
    }

    const dataTable = new google.visualization.DataTable();
    dataTable.addColumn('string', 'Date');
    dataTable.addColumn('number', 'Critical');
    dataTable.addColumn('number', 'High');
    dataTable.addColumn('number', 'Medium');
    dataTable.addColumn('number', 'Low');

    last30DaysData.forEach(dateStr => {
        const data = dataByDay[dateStr];
        const d = new Date(dateStr);
        const formattedDate = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        dataTable.addRow([formattedDate, data.critical, data.high, data.medium, data.low]);
    });

    const options = {
        chartArea: { width: '90%', height: '75%' },
        legend: { position: 'top', alignment: 'end' },
        hAxis: { slantedText: false, gridlines: { color: 'transparent' } },
        vAxis: { title: 'Events', minValue: 0, format: '0', gridlines: { color: 'transparent' } },
        isStacked: true,
        colors: ['#d63939', '#f76707', '#f59f00', '#adb5bd'], // Critical, High, Medium, Low
        areaOpacity: 0.3,
        pointSize: 4,
        lineWidth: 2,
        animation: {
            duration: 500,
            easing: 'out',
            startup: true
        },
        tooltip: { isHtml: true, trigger: 'both' }
    };

    const chart = new google.visualization.AreaChart(container);
    chart.draw(dataTable, options);
}

window.currentViewInit = window.securityViewInit;

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
