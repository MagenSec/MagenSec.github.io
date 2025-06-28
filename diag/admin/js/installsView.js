// installsView.js: Handles install telemetry view
// Modernized to use dataService and render KPI cards and a paginated table.
(function() {
    if (!window.viewInitializers) {
        window.viewInitializers = {};
    }
    window.viewInitializers.installs = async function(container, { dataService }) {
        if (!container) {
            console.error('Installs view requires a container element.');
            return;
        }

        container.innerHTML = `
            <div id="installs-kpi-row" class="row row-deck row-cards"></div>
            <div class="card mt-4">
                <div class="card-header">
                    <h3 class="card-title">Installations Over Time</h3>
                </div>
                <div id="installs-timeline-chart" class="p-3" style="height: 300px;"></div>
            </div>
            <div class="card mt-4">
                <div class="card-header">
                    <h3 class="card-title">Installation Logs</h3>
                     <div class="ms-auto d-flex align-items-center">
                        <div class="text-muted me-3">
                            Status:
                            <div class="ms-2 d-inline-block">
                                <select id="installs-status-filter" class="form-select form-select-sm">
                                    <option value="all">All</option>
                                    <option value="successful">Successful</option>
                                    <option value="failed">Failed</option>
                                </select>
                            </div>
                        </div>
                        <div class="text-muted">
                            Search:
                            <div class="ms-2 d-inline-block">
                                <input type="text" id="installs-search" class="form-control form-control-sm" aria-label="Search install logs">
                            </div>
                        </div>
                    </div>
                </div>
                <div id="installs-table-container"></div>
            </div>
        `;

        const kpiRow = container.querySelector('#installs-kpi-row');
        const tableContainer = container.querySelector('#installs-table-container');
        const timelineChartContainer = container.querySelector('#installs-timeline-chart');

        kpiRow.innerHTML = '<div class="text-muted">Loading KPIs...</div>';
        tableContainer.innerHTML = '<div class="text-muted p-3">Loading installation logs...</div>';
        timelineChartContainer.innerHTML = '<div class="text-muted">Loading chart...</div>';

        const data = await (dataService.getInstallData ? dataService.getInstallData() : null);

        if (!data || !data.summary) {
            kpiRow.innerHTML = '<div class="alert alert-warning">Could not load installation summary.</div>';
            tableContainer.innerHTML = '';
            return;
        }

        const { summary, installs } = data;

        // --- Render KPIs ---
        const kpiMap = {
            total: { title: 'Total Installs', icon: 'package' },
            successful: { title: 'Successful', icon: 'circle-check' },
            failed: { title: 'Failed', icon: 'alert-circle' },
            last24h: { title: 'Last 24 Hours', icon: 'clock-hour-4' },
            last7d: { title: 'Last 7 Days', icon: 'calendar-event' },
        };

        let kpiHtml = '';
        Object.entries(kpiMap).forEach(([key, config]) => {
            const value = summary[key] !== undefined ? summary[key] : 'N/A';
            kpiHtml += `
                <div class="col-lg col-md-4 col-sm-6">
                    <div class="card kpi-tile">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <div class="subheader">${config.title}</div>
                            </div>
                            <div class="d-flex align-items-baseline mt-3">
                                <div class="h1 mb-0 me-2">${value}</div>
                                <div class="ms-auto">
                                    <span class="text-secondary"><i class="ti ti-${config.icon} icon-lg"></i></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
        kpiRow.innerHTML = kpiHtml;

        // --- Render Timeline Chart ---
        if (installs && installs.length > 0) {
            await window.charting.googleChartsLoaded;
            renderTimelineChart(installs, timelineChartContainer);
        } else {
            timelineChartContainer.innerHTML = '<div class="text-muted p-3">No data available to display a timeline chart.</div>';
        }

        // --- Render Table ---
        renderInstallationsTable(installs, tableContainer);

        // --- Add Event Listeners ---
        addInstallEventListeners(installs, tableContainer);
    };
})();

function addInstallEventListeners(allInstalls, tableContainer) {
    const searchInput = document.getElementById('installs-search');
    const statusFilter = document.getElementById('installs-status-filter');
    
    let currentInstalls = [...allInstalls];
    let currentPage = 1;
    const pageSize = 15;
    let sortColumn = 'timestamp';
    let sortDirection = 'desc';

    const renderTablePage = (page) => {
        currentPage = page;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pageData = currentInstalls.slice(start, end);

        const tableId = 'installs-logs-table';
        if (tableContainer.querySelector(`#${tableId}`) === null) {
            tableContainer.innerHTML = `
                <div class="table-responsive">
                    <table id="${tableId}" class="table card-table table-vcenter text-nowrap datatable">
                        <thead>
                            <tr>
                                <th class="sortable" data-sort="timestamp">Timestamp</th>
                                <th class="sortable" data-sort="device">Device ID</th>
                                <th class="sortable" data-sort="appName">Application</th>
                                <th class="sortable" data-sort="version">Version</th>
                                <th class="sortable" data-sort="status">Status</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="card-footer d-flex align-items-center">
                    <p class="m-0 text-muted">Showing <span id="${tableId}-start">1</span> to <span id="${tableId}-end">10</span> of <span id="${tableId}-total">${currentInstalls.length}</span> entries</p>
                    <ul id="${tableId}-pagination" class="pagination m-0 ms-auto"></ul>
                </div>
            `;
        }

        const tableBody = tableContainer.querySelector(`#${tableId} tbody`);
        const timeUtils = window.timeUtils;

        if (pageData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No logs found matching your criteria.</td></tr>';
        } else {
            tableBody.innerHTML = pageData.map(row => `
                <tr>
                    <td data-label="Timestamp" data-timestamp="${new Date(row.timestamp).getTime()}">${timeUtils.formatTimestamp(row.timestamp)}</td>
                    <td data-label="Device ID" class="text-muted">${row.device}</td>
                    <td data-label="Application">${row.appName}</td>
                    <td data-label="Version" class="text-muted">${row.version}</td>
                    <td data-label="Status">
                        <span class="badge bg-${row.status?.toLowerCase().includes('succ') ? 'success' : 'danger'}-lt">${row.status || 'N/A'}</span>
                    </td>
                    <td data-label="Details" class="text-muted text-truncate" style="max-width: 300px;" title="${row.details}">${row.details}</td>
                </tr>
            `).join('');
        }

        document.getElementById(`${tableId}-start`).textContent = currentInstalls.length > 0 ? start + 1 : 0;
        document.getElementById(`${tableId}-end`).textContent = Math.min(end, currentInstalls.length);
        document.getElementById(`${tableId}-total`).textContent = currentInstalls.length;

        const paginationElement = document.getElementById(`${tableId}-pagination`);
        const totalPages = Math.ceil(currentInstalls.length / pageSize);
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
        const statusValue = statusFilter.value;
        
        currentInstalls = allInstalls.filter(install => {
            const statusMatch = statusValue === 'all' ||
                (statusValue === 'successful' && install.status?.toLowerCase().includes('succ')) ||
                (statusValue === 'failed' && !install.status?.toLowerCase().includes('succ'));

            if (!statusMatch) return false;

            const searchableString = `${install.device || ''} ${install.appName || ''} ${install.version || ''} ${install.status || ''} ${install.details || ''}`.toLowerCase();
            return searchableString.includes(searchTerm);
        });

        currentInstalls.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];

            if (sortColumn === 'timestamp') {
                valA = new Date(a.timestamp).getTime();
                valB = new Date(b.timestamp).getTime();
            }

            if (typeof valA === 'string') {
                return sortDirection === 'asc' ? valA.localeCompare(valA) : valB.localeCompare(valA);
            } else {
                return sortDirection === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
            }
        });

        renderTablePage(1);
    };

    searchInput.addEventListener('keyup', applySearchAndSort);
    statusFilter.addEventListener('change', applySearchAndSort);

    tableContainer.addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (header) {
            const newSortColumn = header.dataset.sort;
            if (newSortColumn === sortColumn) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = newSortColumn;
                sortDirection = newSortColumn === 'timestamp' ? 'desc' : 'asc';
            }
            applySearchAndSort();
        }
    });

    applySearchAndSort();
}

function renderTimelineChart(installs, container) {
    const dataByDay = installs.reduce((acc, install) => {
        // Ensure timestamp and status exist to avoid errors
        if (!install.timestamp || !install.status) {
            return acc;
        }
        const date = new Date(install.timestamp).toISOString().split('T')[0];
        const status = install.status.toLowerCase().includes('succ') ? 'successful' : 'failed';

        if (!acc[date]) {
            acc[date] = { successful: 0, failed: 0 };
        }
        acc[date][status]++;
        return acc;
    }, {});

    const sortedDates = Object.keys(dataByDay).sort((a, b) => new Date(a) - new Date(b));

    // Limit to last 30 days with data
    const last30DaysData = sortedDates.slice(-30);

    if (last30DaysData.length < 2) {
        container.innerHTML = '<div class="text-muted p-3">Not enough historical data for a meaningful timeline.</div>';
        return;
    }

    const header = ['Date', 'Successful', 'Failed'];
    const rows = last30DaysData.map(dateStr => {
        const data = dataByDay[dateStr];
        const d = new Date(dateStr);
        const formattedDate = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        return [formattedDate, data.successful, data.failed];
    });

    const options = {
        isStacked: true,
        colors: ['#2fb344', '#d63939'], // Tabler success and danger colors
        vAxisTitle: 'Installs',
        hAxisFormat: 'MM/dd'
    };

    window.charting.renderAreaChart(container.id, rows, header, options);
}

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.installsViewInit;
