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
        
        // Load the HTML content first
        try {
            const response = await fetch('views/devices.html');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const htmlContent = await response.text();
            container.innerHTML = htmlContent;
        } catch (error) {
            console.error('Error loading devices view HTML:', error);
            container.innerHTML = `<div class="alert alert-danger">Error loading device management view. Please try again later.</div>`;
            return;
        }
  
        try {
            const org = sessionStorage.getItem('org') || 'Global';
            const { devices, summary } = await dataService.getDeviceData(org);
  
            populateDeviceStats(summary);
            populateDeviceTable(devices);
            addDeviceEventListeners(devices);
  
        } catch (error) {
            console.error('Error initializing device view:', error);
            const alertDiv = container.querySelector('.container-xl') || container;
            alertDiv.innerHTML = `<div class="alert alert-danger">Failed to load device data. Please try again later.</div>`;
        }
    };

    function populateDeviceStats(summary) {
        // Update the KPI cards with real data
        const totalElement = document.getElementById('totalDevices');
        const onlineElement = document.getElementById('onlineDevices');
        const alertElement = document.getElementById('alertDevices');
        const offlineElement = document.getElementById('offlineDevices');

        if (totalElement) totalElement.textContent = summary?.total || '--';
        if (onlineElement) onlineElement.textContent = summary?.online || '--';
        if (alertElement) alertElement.textContent = summary?.alerts || '--';
        if (offlineElement) offlineElement.textContent = summary?.offline || '--';
    }

    function populateDeviceTable(devices) {
        const tableBody = document.getElementById('devicesTableBody');
        if (!tableBody) {
            console.warn('devicesTableBody element not found');
            return;
        }

        if (!devices || devices.length === 0) {
            tableBody.innerHTML = 
                '<tr><td colspan="8" class="text-center text-muted">No devices found.</td></tr>';
            return;
        }

        const timeUtils = window.timeUtils || {
            formatTimestamp: (ts) => ts ? new Date(ts).toLocaleString() : 'Never'
        };
        
        const getStatusColor = (status) => {
            if (status === 'Online') return 'success';
            if (status === 'Offline') return 'danger';
            return 'warning';
        };

        // Populate table with device data (show first 10 for simplicity)
        tableBody.innerHTML = devices.slice(0, 10).map(device => `
            <tr>
                <td>
                    <div class="d-flex">
                        <span class="avatar avatar-sm me-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <rect x="3" y="4" width="18" height="12" rx="1"/>
                                <path d="M7 20h10"/>
                                <path d="M9 16v4"/>
                                <path d="M15 16v4"/>
                            </svg>
                        </span>
                        <div>
                            <div class="font-weight-medium">${device.hostname || device.name || 'Unknown Device'}</div>
                            <div class="text-muted text-sm">${device.id || ''}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge badge-outline text-muted">${device.deviceType || device.type || 'Unknown'}</span>
                </td>
                <td>${device.ipAddress || device.ip || 'N/A'}</td>
                <td>
                    <span class="badge bg-${getStatusColor(device.status)}">${device.status || 'Unknown'}</span>
                </td>
                <td>${device.lastSeen ? timeUtils.formatTimestamp(device.lastSeen) : 'Never'}</td>
                <td>${device.clientVersion || device.agentVersion || 'N/A'}</td>
                <td>${device.osVersion || device.os || 'Unknown'}</td>
                <td>
                    <div class="btn-list flex-nowrap">
                        <a href="#" class="btn btn-sm btn-outline-primary">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/>
                                <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/>
                            </svg>
                        </a>
                        <a href="#" class="btn btn-sm btn-outline-secondary">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"/>
                                <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z"/>
                                <path d="M16 5l3 3"/>
                            </svg>
                        </a>
                    </div>
                </td>
            </tr>
        `).join('');

        // Update pagination info
        const paginationInfo = document.getElementById('devicePaginationInfo');
        if (paginationInfo) {
            const totalDevices = devices.length;
            const currentShow = Math.min(10, totalDevices);
            paginationInfo.innerHTML = 
                `Showing <span>1 to ${currentShow}</span> of <span>${totalDevices}</span> entries`;
        }
    }

    // Add search and refresh functionality
    function addDeviceEventListeners(devices) {
        // Add search functionality
        const searchInput = document.getElementById('deviceSearchInput');
        const searchBtn = document.getElementById('deviceSearchBtn');
        const refreshBtn = document.getElementById('refreshDevicesBtn');

        if (searchInput && searchBtn) {
            const performSearch = () => {
                const searchTerm = searchInput.value.toLowerCase();
                const filtered = devices.filter(device => 
                    (device.hostname || '').toLowerCase().includes(searchTerm) ||
                    (device.ipAddress || '').toLowerCase().includes(searchTerm) ||
                    (device.osVersion || '').toLowerCase().includes(searchTerm)
                );
                populateDeviceTable(filtered);
            };

            searchBtn.addEventListener('click', performSearch);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performSearch();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                // Reload the current view
                if (window.currentViewInit) {
                    window.currentViewInit();
                }
            });
        }
    }

})();
