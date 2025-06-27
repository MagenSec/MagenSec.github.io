// deviceView.js: Renders the Device Fleet Management view.
window.deviceViewInit = async function(container) {
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
    addDeviceEventListeners();

  } catch (error) {
    console.error('Error initializing device view:', error);
    container.innerHTML = `<div class="alert alert-danger">Failed to load device data. Please try again later.</div>`;
  }
};

function renderDeviceView(container, devices, summary) {
  const getStatusColor = (status) => {
    return status === 'Live' ? 'green' : 'gray';
  };

  // Use formatRelativeTime if available
  const formatRelativeTime = (window.timeUtils && window.timeUtils.formatRelativeTime) ? window.timeUtils.formatRelativeTime : (ts => ts);

  container.innerHTML = `
    <div class="row row-deck row-cards">
      <!-- KPI Cards -->
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Total Devices</div>
              <div class="ms-auto lh-1">
                <i class="ti ti-device-desktop text-muted"></i>
              </div>
            </div>
            <div class="h1 mb-3">${summary.total}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Live Devices</div>
               <div class="ms-auto lh-1">
                <i class="ti ti-wifi text-success"></i>
              </div>
            </div>
            <div class="h1 mb-3 text-success">${summary.live}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Most Common Memory</div>
              <div class="ms-auto lh-1">
                <i class="ti ti-database text-muted"></i>
              </div>
            </div>
            <div class="h1 mb-3">${summary.mostCommonMemory}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Most Common CPU</div>
              <div class="ms-auto lh-1">
                <i class="ti ti-cpu text-muted"></i>
              </div>
            </div>
            <div class="h1 mb-3">${summary.mostCommonCpu}</div>
          </div>
        </div>
      </div>

      <!-- Hardware Spec Charts -->
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Memory Distribution</h3>
          </div>
          <div class="card-body">
            <div id="mem-dist-chart" style="height: 250px" data-chart-type="google"></div>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">CPU Core Distribution</h3>
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
          <div class="table-responsive">
            <table class="table card-table table-vcenter text-nowrap datatable" id="device-table">
              <thead>
                <tr>
                  <th class="w-1 sortable" data-sort="name">Hostname</th>
                  <th class="sortable" data-sort="os">Operating System</th>
                  <th class="sortable" data-sort="clientVersion">Client Version</th>
                  <th class="sortable" data-sort="status">Status</th>
                  <th class="sortable" data-sort="lastSeen">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                ${devices.map(device => `
                  <tr>
                    <td><div class="text-truncate" style="max-width: 250px;" title="${device.name}">${device.name}</div></td>
                    <td>${device.os}</td>
                    <td>${device.clientVersion}</td>
                    <td>
                      <span class="badge bg-${getStatusColor(device.status)}-lt">${device.status}</span>
                    </td>
                    <td data-timestamp="${device.lastSeenTimestamp}">${formatRelativeTime(device.lastSeenTimestamp)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
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

function addDeviceEventListeners() {
  const searchInput = document.getElementById('device-search');
  const table = document.getElementById('device-table');
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

      headers.forEach(h => h.classList.remove('asc', 'desc'));
      header.classList.add(direction);

      const rows = Array.from(tableBody.querySelectorAll('tr'));

      rows.sort((a, b) => {
        let valA, valB;
        const cellIndex = header.cellIndex;

        if (sortKey === 'lastSeen') {
          valA = parseInt(a.children[cellIndex].dataset.timestamp, 10);
          valB = parseInt(b.children[cellIndex].dataset.timestamp, 10);
        } else {
          valA = a.children[cellIndex].textContent.trim().toLowerCase();
          valB = b.children[cellIndex].textContent.trim().toLowerCase();
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
window.currentViewInit = window.deviceViewInit;
