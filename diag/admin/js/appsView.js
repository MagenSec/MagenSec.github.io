// appsView.js: Renders the Application Security & Inventory view.
window.appsViewInit = async function(container) {
  if (!container) {
    console.error('Application view requires a container element.');
    return;
  }

  console.log('Initializing Application Security & Inventory view...');
  container.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;

  // Load Google Charts for timeline
  const googleChartsLoaded = new Promise(resolve => {
    google.charts.load('current', { 'packages': ['timeline', 'table'] });
    google.charts.setOnLoadCallback(resolve);
  });

  try {
    const org = sessionStorage.getItem('org') || 'Global';
    const { apps, summary, timelineData } = await dataService.getApplicationData(org);

    await googleChartsLoaded;
    renderAppsView(container, apps, summary, timelineData);
    addAppEventListeners(apps); // Pass full dataset to event listeners

  } catch (error) {
    console.error('Error initializing application view:', error);
    container.innerHTML = `<div class="alert alert-danger">Failed to load application data. Please try again later.</div>`;
  }
};

function renderAppsView(container, apps, summary, timelineData) {
  const formatRelativeTime = (window.timeUtils && window.timeUtils.formatRelativeTime) ? window.timeUtils.formatRelativeTime : (ts => ts);

  container.innerHTML = `
    <div class="row row-deck row-cards">
      <!-- KPI Cards -->
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Total Applications</div>
              <div class="ms-auto lh-1"><i class="ti ti-apps text-muted"></i></div>
            </div>
            <div class="h1 mb-3">${summary.totalApps}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Vulnerable Apps</div>
              <div class="ms-auto lh-1"><i class="ti ti-alert-triangle text-warning"></i></div>
            </div>
            <div class="h1 mb-3 text-warning">${summary.vulnerableApps}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Critical Vulnerabilities</div>
              <div class="ms-auto lh-1"><i class="ti ti-shield-x text-danger"></i></div>
            </div>
            <div class="h1 mb-3 text-danger">${summary.criticalVulnerabilities}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">High Vulnerabilities</div>
              <div class="ms-auto lh-1"><i class="ti ti-shield-half text-orange"></i></div>
            </div>
            <div class="h1 mb-3 text-orange">${summary.highVulnerabilities}</div>
          </div>
        </div>
      </div>

      <!-- Application Lifecycle Timeline -->
      <div class="col-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Application Lifecycle (Last 30 Days)</h3>
          </div>
          <div class="card-body">
            <div id="app-lifecycle-timeline" style="height: 300px" data-chart-type="google"></div>
          </div>
        </div>
      </div>

      <!-- Applications Table -->
      <div class="col-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Application Inventory</h3>
            <div class="ms-auto text-muted">
              Search: 
              <div class="ms-2 d-inline-block">
                <input type="text" id="app-search" class="form-control form-control-sm" aria-label="Search applications">
              </div>
            </div>
          </div>
          <div id="app-table-container" class="table-responsive"></div>
          <div class="card-footer d-flex align-items-center">
            <p class="m-0 text-muted">Showing <span id="pagination-info-start">1</span> to <span id="pagination-info-end">10</span> of <span id="pagination-info-total">${apps.length}</span> entries</p>
            <ul class="pagination m-0 ms-auto" id="pagination-controls"></ul>
          </div>
        </div>
      </div>
    </div>
  `;

  renderAppTimeline(timelineData);
  // Initial render of the table with pagination
  updateAppsTable(apps, 1, 20); // Default to page 1, 20 rows per page
}

function renderAppTimeline(timelineData) {
    const container = document.getElementById('app-lifecycle-timeline');
    if (!container || !timelineData || timelineData.length === 0) {
        container.innerHTML = '<div class="text-muted text-center pt-5">No application install or uninstall events in the last 30 days.</div>';
        return;
    }

    const dataTable = new google.visualization.DataTable();
    dataTable.addColumn({ type: 'string', id: 'AppName' });
    dataTable.addColumn({ type: 'string', id: 'State' });
    dataTable.addColumn({ type: 'date', id: 'Start' });
    dataTable.addColumn({ type: 'date', id: 'End' });
    dataTable.addRows(timelineData);

    const isDark = document.body.classList.contains('theme-dark');
    const options = {
        height: 300,
        backgroundColor: 'transparent',
        timeline: {
            showRowLabels: true,
            groupByRowLabel: true,
            colorByRowLabel: true
        },
        hAxis: {
            textStyle: { color: isDark ? '#e5e5e5' : '#424242' }
        }
    };

    const chart = new google.visualization.Timeline(container);
    chart.draw(dataTable, options);
    container.chartInstance = { chart, data: dataTable, options, type: 'Timeline' };
}

function updateAppsTable(apps, currentPage, rowsPerPage) {
    const tableContainer = document.getElementById('app-table-container');
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedApps = apps.slice(start, end);

    const getRiskBadge = (level) => {
        const map = {
            'Critical': 'danger',
            'High': 'warning',
            'Medium': 'orange',
            'Low': 'yellow',
            'None': 'secondary'
        };
        return `<span class="badge bg-${map[level]}-lt">${level}</span>`;
    };

    const tableHtml = `
        <table class="table card-table table-vcenter text-nowrap datatable" id="apps-table">
            <thead>
                <tr>
                    <th class="sortable" data-sort="name">Application</th>
                    <th class="sortable" data-sort="publisher">Publisher</th>
                    <th class="sortable text-center" data-sort="installCount">Installs</th>
                    <th class="sortable" data-sort="riskLevel">Highest Risk</th>
                    <th class="sortable" data-sort="firstDetected">First Detected</th>
                    <th class="sortable" data-sort="firstRemediated">First Remediated</th>
                </tr>
            </thead>
            <tbody>
                ${paginatedApps.map(app => `
                    <tr>
                        <td>${app.name}</td>
                        <td>${app.publisher}</td>
                        <td class="text-center">${app.installCount}</td>
                        <td>${getRiskBadge(app.riskLevel)}</td>
                        <td data-timestamp="${app.firstDetected ? new Date(app.firstDetected).getTime() : 0}">${app.firstDetected ? new Date(app.firstDetected).toLocaleDateString() : 'N/A'}</td>
                        <td data-timestamp="${app.firstRemediated ? new Date(app.firstRemediated).getTime() : 0}">${app.firstRemediated ? new Date(app.firstRemediated).toLocaleDateString() : 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    tableContainer.innerHTML = tableHtml;

    // Update pagination info
    document.getElementById('pagination-info-start').textContent = apps.length > 0 ? start + 1 : 0;
    document.getElementById('pagination-info-end').textContent = Math.min(end, apps.length);
    document.getElementById('pagination-info-total').textContent = apps.length;

    // Update pagination controls
    updatePaginationControls(apps.length, currentPage, rowsPerPage);
}

function updatePaginationControls(totalItems, currentPage, rowsPerPage) {
    const paginationContainer = document.getElementById('pagination-controls');
    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(totalItems / rowsPerPage);

    if (totalPages <= 1) return;

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage - 1}"><i class="ti ti-chevron-left"></i></a>`;
    paginationContainer.appendChild(prevLi);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
        paginationContainer.appendChild(li);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage + 1}"><i class="ti ti-chevron-right"></i></a>`;
    paginationContainer.appendChild(nextLi);
}

function addAppEventListeners(allApps) {
    let currentApps = [...allApps];
    let currentPage = 1;
    const rowsPerPage = 20;

    // Search functionality
    const searchInput = document.getElementById('app-search');
    searchInput.addEventListener('keyup', () => {
        const searchTerm = searchInput.value.toLowerCase();
        currentApps = allApps.filter(app => 
            app.name.toLowerCase().includes(searchTerm) || 
            app.publisher.toLowerCase().includes(searchTerm)
        );
        currentPage = 1;
        updateAppsTable(currentApps, currentPage, rowsPerPage);
    });

    // Pagination functionality
    const paginationContainer = document.getElementById('pagination-controls');
    paginationContainer.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.target.closest('a.page-link');
        if (target) {
            const page = parseInt(target.dataset.page, 10);
            if (page && page !== currentPage) {
                currentPage = page;
                updateAppsTable(currentApps, currentPage, rowsPerPage);
            }
        }
    });

    // Sorting functionality
    const tableContainer = document.getElementById('app-table-container');
    let sortDirection = {};
    tableContainer.addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (!header) return;

        const sortKey = header.dataset.sort;
        const direction = (sortDirection[sortKey] = sortDirection[sortKey] === 'asc' ? 'desc' : 'asc');

        // Reset other headers
        header.parentElement.querySelectorAll('th.sortable').forEach(h => {
            if (h !== header) {
                h.classList.remove('asc', 'desc');
                delete sortDirection[h.dataset.sort];
            }
        });
        header.classList.remove('asc', 'desc');
        header.classList.add(direction);

        currentApps.sort((a, b) => {
            let valA, valB;
            if (sortKey === 'installCount') {
                valA = a.installCount;
                valB = b.installCount;
            } else if (sortKey === 'firstDetected' || sortKey === 'firstRemediated') {
                valA = a[sortKey] ? new Date(a[sortKey]).getTime() : 0;
                valB = b[sortKey] ? new Date(b[sortKey]).getTime() : 0;
            } else {
                valA = (a[sortKey] || '').toString().toLowerCase();
                valB = (b[sortKey] || '').toString().toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        currentPage = 1;
        updateAppsTable(currentApps, currentPage, rowsPerPage);
    });
}

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.appsViewInit;
