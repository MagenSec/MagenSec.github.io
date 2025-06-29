// deviceFilter.js: Global device-scoped filtering functionality

/**
 * Initializes the global device filter dropdown in the navbar.
 * Allows users to filter all views by a specific device ID.
 * @param {Object} dataService - The data service instance
 */
window.initDeviceFilter = async function initDeviceFilter(dataService) {
    const container = document.getElementById('deviceFilterContainer');
    if (!container) {
        console.warn('Device filter container not found');
        return;
    }

    let devices = [];
    let currentDeviceId = sessionStorage.getItem('selectedDeviceId') || 'all';

    /**
     * Loads the list of devices for the current organization
     */
    async function loadDeviceList() {
        try {
            const org = sessionStorage.getItem('org') || 'all';
            const deviceData = await dataService.getDeviceData(org);
            devices = deviceData.devices || [];
            
            // Sort devices by hostname for better UX
            devices.sort((a, b) => (a.hostname || '').localeCompare(b.hostname || ''));
            
            renderDeviceFilter();
        } catch (error) {
            console.error('Error loading device list for filter:', error);
            renderDeviceFilter(); // Render empty filter
        }
    }

    /**
     * Renders the device filter dropdown
     */
    function renderDeviceFilter(isUpdate = false) {
        const selectedDevice = devices.find(d => d.id === currentDeviceId);
        const displayText = currentDeviceId === 'all' || !selectedDevice ? 'All Devices' : selectedDevice.hostname;

        // If we are just updating, only change the display text and reset button
        if (isUpdate) {
            const displaySpan = container.querySelector('#deviceFilterDropdown .d-none.d-md-inline');
            if (displaySpan) {
                displaySpan.textContent = displayText;
            }
            const resetButtonContainer = container.querySelector('#device-reset-button-container');
            if (resetButtonContainer) {
                resetButtonContainer.innerHTML = currentDeviceId !== 'all' ? `
                    <button type="button" class="btn btn-sm btn-ghost-danger ms-1" onclick="window.deviceFilter.clearDeviceFilter()" title="Reset to Org-level view">
                        <i class="ti ti-x"></i>
                    </button>
                ` : '';
            }
            // Also update active state in the list
            container.querySelectorAll('#device-list-items a.dropdown-item').forEach(item => {
                if (item.dataset.deviceId === currentDeviceId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            return;
        }

        // Full render logic
        if (devices.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="d-flex align-items-center">
                <div class="dropdown">
                    <button class="btn btn-sm btn-outline-primary dropdown-toggle" type="button" id="deviceFilterDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="ti ti-device-desktop me-1"></i>
                        <span class="d-none d-md-inline">${displayText}</span>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="deviceFilterDropdown" style="max-height: 400px; overflow-y: auto; width: 350px;">
                        <li>
                            <div class="p-2">
                                <input type="search" class="form-control" placeholder="Search devices..." id="deviceSearchInput" autocomplete="off">
                            </div>
                        </li>
                        <li>
                            <h6 class="dropdown-header">Filter by Device</h6>
                        </li>
                        <div id="device-list-items">
                            <li>
                                <a class="dropdown-item ${currentDeviceId === 'all' ? 'active' : ''}" href="#" data-device-id="all">
                                    <i class="ti ti-apps me-2"></i>
                                    All Devices
                                </a>
                            </li>
                            <li><hr class="dropdown-divider"></li>
                            ${devices.map(device => `
                                <li data-search-term="${(device.hostname || '').toLowerCase()} ${(device.id || '').toLowerCase()}">
                                    <a class="dropdown-item ${currentDeviceId === device.id ? 'active' : ''}" href="#" data-device-id="${device.id}" title="Device ID: ${device.id}">
                                        <div class="d-flex align-items-center">
                                            <i class="ti ti-${device.status === 'Online' ? 'wifi' : 'wifi-off'} me-2 ${device.status === 'Online' ? 'text-success' : 'text-muted'}"></i>
                                            <div>
                                                <div class="fw-semibold">${device.hostname}</div>
                                                <div class="text-muted small">${device.id.substring(0, 16)}... • ${device.osVersion}</div>
                                            </div>
                                        </div>
                                    </a>
                                </li>
                            `).join('')}
                        </div>
                    </ul>
                </div>
                <div id="device-reset-button-container">
                    ${currentDeviceId !== 'all' ? `
                        <button type="button" class="btn btn-sm btn-ghost-danger ms-1" onclick="window.deviceFilter.clearDeviceFilter()" title="Reset to Org-level view">
                            <i class="ti ti-x"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // Use event delegation for clicks and search
        container.addEventListener('click', (e) => {
            const target = e.target.closest('a[data-device-id]');
            if (target) {
                e.preventDefault();
                const deviceId = target.dataset.deviceId;
                selectDevice(deviceId);
            }
        });

        container.addEventListener('keyup', (e) => {
            if (e.target.id === 'deviceSearchInput') {
                const searchTerm = e.target.value.toLowerCase();
                const deviceItems = container.querySelectorAll('#device-list-items > li[data-search-term]');
                deviceItems.forEach(item => {
                    item.style.display = item.dataset.searchTerm.includes(searchTerm) ? '' : 'none';
                });
            }
        });
    }

    /**
     * Sets the selected device, stores it, and reloads the page content
     * @param {string} deviceId - The ID of the device to select
     */
    function selectDevice(deviceId) {
        sessionStorage.setItem('selectedDeviceId', deviceId);
        currentDeviceId = deviceId;
        
        // Dispatch a custom event to notify other components
        document.dispatchEvent(new CustomEvent('deviceChanged', { detail: { deviceId } }));

        // Re-render the filter to show the new selection and then reload view
        renderDeviceFilter(true); // Pass true to indicate an update, not a full re-render
        
        // Small delay to ensure the current view state is properly set before reloading
        setTimeout(() => {
            const currentView = window.router.getCurrentView();
            if (currentView) {
                window.router.loadView(currentView);
            }
        }, 50);
    }

    /**
     * Clears the device filter and reloads the view to show all devices for the org
     */
    window.deviceFilter = {
        clearDeviceFilter: () => {
            selectDevice('all');
        }
    };

    // Listen for org changes to reload the device list
    document.addEventListener('orgChanged', (e) => {
        // Reset device to all when org changes
        sessionStorage.removeItem('selectedDeviceId');
        currentDeviceId = 'all';
        devices = []; // Clear previous device list
        renderDeviceFilter(); // Clear the dropdown immediately
        loadDeviceList();
    });

    // Initial load
    loadDeviceList();
};
