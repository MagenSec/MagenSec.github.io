// deviceView.js: Renders the Device Fleet Management view.
window.deviceViewInit = async function() {
  console.log('Initializing Device Fleet Management view...');
  const pageHeader = document.querySelector('.page-header h2.page-title');
  const pageBody = document.querySelector('.page-body .container-xl');
  if (!pageBody || !pageHeader) return;

  pageHeader.textContent = 'Device Fleet Management';
  pageBody.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;

  try {
    const org = sessionStorage.getItem('org') || 'Global';
    const { devices, summary } = await dataService.getDeviceData(org);

    renderDeviceView(pageBody, devices, summary);
    addDeviceEventListeners();

  } catch (error) {
    console.error('Error initializing device view:', error);
    pageBody.innerHTML = `<div class="alert alert-danger">Failed to load device data. Please try again later.</div>`;
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
            </div>
            <div class="h1 mb-3 text-success">${summary.live}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="subheader">Offline Devices</div>
            </div>
            <div class="h1 mb-3 text-muted">${summary.offline}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card">
          <div class="card-body">
            <div class="subheader">Platforms</div>
            <div class="h1 mb-3">${Object.keys(summary.byPlatform).map(p => `${p}: ${summary.byPlatform[p]}`).join(', ') || 'N/A'}</div>
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
                  <th class="w-1 sortable" data-sort="name">Device Name</th>
                  <th class="sortable" data-sort="os">Operating System</th>
                  <th class="sortable" data-sort="clientVersion">Client Version</th>
                  <th class="sortable" data-sort="status">Status</th>
                  <th class="sortable" data-sort="lastSeen">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                ${devices.map(device => `
                  <tr>
                    <td>${device.name}</td>
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
