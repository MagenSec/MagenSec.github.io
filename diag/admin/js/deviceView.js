// deviceView.js: Renders the Device Fleet Management view.
window.deviceViewInit = async function(container, { dataService }) {
  if (!container) {
    console.error('Device view requires a container element.');
    return;
  }

  console.log('Initializing Device Fleet Management view...');
  container.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;

  // Load Google Charts
  const googleChartsLoaded = new Promise(resolve => {
    google.charts.load('current', { 'packages': ['corechart'] });
    google.charts.setOnLoadCallback(resolve);
  });

  try {
    const org = sessionStorage.getItem('org') || 'Global';
    const { devices, summary } = await dataService.getDeviceData(org);

    await googleChartsLoaded;
    renderDeviceView(container, devices, summary);
    addDeviceEventListeners(devices);

  } catch (error) {
    console.error('Error initializing device view:', error);
    container.innerHTML = `<div class="alert alert-danger">Failed to load device data. Please try again later.</div>`;
  }
};

function renderDeviceView(container, devices, summary) {
  // FIX: Updated KPI cards to be more relevant and use correct summary data.
  container.innerHTML = `
    <div class="row row-deck row-cards">
      <!-- KPI Cards -->
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Total Devices</div>
              <div class="ms-auto lh-1"><i class="ti ti-device-desktop text-muted"></i></div>
            </div>
            <div class="h1 mb-3">${summary.total}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Online</div>
               <div class="ms-auto lh-1"><i class="ti ti-wifi text-success"></i></div>
            </div>
            <div class="h1 mb-3 text-success">${summary.online}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Secure Boot Enabled</div>
              <div class="ms-auto lh-1"><i class="ti ti-lock text-muted"></i></div>
            </div>
            <div class="h1 mb-3">${summary.secureBoot}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">TPM Enabled</div>
              <div class="ms-auto lh-1"><i class="ti ti-chip text-muted"></i></div>
            </div>
            <div class="h1 mb-3">${summary.tpmEnabled}</div>
          </div>
        </div>
      </div>

      <!-- Hardware Spec Charts -->
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Memory Distribution (${summary.mostCommonMemory})</h3>
          </div>
          <div class="card-body">
            <div id="mem-dist-chart" style="height: 250px" data-chart-type="google"></div>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">CPU Architecture (${summary.mostCommonCpu})</h3>
          </div>
          <div class="card-body">
            <div id="cpu-dist-chart" style="height: 250px" data-chart-type="google"></div>
          </div>
        </div>
      </div>

      <!-- Devices Table -->
      <div class="col-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Managed Devices</h3>
            <div class="ms-auto text-muted">
              Search: 
              <div class="ms-2 d-inline-block">
                <input type="text" id="device-search" class="form-control form-control-sm" aria-label="Search devices">
              </div>
            </div>
          </div>
          <div id="devices-table-container">
             <!-- Paginated table will be rendered here -->
          </div>
        </div>
      </div>
    </div>
  `;

  renderDistributionChart('mem-dist-chart', 'Memory Specs', summary.memoryDistribution);
  renderDistributionChart('cpu-dist-chart', 'CPU Cores', summary.cpuCoreDistribution);
}

function renderDistributionChart(elementId, title, data) {
    const container = document.getElementById(elementId);
    if (!container || !data || Object.keys(data).length === 0) {
        container.innerHTML = '<div class="text-muted text-center pt-5">No distribution data available.</div>';
        return;
    }

    const dataArray = [[title, 'Count'], ...Object.entries(data)];
    const dataTable = google.visualization.arrayToDataTable(dataArray);

    const isDark = document.body.classList.contains('theme-dark');
    const textStyle = { color: isDark ? '#e5e5e5' : '#424242', fontName: 'inherit' };

    const options = {
        pieHole: 0.4,
        backgroundColor: 'transparent',
        chartArea: { left: 10, top: 20, width: '90%', height: '80%' },
        legend: { textStyle: textStyle, position: 'right' },
        titleTextStyle: { color: textStyle.color, fontName: 'inherit', fontSize: 16, bold: false },
        tooltip: { textStyle: { fontName: 'inherit' } },
        colors: ['#206bc4', '#79a6dc', '#d1e0f6', '#f0f6ff', '#a6cffc', '#6c7a89', '#95a5a6']
    };

    const chart = new google.visualization.PieChart(container);
    chart.draw(dataTable, options);
    container.chartInstance = { chart, data: dataTable, options, type: 'PieChart' };
}

function addDeviceEventListeners(allDevices) {
    const tableContainer = document.getElementById('devices-table-container');
    const searchInput = document.getElementById('device-search');
    
    let currentDevices = [...allDevices];
    let currentPage = 1;
    const pageSize = 15;
    let sortColumn = 'lastSeenTimestamp';
    let sortDirection = 'desc';

    const renderTablePage = (page) => {
        currentPage = page;
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        const pageData = currentDevices.slice(start, end);

        const tableId = 'devices-table';
        if (tableContainer.querySelector(`#${tableId}`) === null) {
            tableContainer.innerHTML = `
                <div class="table-responsive">
                    <table id="${tableId}" class="table card-table table-vcenter text-nowrap datatable">
                        <thead>
                            <tr>
                                <!-- FIX: Updated table headers for new data -->
                                <th class="w-1 sortable" data-sort="hostname">Hostname</th>
                                <th class="sortable" data-sort="osVersion">Operating System</th>
                                <th class="sortable" data-sort="clientVersion">Client Version</th>
                                <th class="sortable" data-sort="status">Status</th>
                                <th class="sortable" data-sort="lastSeen">Last Seen</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="card-footer d-flex align-items-center">
                    <p class="m-0 text-muted">Showing <span id="${tableId}-start">1</span> to <span id="${tableId}-end">10</span> of <span id="${tableId}-total">${currentDevices.length}</span> entries</p>
                    <ul id="${tableId}-pagination" class="pagination m-0 ms-auto"></ul>
                </div>
            `;
        }

        const tableBody = tableContainer.querySelector(`#${tableId} tbody`);
        const timeUtils = window.timeUtils;
        // FIX: Status check is now boolean-based
        const getStatusColor = (status) => status === 'Online' ? 'green' : 'gray';

        if (pageData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No devices found matching your criteria.</td></tr>';
        } else {
            // FIX: Use correct properties from dataService and add fallbacks
            tableBody.innerHTML = pageData.map(device => `
                <tr>
                    <td><div class="text-truncate" style="max-width: 250px;" title="Device ID: ${device.id}">${device.hostname}</div></td>
                    <td>${device.osVersion}</td>
                    <td>${device.clientVersion}</td>
                    <td>
                        <span class="badge bg-${getStatusColor(device.status)}-lt">${device.status}</span>
                    </td>
                    <td data-timestamp="${device.lastSeen}">${timeUtils.formatTimestamp(device.lastSeen)}</td>
                </tr>
            `).join('');
        }

        document.getElementById(`${tableId}-start`).textContent = currentDevices.length > 0 ? start + 1 : 0;
        document.getElementById(`${tableId}-end`).textContent = Math.min(end, currentDevices.length);
        document.getElementById(`${tableId}-total`).textContent = currentDevices.length;

        const paginationElement = document.getElementById(`${tableId}-pagination`);
        const totalPages = Math.ceil(currentDevices.length / pageSize);
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
        
        // FIX: Search against correct and available properties
        currentDevices = allDevices.filter(device => {
            const searchableString = `${device.id} ${device.hostname} ${device.osVersion} ${device.clientVersion} ${device.status}`.toLowerCase();
            return searchableString.includes(searchTerm);
        });

        currentDevices.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];
            if (valA === null || valA === undefined) valA = '';
            if (valB === null || valB === undefined) valB = '';

            if (typeof valA === 'string') {
                return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else {
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            }
        });

        renderTablePage(1);
    };

    searchInput.addEventListener('keyup', applySearchAndSort);

    tableContainer.addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (header) {
            const newSortColumn = header.dataset.sort;
            if (newSortColumn === sortColumn) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = newSortColumn;
                sortDirection = (newSortColumn.toLowerCase().includes('timestamp')) ? 'desc' : 'asc';
            }
            applySearchAndSort();
        }
    });

    applySearchAndSort();
}

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.deviceViewInit;
