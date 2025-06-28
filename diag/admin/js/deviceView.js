// deviceView.js: Renders the Device Fleet Management view.
(function() {
    if (!window.viewInitializers) {
        window.viewInitializers = {};
    }
    window.viewInitializers.devices = async function(container, { dataService }) {
      if (!container) {
        console.error('Device view requires a container element.');
        return;
      }
  
      console.log('Initializing Device Fleet Management view...');
      container.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;
  
      try {
        const org = sessionStorage.getItem('org') || 'Global';
        const { devices, summary } = await dataService.getDeviceData(org);
  
        await window.charting.googleChartsLoaded; // Wait for global chart loader
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
          <div class="col-lg-4">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">CPU Architecture</h3>
              </div>
              <div class="card-body">
                <div id="cpu-dist-chart" style="height: 250px" data-chart-type="google"></div>
              </div>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Memory Distribution (${summary.mostCommonMemory})</h3>
              </div>
              <div class="card-body">
                <div id="mem-dist-chart" style="height: 250px" data-chart-type="google"></div>
              </div>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Secure Boot Status</h3>
              </div>
              <div class="card-body">
                <div id="secure-boot-chart" style="height: 250px" data-chart-type="google"></div>
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
  
      const chartColors = ['#206bc4', '#79a6dc', '#d1e0f6', '#f0f6ff', '#a6cffc', '#6c7a89', '#95a5a6'];
      const cpuData = Object.entries(summary.cpuCoreDistribution || {});
      const memData = Object.entries(summary.memoryDistribution || {});
      const secureBootData = Object.entries(summary.secureBootDistribution || {});
  
      window.charting.renderPieChart('cpu-dist-chart', cpuData, ['CPU Architecture', 'Count'], { colors: chartColors });
      window.charting.renderPieChart('mem-dist-chart', memData, ['Memory Specs', 'Count'], { colors: chartColors });
      window.charting.renderPieChart('secure-boot-chart', secureBootData, ['Secure Boot', 'Count'], { colors: chartColors });
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
                                    <th class="sortable" data-sort="deviceAge">Device Age</th>
                                    <th class="sortable" data-sort="secureBoot">Secure Boot</th>
                                    <th class="sortable" data-sort="tmp">TPM</th>
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
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No devices found matching your criteria.</td></tr>';
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
                        <td>${device.deviceAgeText || 'Unknown'}</td>
                        <td>
                            <span class="badge bg-${device.secureBoot ? 'success' : 'danger'}-lt">
                                ${device.secureBoot ? 'Enabled' : 'Disabled'}
                            </span>
                        </td>
                        <td>
                            <span class="badge bg-${device.tmp ? 'success' : 'danger'}-lt">
                                ${device.tmp ? 'Enabled' : 'Disabled'}
                            </span>
                        </td>
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
  })();
