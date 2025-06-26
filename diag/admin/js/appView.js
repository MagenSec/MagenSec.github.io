// appView.js: Renders the Application Intelligence view.
window.appViewInit = async function(container) {
  if (!container) {
    console.error('App view requires a container element.');
    return;
  }

  console.log('Initializing Application Intelligence view...');
  container.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;

  // Load Google Charts
  const googleChartsLoaded = new Promise(resolve => {
    google.charts.load('current', { 'packages': ['timeline', 'corechart'] });
    google.charts.setOnLoadCallback(resolve);
  });

  try {
    const org = sessionStorage.getItem('org') || 'Global';
    const { apps, summary, timelineData } = await dataService.getApplicationData(org);

    await googleChartsLoaded;
    renderAppView(container, apps, summary, timelineData);
    addEventListeners();

  } catch (error) {
    console.error('Error initializing app view:', error);
    container.innerHTML = `<div class="alert alert-danger">Failed to load application data. Please try again later.</div>`;
  }
};

function renderAppView(container, apps, summary, timelineData) {
  const getRiskColor = (level) => {
    const colors = {
      'Critical': 'red',
      'High': 'orange',
      'Medium': 'yellow',
      'Low': 'blue',
      'None': 'green'
    };
    return colors[level] || 'gray';
  };

  container.innerHTML = `
    <div class="row row-deck row-cards">
      <!-- KPI Cards -->
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Total Apps</div>
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
            </div>
            <div class="h1 mb-3">${summary.vulnerableApps}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Critical Risks</div>
            </div>
            <div class="h1 mb-3 text-danger">${summary.criticalVulnerabilities}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">High Risks</div>
            </div>
            <div class="h1 mb-3 text-warning">${summary.highVulnerabilities}</div>
          </div>
        </div>
      </div>

      <!-- Application Lifecycle Chart -->
      <div class="col-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Application Lifecycle (Last 30 Days)</h3>
          </div>
          <div class="card-body">
            <div id="app-timeline-chart" style="height: 350px;"></div>
          </div>
        </div>
      </div>

      <!-- Applications Table -->
      <div class="col-12">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Discovered Applications</h3>
            <div class="ms-auto text-muted">
              Search: 
              <div class="ms-2 d-inline-block">
                <input type="text" id="app-search" class="form-control form-control-sm" aria-label="Search applications">
              </div>
            </div>
          </div>
          <div class="table-responsive">
            <table class="table card-table table-vcenter text-nowrap datatable" id="app-table">
              <thead>
                <tr>
                  <th class="w-1 sortable" data-sort="name">Name</th>
                  <th class="sortable" data-sort="publisher">Publisher</th>
                  <th class="sortable" data-sort="installCount">Installs</th>
                  <th class="sortable" data-sort="riskLevel">Risk Level</th>
                  <th>Versions</th>
                </tr>
              </thead>
              <tbody>
                ${apps.map(app => `
                  <tr>
                    <td><div class="text-truncate" style="max-width: 250px;" title="${app.name}">${app.name}</div></td>
                    <td><div class="text-truncate" style="max-width: 150px;" title="${app.publisher}">${app.publisher}</div></td>
                    <td>${app.installCount}</td>
                    <td>
                      <span class="badge bg-${getRiskColor(app.riskLevel)}-lt">${app.riskLevel}</span>
                    </td>
                    <td class="text-muted" title="${app.versions}">${(app.versions || '').substring(0, 40)}${app.versions && app.versions.length > 40 ? '...' : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  renderAppTimeline(timelineData);
}

function renderAppTimeline(data) {
    const container = document.getElementById('app-timeline-chart');
    if (!container) return;
    // Add data-chart-type attribute for the global resizer
    container.setAttribute('data-chart-type', 'google');

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="text-muted text-center">No application lifecycle data available for the last 30 days.</div>';
        return;
    }

    const chart = new google.visualization.Timeline(container);
    const dataTable = new google.visualization.DataTable();
    dataTable.addColumn({ type: 'string', id: 'App' });
    dataTable.addColumn({ type: 'string', id: 'State' });
    dataTable.addColumn({ type: 'date', id: 'Start' });
    dataTable.addColumn({ type: 'date', id: 'End' });

    dataTable.addRows(data);

    const isDark = document.body.classList.contains('theme-dark');
    const options = {
        height: 350,
        timeline: { 
            groupByRowLabel: true,
            colorByRowLabel: false,
            rowLabelStyle: { fontName: 'inherit', fontSize: 12, color: isDark ? '#e5e5e5' : '#424242' },
            barLabelStyle: { fontName: 'inherit', fontSize: 10 }
        },
        backgroundColor: 'transparent',
        colors: ['#206bc4', '#d63939', '#f59f00'], // Installed, Uninstalled, Vulnerable
        hAxis: {
            textStyle: { color: isDark ? '#999' : '#666' }
        }
    };

    chart.draw(dataTable, options);
    // Store for resizing
    container.chartInstance = { chart, data: dataTable, options, type: 'Timeline' };
}

function addEventListeners() {
  const searchInput = document.getElementById('app-search');
  const table = document.getElementById('app-table');
  if (!table) return;
  const tableBody = table.querySelector('tbody');
  const headers = table.querySelectorAll('thead th.sortable');
  let originalRows = Array.from(tableBody.querySelectorAll('tr'));

  // Search functionality
  searchInput.addEventListener('keyup', () => {
    const searchTerm = searchInput.value.toLowerCase();
    originalRows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  });

  // Sorting functionality
  let sortDirection = {};
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const sortKey = header.dataset.sort;
      const direction = (sortDirection[sortKey] = sortDirection[sortKey] === 'asc' ? 'desc' : 'asc');

      // Remove sort indicators from other headers
      headers.forEach(h => h.classList.remove('asc', 'desc'));
      header.classList.add(direction);

      const rows = Array.from(tableBody.querySelectorAll('tr'));

      rows.sort((a, b) => {
        let valA = a.children[header.cellIndex].textContent.trim();
        let valB = b.children[header.cellIndex].textContent.trim();

        // Handle numeric sorting for install count
        if (sortKey === 'installCount') {
          valA = parseInt(valA, 10);
          valB = parseInt(valB, 10);
        } else {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      });

      rows.forEach(row => tableBody.appendChild(row));
    });
  });
}

// Set this as the current view initializer for timezone/theme refresh
window.currentViewInit = window.appViewInit;
