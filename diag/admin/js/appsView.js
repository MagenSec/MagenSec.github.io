// appsView.js: Renders the Application Security & Inventory view.
(function() {
  if (!window.viewInitializers) {
    window.viewInitializers = {};
  }
  window.viewInitializers.applications = async function(container) {
    if (!container) {
      console.error('Application view requires a container element.');
      return;
    }

    console.log('Initializing Application Security & Inventory view...');
    container.innerHTML = `<div class="page-preloader"><div class="spinner"></div></div>`;

    try {
      const org = sessionStorage.getItem('org') || 'Global';
      const { apps, summary, timelineData } = await dataService.getApplicationData(org);

      await window.charting.googleChartsLoaded; // Wait for global chart loader
      renderAppsView(container, apps, summary);
      renderAppTimeline(timelineData); // Render the timeline
      addAppEventListeners(apps); // Pass full dataset to event listeners

    } catch (error) {
      console.error('Error initializing application view:', error);
      container.innerHTML = `<div class="alert alert-danger">Failed to load application data. Please try again later.</div>`;
    }
  };

  function renderAppsView(container, apps, summary) {
    // FIX: Corrected summary property names and adjusted KPI cards.
    container.innerHTML = `
      <div class="row row-deck row-cards">
        <!-- KPI Cards -->
        <div class="col-sm-6 col-lg-4">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">Total App Installs</div>
                <div class="ms-auto lh-1"><i class="ti ti-apps text-muted"></i></div>
              </div>
              <div class="h1 mb-3">${summary.total}</div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-4">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">Vulnerable App Installs</div>
                <div class="ms-auto lh-1"><i class="ti ti-alert-triangle text-warning"></i></div>
              </div>
              <div class="h1 mb-3 text-warning">${summary.vulnerable}</div>
            </div>
          </div>
        </div>
        <div class="col-sm-6 col-lg-4">
          <div class="card">
            <div class="card-body">
              <div class="d-flex align-items-center">
                <div class="subheader">High Risk Apps</div>
                <div class="ms-auto lh-1"><i class="ti ti-shield-x text-danger"></i></div>
              </div>
              <div class="h1 mb-3 text-danger">${summary.highRisk}</div>
            </div>
          </div>
        </div>

        <!-- Timeline Chart -->
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Vulnerable Applications Timeline (Last 30 Days)</h3>
            </div>
            <div class="card-body">
              <div id="app-lifecycle-timeline" style="height: 300px"></div>
            </div>
          </div>
        </div>

        <!-- Applications Table -->
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Application Inventory</h3>
              <div class="ms-auto d-flex align-items-center">
                  <div class="text-muted me-3">Status:</div>
                  <div class="btn-group" role="group">
                      <input type="radio" class="btn-check" name="app-status-filter" id="app-status-installed" autocomplete="off" value="installed" checked>
                      <label class="btn btn-sm btn-outline-primary" for="app-status-installed">Installed</label>

                      <input type="radio" class="btn-check" name="app-status-filter" id="app-status-uninstalled" autocomplete="off" value="uninstalled">
                      <label class="btn btn-sm btn-outline-primary" for="app-status-uninstalled">Uninstalled</label>

                      <input type="radio" class="btn-check" name="app-status-filter" id="app-status-all" autocomplete="off" value="all">
                      <label class="btn btn-sm btn-outline-primary" for="app-status-all">All</label>
                  </div>
                  <div class="ms-4 text-muted">Search:</div>
                  <div class="ms-2 d-inline-block">
                      <input type="text" id="app-search" class="form-control form-control-sm" aria-label="Search applications">
                  </div>
              </div>
            </div>
            <div id="app-table-container" class="table-responsive">
              <table class="table card-table table-vcenter text-nowrap datatable" id="apps-table">
                  <thead>
                      <tr>
                          <!-- FIX: Updated table headers -->
                          <th class="sortable asc" data-sort="appName">Application</th>
                          <th class="sortable" data-sort="version">Version</th>
                          <th class="sortable" data-sort="publisher">Publisher</th>
                          <th class="sortable" data-sort="device">Device</th>
                          <th class="sortable text-center" data-sort="exploitProbability">Risk</th>
                          <th class="sortable" data-sort="lifecycleState">Status</th>
                          <th class="sortable" data-sort="uninstalledOn">Remediated On</th>
                      </tr>
                  </thead>
                  <tbody>
                      <!-- Rows will be rendered by JavaScript -->
                  </tbody>
              </table>
            </div>
            <div class="card-footer d-flex align-items-center">
              <p class="m-0 text-muted">Showing <span id="pagination-info-start">0</span> to <span id="pagination-info-end">0</span> of <span id="pagination-info-total">0</span> entries</p>
              <ul class="pagination m-0 ms-auto" id="pagination-controls"></ul>
            </div>
          </div>
        </div>
      </div>
    `;

    // Initial render of the table with pagination is now handled by addAppEventListeners
  }

  function renderAppTimeline(timelineData) {
      const header = [
          { type: 'string', id: 'AppName' },
          { type: 'string', id: 'State' },
          { type: 'date', id: 'Start' },
          { type: 'date', id: 'End' }
      ];
      window.charting.renderTimeline('app-lifecycle-timeline', timelineData, header);
  }

  function addAppEventListeners(allApps) {
      let currentPage = 1;
      const rowsPerPage = 20;
      let currentStatusFilter = 'installed';
      let sortKey = 'exploitProbability'; // Default sort by risk
      let sortDirection = 'desc';

      const tableContainer = document.getElementById('app-table-container');
      const paginationContainer = document.getElementById('pagination-controls');
      const searchInput = document.getElementById('app-search');
      const statusFilters = document.querySelectorAll('input[name="app-status-filter"]');

      function renderTable() {
          // 1. Apply Filter
          const searchTerm = searchInput.value.toLowerCase();
          let filteredApps = allApps.filter(app => {
              // FIX: Use correct properties from dataService
              const matchesSearch = (app.appName || '').toLowerCase().includes(searchTerm) ||
                                    (app.publisher || '').toLowerCase().includes(searchTerm) ||
                                    (app.device || '').toLowerCase().includes(searchTerm);

              // FIX: Filter based on presence of `uninstalledOn` date
              const isUninstalled = !!app.uninstalledOn;
              const matchesStatus = currentStatusFilter === 'all' ||
                                    (currentStatusFilter === 'installed' && !isUninstalled) ||
                                    (currentStatusFilter === 'uninstalled' && isUninstalled);

              return matchesSearch && matchesStatus;
          });

          // 2. Apply Sort
          // FIX: Use correct properties from dataService
          filteredApps.sort((a, b) => {
              let valA, valB;
              if (sortKey === 'exploitProbability') {
                  valA = a.exploitProbability || 0;
                  valB = b.exploitProbability || 0;
              } else if (sortKey === 'uninstalledOn') {
                  valA = a[sortKey] ? new Date(a[sortKey]).getTime() : 0;
                  valB = b[sortKey] ? new Date(b[sortKey]).getTime() : 0;
              } else {
                  valA = (a[sortKey] || '').toString().toLowerCase();
                  valB = (b[sortKey] || '').toString().toLowerCase();
              }

              if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
              if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
              return 0;
          });

          // 3. Apply Pagination
          const totalItems = filteredApps.length;
          const totalPages = Math.ceil(totalItems / rowsPerPage);
          currentPage = Math.max(1, Math.min(currentPage, totalPages || 1)); // Ensure currentPage is valid
          const start = (currentPage - 1) * rowsPerPage;
          const end = start + rowsPerPage;
          const paginatedApps = filteredApps.slice(start, end);

          // 4. Render Table Body
          // FIX: Create risk badge based on probability score
          const getRiskBadge = (probability) => {
              const p = probability || 0;
              if (p > 0.9) return `<span class="badge bg-danger-lt">Critical</span>`;
              if (p > 0.7) return `<span class="badge bg-danger-lt">High</span>`;
              if (p > 0.4) return `<span class="badge bg-warning-lt">Medium</span>`;
              if (p > 0) return `<span class="badge bg-yellow-lt">Low</span>`;
              return `<span class="badge bg-secondary-lt">None</span>`;
          };

          const tableBody = tableContainer.querySelector('tbody');
          if (tableBody) {
              // FIX: Use correct properties and add fallbacks for robust rendering
              tableBody.innerHTML = paginatedApps.map(app => `
                  <tr>
                      <td>${app.appName}</td>
                      <td>${app.version}</td>
                      <td>${app.publisher}</td>
                      <td>${app.device}</td>
                      <td class="text-center">${getRiskBadge(app.exploitProbability)}</td>
                      <td><span class="badge bg-secondary-lt">${app.lifecycleState}</span></td>
                      <td data-timestamp="${app.uninstalledOn ? new Date(app.uninstalledOn).getTime() : '0'}">${app.uninstalledOn ? new Date(app.uninstalledOn).toLocaleDateString() : 'N/A'}</td>
                  </tr>
              `).join('');
          }

          // 5. Update Pagination Info
          document.getElementById('pagination-info-start').textContent = totalItems > 0 ? start + 1 : 0;
          document.getElementById('pagination-info-end').textContent = Math.min(end, totalItems);
          document.getElementById('pagination-info-total').textContent = totalItems;

          // 6. Render Pagination Controls using uiUtils
          if (window.setupPagination) {
              window.setupPagination(paginationContainer, totalPages, (page) => {
                  currentPage = page;
                  renderTable();
              }, currentPage);
          }
      }

      // --- Event Listeners ---
      searchInput.addEventListener('keyup', () => {
          currentPage = 1;
          renderTable();
      });

      statusFilters.forEach(filter => {
          filter.addEventListener('change', (e) => {
              currentStatusFilter = e.target.value;
              currentPage = 1;
              renderTable();
          });
      });

      tableContainer.addEventListener('click', (e) => {
          const header = e.target.closest('th.sortable');
          if (!header) return;

          const newSortKey = header.dataset.sort;
          if (sortKey === newSortKey) {
              sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
              sortKey = newSortKey;
              sortDirection = 'asc';
          }
          
          // Resetting classes on all th elements
          header.parentElement.querySelectorAll('th.sortable').forEach(h => {
              h.classList.remove('asc', 'desc');
          });
          // Adding the correct class to the clicked header
          header.classList.add(sortDirection);

          currentPage = 1;
          renderTable();
      });

      // Initial Render
      renderTable();
  }

  // Set this as the current view initializer for timezone/theme refresh
  window.currentViewInit = window.appsViewInit;
})();
