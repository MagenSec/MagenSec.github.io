// securityView.js: Handles the Security Deep Dive view.

(function() {
    if (!window.viewInitializers) {
        window.viewInitializers = {};
    }

    window.viewInitializers.security = async function(container, { dataService }) {
        if (!container) {
            console.error('Security view requires a container element.');
            return;
        }

        container.innerHTML = `
            <div id="security-kpi-row" class="row row-deck row-cards"></div>
            <div class="row row-cards mt-4">
                <div class="col-lg-8">
                    <div class="card h-100">
                        <div class="card-header">
                            <h3 class="card-title">Security Events Over Time</h3>
                        </div>
                        <div id="security-timeline-chart" class="p-3" style="height: 300px;"></div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="card h-100">
                        <div class="card-header">
                            <h3 class="card-title">Vulnerability Breakdown</h3>
                        </div>
                        <div id="vulnerability-breakdown-chart" class="p-3" style="height: 300px;"></div>
                    </div>
                </div>
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
        const vulnerabilityChartContainer = container.querySelector('#vulnerability-breakdown-chart');

        kpiRow.innerHTML = '<div class="text-muted">Loading KPIs...</div>';
        tableContainer.innerHTML = '<div class="text-muted p-3">Loading security events...</div>';
        timelineChartContainer.innerHTML = '<div class="text-muted">Loading chart...</div>';
        vulnerabilityChartContainer.innerHTML = '<div class="text-muted">Loading chart...</div>';

        const data = await (dataService.getSecurityData ? dataService.getSecurityData() : null);

        if (!data || !data.summary) {
            kpiRow.innerHTML = '<div class="alert alert-warning">Could not load security summary.</div>';
            tableContainer.innerHTML = '';
            return;
        }

        const { summary, events } = data;

        // --- Render all content ---
        renderSecurityKPIs(kpiRow, summary);
        renderTablePage(events, tableContainer, 1); // Initial render

        // --- Render Charts ---
        await window.charting.googleChartsLoaded;
        renderSecurityCharts(events, summary, timelineChartContainer, vulnerabilityChartContainer);
        
        // --- Add Event Listeners ---
        // This is now safe because the container is populated.
        addSecurityEventListeners(events, tableContainer);
    };

    function renderSecurityKPIs(kpiRow, summary) {
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
                            <span class="text-warning">${(summary.bySeverity.High || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card kpi-tile">
                    <div class="card-body">
                        <div class="subheader">Avg. Time to Remediate</div>
                        <div class="h1 mt-2">${summary.avgTimeToRemediateHours} <span class="fs-4 text-muted">hours</span></div>
                    </div>
                </div>
            </div>
        `;
        kpiRow.innerHTML = kpiHtml;
    }

    function renderSecurityCharts(events, summary, timelineContainer, vulnerabilityContainer) {
        // --- Render Timeline Chart ---
        if (events && events.length > 0) {
            renderSecurityTimelineChart(events, timelineContainer);
            if (summary && summary.bySeverity) {
                renderVulnerabilityChart(summary.bySeverity, vulnerabilityContainer);
            }
        } else {
            timelineContainer.innerHTML = '<div class="text-muted p-3">No data available to display a timeline chart.</div>';
            vulnerabilityContainer.innerHTML = '<div class="text-muted p-3">No data available for breakdown.</div>';
        }
    }

    function renderTablePage(events, tableContainer, page) {
        const rowsPerPage = 15;
        const filteredData = events; // Apply filters here if needed
        const pageCount = Math.ceil(filteredData.length / rowsPerPage);
        const start = (page - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const paginatedItems = filteredData.slice(start, end);

        tableContainer.innerHTML = `
            <div class="table-responsive">
                <table id="security-events-table" class="table card-table table-vcenter text-nowrap datatable">
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
                <p class="m-0 text-muted">Showing <span id="security-events-table-start">1</span> to <span id="security-events-table-end">10</span> of <span id="security-events-table-total">${filteredData.length}</span> entries</p>
                <ul id="security-events-table-pagination" class="pagination m-0 ms-auto"></ul>
            </div>
        `;

        const tableBody = tableContainer.querySelector(`#security-events-table tbody`);
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

        if (paginatedItems.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No events found matching your criteria.</td></tr>';
        } else {
            tableBody.innerHTML = paginatedItems.map(row => `
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

        document.getElementById(`security-events-table-start`).textContent = filteredData.length > 0 ? start + 1 : 0;
        document.getElementById(`security-events-table-end`).textContent = Math.min(end, filteredData.length);
        document.getElementById(`security-events-table-total`).textContent = filteredData.length;

        const paginationContainer = tableContainer.querySelector('.pagination');
        if (paginationContainer) {
            window.setupPagination(paginationContainer, page, pageCount, (newPage) => {
                renderTablePage(events, tableContainer, newPage);
            });
        }
    }

    function addSecurityEventListeners(initialData, tableContainer) {
        let searchInput;
        let severityFilter;

        let currentEvents = [...initialData];
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
                // Elements are now created, safe to add listeners
                attachPersistentListeners();
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
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            const severityValue = severityFilter ? severityFilter.value.toLowerCase() : 'all';
            
            currentEvents = initialData.filter(event => {
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

        function attachPersistentListeners() {
            searchInput = document.getElementById('security-search');
            severityFilter = document.getElementById('security-severity-filter');

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
        }

        // Initial render will create the table and attach listeners
        renderTablePage(1);

        // Manually call applySearchAndSort after initial render to apply default filters
        // with the now-initialized searchInput and severityFilter elements.
        applySearchAndSort();
    }

    function renderVulnerabilityChart(severityData, container) {
        if (!severityData || Object.keys(severityData).length === 0) {
            container.innerHTML = '<div class="text-muted p-3">No vulnerability data available.</div>';
            return;
        }

        const dataRows = [
            ['Critical', severityData.Critical || 0],
            ['High', severityData.High || 0],
            ['Medium', severityData.Medium || 0],
            ['Low', severityData.Low || 0]
        ];
        const header = ['Severity', 'Count'];
        const options = { colors: ['#d63939', '#f76707', '#f59f00', '#adb5bd'] };
        window.charting.renderPieChart(container.id, dataRows, header, options);
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

        const dataRows = Object.keys(dataByDay).map(date => {
            const counts = dataByDay[date];
            return [new Date(date), counts.critical, counts.high, counts.medium, counts.low];
        });

        // Sort by date ascending
        dataRows.sort((a, b) => a[0] - b[0]);

        const header = [{type: 'date', label: 'Date'}, 'Critical', 'High', 'Medium', 'Low'];
        const options = {
            isStacked: true,
            colors: ['#d63939', '#f76707', '#f59f00', '#adb5bd'],
            legend: { position: 'bottom' }
        };

        window.charting.renderAreaChart(container.id, dataRows, header, options);
    }
})();
