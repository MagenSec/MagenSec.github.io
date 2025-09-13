// MagenSec Hub Devices Page
class DevicesPage {
    constructor() {
        this.devices = [];
        this.filteredDevices = [];
        this.currentFilters = {
            status: 'all',
            type: 'all',
            search: '',
            group: 'all'
        };
        this.sortField = 'lastSeen';
        this.sortDirection = 'desc';
        this.currentPage = 1;
        this.pageSize = 20;
        this.selectedDevices = new Set();
        this.viewMode = 'table'; // 'table' or 'grid'
    }
    
    async render(route) {
        try {
            // Show main app view
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            
            // Get main content container
            const mainContent = document.getElementById('main-content');
            if (!mainContent) throw new Error('Main content container not found');
            
            // Parse route parameters
            this.parseRouteParams(route);
            
            // Show loading state
            mainContent.innerHTML = this.renderLoadingState();
            
            // Load devices data
            await this.loadDevices();
            
            // Render devices content
            mainContent.innerHTML = this.renderDevices();
            
            // Initialize interactive components
            this.initializeComponents();
            
        } catch (error) {
            console.error('Devices render error:', error);
            window.MagenSecUI.showToast('Failed to load devices', 'error');
            
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderErrorState(error);
            }
        }
    }
    
    parseRouteParams(route) {
        // Parse URL parameters for filters
        const params = new URLSearchParams(route.hash?.split('?')[1] || '');
        
        if (params.has('status')) {
            this.currentFilters.status = params.get('status');
        }
        if (params.has('type')) {
            this.currentFilters.type = params.get('type');
        }
        if (params.has('search')) {
            this.currentFilters.search = params.get('search');
        }
        if (params.has('view')) {
            this.viewMode = params.get('view');
        }
    }
    
    async loadDevices() {
        try {
            // Load devices from API with current filters
            const response = await window.MagenSecAPI.getDevices({
                status: this.currentFilters.status === 'all' ? undefined : this.currentFilters.status,
                type: this.currentFilters.type === 'all' ? undefined : this.currentFilters.type,
                search: this.currentFilters.search || undefined,
                group: this.currentFilters.group === 'all' ? undefined : this.currentFilters.group,
                page: this.currentPage,
                pageSize: this.pageSize,
                sortBy: this.sortField,
                sortOrder: this.sortDirection
            });
            
            this.devices = response.data.devices || [];
            this.totalCount = response.data.totalCount || 0;
            this.applyFilters();
            
        } catch (error) {
            const isMock404 = error && error.message && error.message.includes('HTTP 404 (mock fallback)');
            if (isMock404) {
                let fallbackDevices = [];
                // Try to use dashboard cached data if present
                try {
                    const dashboardCache = window.MagenSecApp?.dashboardCache || window.DashboardPage?.dashboardData;
                    const recent = dashboardCache?.recentDevices || dashboardCache?.RecentDevices;
                    if (Array.isArray(recent) && recent.length) {
                        fallbackDevices = recent.map(d => ({
                            id: d.deviceId || d.DeviceId || d.deviceID || 'unknown',
                            name: d.machineName || d.MachineName || 'Unknown Device',
                            status: (d.status || d.Status || 'unknown').toLowerCase(),
                            type: 'endpoint',
                            os: d.location || d.Location || 'Unknown',
                            lastSeen: d.lastSeen || d.LastSeen || new Date().toISOString(),
                            risk: 'medium'
                        }));
                    }
                } catch { /* ignore */ }

                this.devices = fallbackDevices;
                this.totalCount = fallbackDevices.length;
                this.filteredDevices = [...fallbackDevices];
                this.applyFilters();
                console.warn('Devices endpoint not available; using dashboard recent devices fallback');
                return;
            }
            console.error('Failed to load devices:', error);
            this.devices = [];
            this.totalCount = 0;
            this.filteredDevices = [];
            throw error;
        }
    }
    
    renderLoadingState() {
        return `
            <div class="p-6">
                <div class="mb-8">
                    <div class="h-8 bg-gray-200 rounded w-1/4 mb-2 animate-pulse"></div>
                    <div class="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                </div>
                <div class="bg-white rounded-lg shadow animate-pulse">
                    <div class="p-6">
                        <div class="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                        <div class="space-y-3">
                            ${Array(5).fill().map(() => `
                                <div class="h-16 bg-gray-200 rounded"></div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderDevices() {
        return `
            <div class="p-6 bg-gray-50 min-h-screen">
                <!-- Header -->
                <div class="mb-8">
                    <div class="flex justify-between items-center">
                        <div>
                            <h1 class="text-3xl font-bold text-gray-900">Device Management</h1>
                            <p class="text-gray-600 mt-1">Monitor and manage security across all your devices</p>
                        </div>
                        <div class="flex items-center space-x-4">
                            <button onclick="window.DevicesPage.addDevice()" 
                                    class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center">
                                <i class="fas fa-plus mr-2"></i>Add Device
                            </button>
                            <button onclick="window.DevicesPage.exportDevices()" 
                                    class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center">
                                <i class="fas fa-download mr-2"></i>Export
                            </button>
                            <button onclick="window.DevicesPage.refreshDevices()" 
                                    class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center">
                                <i class="fas fa-sync-alt mr-2"></i>Refresh
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Device Statistics -->
                ${this.renderDeviceStats()}

                <!-- Filters and Controls -->
                ${this.renderFiltersAndControls()}

                <!-- Devices Content -->
                ${this.viewMode === 'table' ? this.renderDevicesTable() : this.renderDevicesGrid()}

                <!-- Pagination -->
                ${this.renderPagination()}

                <!-- Device Details Modal (hidden by default) -->
                <div id="device-details-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50">
                    <div class="flex items-center justify-center min-h-screen">
                        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-screen overflow-y-auto">
                            <div id="device-details-content">
                                <!-- Content will be loaded dynamically -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Add Device Modal (hidden by default) -->
                <div id="add-device-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50">
                    <div class="flex items-center justify-center min-h-screen">
                        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
                            <div id="add-device-content">
                                <!-- Content will be loaded dynamically -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderDeviceStats() {
        const stats = this.calculateStats();
        
        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Total Devices</p>
                            <p class="text-3xl font-bold text-gray-900">${stats.total}</p>
                        </div>
                        <div class="bg-blue-50 p-3 rounded-lg">
                            <i class="fas fa-laptop text-xl text-blue-600"></i>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Online</p>
                            <p class="text-3xl font-bold text-green-600">${stats.online}</p>
                        </div>
                        <div class="bg-green-50 p-3 rounded-lg">
                            <i class="fas fa-check-circle text-xl text-green-600"></i>
                        </div>
                    </div>
                    <div class="mt-2">
                        <div class="text-sm text-gray-500">
                            ${stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}% of devices
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Alerts</p>
                            <p class="text-3xl font-bold text-red-600">${stats.alerts}</p>
                        </div>
                        <div class="bg-red-50 p-3 rounded-lg">
                            <i class="fas fa-exclamation-triangle text-xl text-red-600"></i>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Compliance</p>
                            <p class="text-3xl font-bold text-blue-600">${stats.compliance}%</p>
                        </div>
                        <div class="bg-blue-50 p-3 rounded-lg">
                            <i class="fas fa-shield-alt text-xl text-blue-600"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderFiltersAndControls() {
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
                <div class="p-6">
                    <div class="flex flex-wrap items-center justify-between gap-4">
                        <!-- Search -->
                        <div class="flex-1 min-w-0 max-w-md">
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i class="fas fa-search text-gray-400"></i>
                                </div>
                                <input type="text" id="device-search" placeholder="Search devices..." 
                                       value="${this.currentFilters.search}"
                                       class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
                            </div>
                        </div>
                        
                        <!-- Filters -->
                        <div class="flex items-center space-x-4">
                            <!-- Status Filter -->
                            <select id="status-filter" class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500">
                                <option value="all" ${this.currentFilters.status === 'all' ? 'selected' : ''}>All Status</option>
                                <option value="online" ${this.currentFilters.status === 'online' ? 'selected' : ''}>Online</option>
                                <option value="offline" ${this.currentFilters.status === 'offline' ? 'selected' : ''}>Offline</option>
                                <option value="warning" ${this.currentFilters.status === 'warning' ? 'selected' : ''}>Warning</option>
                                <option value="error" ${this.currentFilters.status === 'error' ? 'selected' : ''}>Error</option>
                            </select>
                            
                            <!-- Type Filter -->
                            <select id="type-filter" class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500">
                                <option value="all" ${this.currentFilters.type === 'all' ? 'selected' : ''}>All Types</option>
                                <option value="desktop" ${this.currentFilters.type === 'desktop' ? 'selected' : ''}>Desktop</option>
                                <option value="laptop" ${this.currentFilters.type === 'laptop' ? 'selected' : ''}>Laptop</option>
                                <option value="server" ${this.currentFilters.type === 'server' ? 'selected' : ''}>Server</option>
                                <option value="mobile" ${this.currentFilters.type === 'mobile' ? 'selected' : ''}>Mobile</option>
                            </select>
                            
                            <!-- Group Filter -->
                            <select id="group-filter" class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500">
                                <option value="all" ${this.currentFilters.group === 'all' ? 'selected' : ''}>All Groups</option>
                                <option value="production" ${this.currentFilters.group === 'production' ? 'selected' : ''}>Production</option>
                                <option value="development" ${this.currentFilters.group === 'development' ? 'selected' : ''}>Development</option>
                                <option value="testing" ${this.currentFilters.group === 'testing' ? 'selected' : ''}>Testing</option>
                            </select>
                            
                            <!-- View Mode Toggle -->
                            <div class="flex bg-gray-100 rounded-lg p-1">
                                <button onclick="window.DevicesPage.setViewMode('table')" 
                                        class="px-3 py-1 rounded text-sm font-medium transition-colors ${this.viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}">
                                    <i class="fas fa-list mr-1"></i>Table
                                </button>
                                <button onclick="window.DevicesPage.setViewMode('grid')" 
                                        class="px-3 py-1 rounded text-sm font-medium transition-colors ${this.viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}">
                                    <i class="fas fa-th mr-1"></i>Grid
                                </button>
                            </div>
                        </div>
                        
                        <!-- Bulk Actions -->
                        <div class="flex items-center space-x-2">
                            <button id="bulk-actions-btn" onclick="window.DevicesPage.showBulkActions()" 
                                    class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled>
                                <i class="fas fa-tasks mr-2"></i>Bulk Actions
                            </button>
                        </div>
                    </div>
                    
                    <!-- Active Filters Display -->
                    ${this.renderActiveFilters()}
                </div>
            </div>
        `;
    }
    
    renderActiveFilters() {
        const activeFilters = [];
        
        if (this.currentFilters.status !== 'all') {
            activeFilters.push({ type: 'status', value: this.currentFilters.status });
        }
        if (this.currentFilters.type !== 'all') {
            activeFilters.push({ type: 'type', value: this.currentFilters.type });
        }
        if (this.currentFilters.group !== 'all') {
            activeFilters.push({ type: 'group', value: this.currentFilters.group });
        }
        if (this.currentFilters.search) {
            activeFilters.push({ type: 'search', value: this.currentFilters.search });
        }
        
        if (activeFilters.length === 0) return '';
        
        return `
            <div class="mt-4 pt-4 border-t border-gray-200">
                <div class="flex items-center space-x-2">
                    <span class="text-sm text-gray-500">Active filters:</span>
                    ${activeFilters.map(filter => `
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            ${filter.type}: ${filter.value}
                            <button onclick="window.DevicesPage.removeFilter('${filter.type}')" 
                                    class="ml-2 text-blue-600 hover:text-blue-800">
                                <i class="fas fa-times"></i>
                            </button>
                        </span>
                    `).join('')}
                    <button onclick="window.DevicesPage.clearAllFilters()" 
                            class="text-sm text-gray-500 hover:text-gray-700 underline">
                        Clear all
                    </button>
                </div>
            </div>
        `;
    }
    
    renderDevicesTable() {
        if (this.filteredDevices.length === 0) {
            return this.renderEmptyState();
        }
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left">
                                    <input type="checkbox" id="select-all-devices" 
                                           onchange="window.DevicesPage.toggleSelectAll(this.checked)"
                                           class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                </th>
                                ${this.renderTableHeader('Device', 'name')}
                                ${this.renderTableHeader('Status', 'status')}
                                ${this.renderTableHeader('Type', 'type')}
                                ${this.renderTableHeader('OS', 'operatingSystem')}
                                ${this.renderTableHeader('Last Seen', 'lastSeen')}
                                ${this.renderTableHeader('Threats', 'threatCount')}
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${this.filteredDevices.map(device => this.renderDeviceRow(device)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    renderDevicesGrid() {
        if (this.filteredDevices.length === 0) {
            return this.renderEmptyState();
        }
        
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${this.filteredDevices.map(device => this.renderDeviceCard(device)).join('')}
            </div>
        `;
    }
    
    renderTableHeader(label, field) {
        const isActive = this.sortField === field;
        const direction = isActive ? this.sortDirection : 'asc';
        const nextDirection = isActive && direction === 'asc' ? 'desc' : 'asc';
        
        return `
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onclick="window.DevicesPage.sortBy('${field}', '${nextDirection}')">
                <div class="flex items-center space-x-1">
                    <span>${label}</span>
                    ${isActive ? `
                        <i class="fas fa-sort-${direction === 'asc' ? 'up' : 'down'} text-blue-500"></i>
                    ` : `
                        <i class="fas fa-sort text-gray-300"></i>
                    `}
                </div>
            </th>
        `;
    }
    
    renderDeviceRow(device) {
        const isSelected = this.selectedDevices.has(device.id);
        
        return `
            <tr class="hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}">
                <td class="px-6 py-4 whitespace-nowrap">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="window.DevicesPage.toggleDeviceSelection('${device.id}', this.checked)"
                           class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 h-10 w-10">
                            <div class="h-10 w-10 rounded-full ${this.getDeviceTypeColor(device.type)} flex items-center justify-center">
                                <i class="${this.getDeviceTypeIcon(device.type)} text-white"></i>
                            </div>
                        </div>
                        <div class="ml-4">
                            <div class="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600" 
                                 onclick="window.DevicesPage.showDeviceDetails('${device.id}')">
                                ${device.name}
                            </div>
                            <div class="text-sm text-gray-500">${device.ipAddress || 'No IP'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <div class="h-3 w-3 ${this.getStatusColor(device.status)} rounded-full"></div>
                        </div>
                        <span class="ml-2 text-sm text-gray-900 capitalize">${device.status}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                    ${device.type}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${device.operatingSystem || 'Unknown'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${window.MagenSecUI.formatDate(device.lastSeen, 'relative')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${device.threatCount > 0 ? `
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            ${device.threatCount} threat${device.threatCount !== 1 ? 's' : ''}
                        </span>
                    ` : `
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Secure
                        </span>
                    `}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div class="flex items-center space-x-2">
                        <button onclick="window.DevicesPage.showDeviceDetails('${device.id}')" 
                                class="text-blue-600 hover:text-blue-800" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button onclick="window.DevicesPage.runDeviceScan('${device.id}')" 
                                class="text-green-600 hover:text-green-800" title="Run Scan">
                            <i class="fas fa-search"></i>
                        </button>
                        <button onclick="window.DevicesPage.showDeviceActions('${device.id}')" 
                                class="text-gray-600 hover:text-gray-800" title="More Actions">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
    
    renderDeviceCard(device) {
        const isSelected = this.selectedDevices.has(device.id);
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow ${isSelected ? 'ring-2 ring-blue-500' : ''}">
                <div class="p-6">
                    <!-- Card Header -->
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} 
                                   onchange="window.DevicesPage.toggleDeviceSelection('${device.id}', this.checked)"
                                   class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3">
                            <div class="h-8 w-8 rounded-full ${this.getDeviceTypeColor(device.type)} flex items-center justify-center">
                                <i class="${this.getDeviceTypeIcon(device.type)} text-white text-sm"></i>
                            </div>
                        </div>
                        <div class="flex items-center">
                            <div class="h-3 w-3 ${this.getStatusColor(device.status)} rounded-full"></div>
                            <span class="ml-2 text-sm text-gray-600 capitalize">${device.status}</span>
                        </div>
                    </div>
                    
                    <!-- Device Name -->
                    <div class="mb-4">
                        <h3 class="text-lg font-semibold text-gray-900 cursor-pointer hover:text-blue-600" 
                            onclick="window.DevicesPage.showDeviceDetails('${device.id}')">
                            ${device.name}
                        </h3>
                        <p class="text-sm text-gray-500">${device.ipAddress || 'No IP Address'}</p>
                    </div>
                    
                    <!-- Device Info -->
                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Type:</span>
                            <span class="text-gray-900 capitalize">${device.type}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">OS:</span>
                            <span class="text-gray-900">${device.operatingSystem || 'Unknown'}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="text-gray-500">Last Seen:</span>
                            <span class="text-gray-900">${window.MagenSecUI.formatDate(device.lastSeen, 'relative')}</span>
                        </div>
                    </div>
                    
                    <!-- Threat Status -->
                    <div class="mb-4">
                        ${device.threatCount > 0 ? `
                            <div class="bg-red-50 border border-red-200 rounded-lg p-3">
                                <div class="flex items-center">
                                    <i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>
                                    <span class="text-sm font-medium text-red-800">
                                        ${device.threatCount} active threat${device.threatCount !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>
                        ` : `
                            <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                                <div class="flex items-center">
                                    <i class="fas fa-check-circle text-green-500 mr-2"></i>
                                    <span class="text-sm font-medium text-green-800">Secure</span>
                                </div>
                            </div>
                        `}
                    </div>
                    
                    <!-- Actions -->
                    <div class="flex space-x-2">
                        <button onclick="window.DevicesPage.showDeviceDetails('${device.id}')" 
                                class="flex-1 bg-blue-600 text-white text-sm py-2 px-3 rounded hover:bg-blue-700">
                            Details
                        </button>
                        <button onclick="window.DevicesPage.runDeviceScan('${device.id}')" 
                                class="flex-1 bg-green-600 text-white text-sm py-2 px-3 rounded hover:bg-green-700">
                            Scan
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderEmptyState() {
        const hasFilters = this.currentFilters.status !== 'all' || 
                          this.currentFilters.type !== 'all' || 
                          this.currentFilters.group !== 'all' ||
                          this.currentFilters.search;
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="text-center py-12">
                    <i class="fas fa-laptop text-6xl text-gray-400 mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">
                        ${hasFilters ? 'No devices match your filters' : 'No devices found'}
                    </h3>
                    <p class="text-gray-500 mb-6">
                        ${hasFilters ? 'Try adjusting your search criteria or filters.' : 'Add your first device to start monitoring.'}
                    </p>
                    <div class="flex justify-center space-x-4">
                        ${hasFilters ? `
                            <button onclick="window.DevicesPage.clearAllFilters()" 
                                    class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                                Clear Filters
                            </button>
                        ` : ''}
                        <button onclick="window.DevicesPage.addDevice()" 
                                class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                            Add Device
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderPagination() {
        const totalPages = Math.ceil(this.totalCount / this.pageSize);
        if (totalPages <= 1) return '';
        
        const pages = [];
        const maxPagesToShow = 5;
        
        let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        
        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        
        return `
            <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-lg shadow-sm mt-6">
                <div class="flex-1 flex justify-between sm:hidden">
                    <button onclick="window.DevicesPage.goToPage(${this.currentPage - 1})" 
                            ${this.currentPage === 1 ? 'disabled' : ''}
                            class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                        Previous
                    </button>
                    <button onclick="window.DevicesPage.goToPage(${this.currentPage + 1})" 
                            ${this.currentPage === totalPages ? 'disabled' : ''}
                            class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                        Next
                    </button>
                </div>
                <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p class="text-sm text-gray-700">
                            Showing <span class="font-medium">${(this.currentPage - 1) * this.pageSize + 1}</span> to 
                            <span class="font-medium">${Math.min(this.currentPage * this.pageSize, this.totalCount)}</span> of 
                            <span class="font-medium">${this.totalCount}</span> results
                        </p>
                    </div>
                    <div>
                        <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                            <button onclick="window.DevicesPage.goToPage(${this.currentPage - 1})" 
                                    ${this.currentPage === 1 ? 'disabled' : ''}
                                    class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            ${pages.map(page => `
                                <button onclick="window.DevicesPage.goToPage(${page})" 
                                        class="relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                            page === this.currentPage 
                                                ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' 
                                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                        }">
                                    ${page}
                                </button>
                            `).join('')}
                            <button onclick="window.DevicesPage.goToPage(${this.currentPage + 1})" 
                                    ${this.currentPage === totalPages ? 'disabled' : ''}
                                    class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderErrorState(error) {
        return `
            <div class="p-6">
                <div class="text-center py-12">
                    <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Unable to Load Devices</h2>
                    <p class="text-gray-600 mb-6">There was an error loading device data. Please try again.</p>
                    <button onclick="window.DevicesPage.render()" 
                            class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }
    
    // ======================
    // Component Initialization
    // ======================
    
    initializeComponents() {
        // Setup search input
        const searchInput = document.getElementById('device-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.updateFilter('search', e.target.value);
                }, 300);
            });
        }
        
        // Setup filter dropdowns
        ['status-filter', 'type-filter', 'group-filter'].forEach(filterId => {
            const filterElement = document.getElementById(filterId);
            if (filterElement) {
                filterElement.addEventListener('change', (e) => {
                    const filterType = filterId.replace('-filter', '');
                    this.updateFilter(filterType, e.target.value);
                });
            }
        });
        
        // Update bulk actions button state
        this.updateBulkActionsButton();
    }
    
    // ======================
    // Data Management
    // ======================
    
    applyFilters() {
        this.filteredDevices = this.devices.filter(device => {
            // Status filter
            if (this.currentFilters.status !== 'all' && device.status !== this.currentFilters.status) {
                return false;
            }
            
            // Type filter
            if (this.currentFilters.type !== 'all' && device.type !== this.currentFilters.type) {
                return false;
            }
            
            // Group filter
            if (this.currentFilters.group !== 'all' && device.group !== this.currentFilters.group) {
                return false;
            }
            
            // Search filter
            if (this.currentFilters.search) {
                const searchTerm = this.currentFilters.search.toLowerCase();
                if (!device.name.toLowerCase().includes(searchTerm) &&
                    !device.ipAddress?.toLowerCase().includes(searchTerm) &&
                    !device.operatingSystem?.toLowerCase().includes(searchTerm)) {
                    return false;
                }
            }
            
            return true;
        });
        
        this.sortDevices();
    }
    
    sortDevices() {
        this.filteredDevices.sort((a, b) => {
            let aValue = a[this.sortField];
            let bValue = b[this.sortField];
            
            // Handle dates
            if (this.sortField === 'lastSeen') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            }
            
            // Handle strings
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }
            
            if (aValue < bValue) {
                return this.sortDirection === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return this.sortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }
    
    calculateStats() {
        const stats = {
            total: this.devices.length,
            online: 0,
            alerts: 0,
            compliance: 0
        };
        
        this.devices.forEach(device => {
            if (device.status === 'online') {
                stats.online++;
            }
            
            if (device.threatCount > 0) {
                stats.alerts += device.threatCount;
            }
        });
        
        // Calculate compliance percentage (mock calculation)
        stats.compliance = stats.total > 0 ? Math.round(((stats.total - stats.alerts) / stats.total) * 100) : 100;
        
        return stats;
    }
    
    // ======================
    // Event Handlers
    // ======================
    
    async updateFilter(filterType, value) {
        this.currentFilters[filterType] = value;
        this.currentPage = 1; // Reset to first page
        
        // Update URL
        this.updateURL();
        
        // Reload devices with new filters
        try {
            await this.loadDevices();
            
            // Re-render content
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderDevices();
                this.initializeComponents();
            }
        } catch (error) {
            console.error('Failed to update filter:', error);
            window.MagenSecUI.showToast('Failed to apply filter', 'error');
        }
    }
    
    removeFilter(filterType) {
        const defaultValues = {
            status: 'all',
            type: 'all',
            group: 'all',
            search: ''
        };
        
        this.updateFilter(filterType, defaultValues[filterType] || '');
    }
    
    clearAllFilters() {
        this.currentFilters = {
            status: 'all',
            type: 'all',
            search: '',
            group: 'all'
        };
        
        this.updateFilter('status', 'all');
    }
    
    setViewMode(mode) {
        this.viewMode = mode;
        this.updateURL();
        
        // Re-render content
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = this.renderDevices();
            this.initializeComponents();
        }
    }
    
    sortBy(field, direction) {
        this.sortField = field;
        this.sortDirection = direction;
        
        this.applyFilters();
        
        // Re-render table/grid
        const contentContainer = this.viewMode === 'table' 
            ? document.querySelector('.overflow-x-auto').parentElement
            : document.querySelector('.grid');
            
        if (contentContainer) {
            contentContainer.outerHTML = this.viewMode === 'table' 
                ? this.renderDevicesTable() 
                : this.renderDevicesGrid();
            this.initializeComponents();
        }
    }
    
    async goToPage(page) {
        if (page < 1 || page > Math.ceil(this.totalCount / this.pageSize)) {
            return;
        }
        
        this.currentPage = page;
        this.updateURL();
        
        try {
            await this.loadDevices();
            
            // Re-render content
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderDevices();
                this.initializeComponents();
            }
        } catch (error) {
            console.error('Failed to change page:', error);
            window.MagenSecUI.showToast('Failed to load page', 'error');
        }
    }
    
    updateURL() {
        const params = new URLSearchParams();
        
        if (this.currentFilters.status !== 'all') {
            params.set('status', this.currentFilters.status);
        }
        if (this.currentFilters.type !== 'all') {
            params.set('type', this.currentFilters.type);
        }
        if (this.currentFilters.group !== 'all') {
            params.set('group', this.currentFilters.group);
        }
        if (this.currentFilters.search) {
            params.set('search', this.currentFilters.search);
        }
        if (this.viewMode !== 'table') {
            params.set('view', this.viewMode);
        }
        if (this.currentPage > 1) {
            params.set('page', this.currentPage.toString());
        }
        
        const newURL = '#/devices' + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState(null, '', newURL);
    }
    
    // ======================
    // Selection Management
    // ======================
    
    toggleSelectAll(checked) {
        this.selectedDevices.clear();
        
        if (checked) {
            this.filteredDevices.forEach(device => {
                this.selectedDevices.add(device.id);
            });
        }
        
        // Update individual checkboxes
        document.querySelectorAll('input[type="checkbox"]:not(#select-all-devices)').forEach(checkbox => {
            checkbox.checked = checked;
        });
        
        this.updateBulkActionsButton();
    }
    
    toggleDeviceSelection(deviceId, checked) {
        if (checked) {
            this.selectedDevices.add(deviceId);
        } else {
            this.selectedDevices.delete(deviceId);
        }
        
        // Update select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-devices');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = this.selectedDevices.size === this.filteredDevices.length;
            selectAllCheckbox.indeterminate = this.selectedDevices.size > 0 && this.selectedDevices.size < this.filteredDevices.length;
        }
        
        this.updateBulkActionsButton();
    }
    
    updateBulkActionsButton() {
        const bulkActionsBtn = document.getElementById('bulk-actions-btn');
        if (bulkActionsBtn) {
            bulkActionsBtn.disabled = this.selectedDevices.size === 0;
            bulkActionsBtn.textContent = `Bulk Actions (${this.selectedDevices.size})`;
        }
    }
    
    // ======================
    // Action Handlers
    // ======================
    
    async refreshDevices() {
        try {
            window.MagenSecUI.showToast('Refreshing devices...', 'info');
            
            await this.loadDevices();
            
            // Re-render content
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderDevices();
                this.initializeComponents();
            }
            
            window.MagenSecUI.showToast('Devices updated', 'success');
            
        } catch (error) {
            console.error('Refresh failed:', error);
            window.MagenSecUI.showToast('Failed to refresh devices', 'error');
        }
    }
    
    exportDevices() {
        window.MagenSecUI.showToast('Exporting devices...', 'info');
        // Implementation would generate CSV/Excel export
        setTimeout(() => {
            window.MagenSecUI.showToast('Export completed', 'success');
        }, 2000);
    }
    
    addDevice() {
        // Show add device modal
        const modal = document.getElementById('add-device-modal');
        const modalContent = document.getElementById('add-device-content');
        
        if (modal && modalContent) {
            modalContent.innerHTML = this.renderAddDeviceModal();
            modal.classList.remove('hidden');
            
            // Setup close handler
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAddDevice();
                }
            });
        }
    }
    
    closeAddDevice() {
        const modal = document.getElementById('add-device-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    async showDeviceDetails(deviceId) {
        try {
            // Load detailed device information
            const response = await window.MagenSecAPI.getDeviceDetails(deviceId);
            const device = response.data;
            
            // Render device details modal
            const modalContent = document.getElementById('device-details-content');
            const modal = document.getElementById('device-details-modal');
            
            if (modalContent && modal) {
                modalContent.innerHTML = this.renderDeviceDetailsModal(device);
                modal.classList.remove('hidden');
                
                // Setup close handler
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.closeDeviceDetails();
                    }
                });
            }
            
        } catch (error) {
            console.error('Failed to load device details:', error);
            window.MagenSecUI.showToast('Failed to load device details', 'error');
        }
    }
    
    closeDeviceDetails() {
        const modal = document.getElementById('device-details-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    async runDeviceScan(deviceId) {
        try {
            window.MagenSecUI.showToast('Starting device scan...', 'info');
            
            await window.MagenSecAPI.runDeviceScan(deviceId);
            
            window.MagenSecUI.showToast('Device scan completed', 'success');
            
            // Refresh devices to get updated data
            await this.refreshDevices();
            
        } catch (error) {
            console.error('Failed to run device scan:', error);
            window.MagenSecUI.showToast('Failed to run device scan', 'error');
        }
    }
    
    showBulkActions() {
        const actions = [
            'Run Security Scan',
            'Update Agents',
            'Enable Protection',
            'Disable Protection',
            'Export Selected',
            'Remove Devices'
        ];
        
        // Implementation would show a dropdown or modal with bulk actions
        window.MagenSecUI.showToast(`Bulk actions for ${this.selectedDevices.size} devices`, 'info');
    }
    
    showDeviceActions(deviceId) {
        // Implementation would show contextual menu
        window.MagenSecUI.showToast('Device actions menu', 'info');
    }
    
    renderAddDeviceModal() {
        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">Add New Device</h2>
                    <button onclick="window.DevicesPage.closeAddDevice()" 
                            class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <form id="add-device-form" class="space-y-6">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Device Name</label>
                            <input type="text" name="name" required 
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Device Type</label>
                            <select name="type" required 
                                    class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
                                <option value="">Select Type</option>
                                <option value="desktop">Desktop</option>
                                <option value="laptop">Laptop</option>
                                <option value="server">Server</option>
                                <option value="mobile">Mobile</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">IP Address</label>
                            <input type="text" name="ipAddress" 
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Operating System</label>
                            <input type="text" name="operatingSystem" 
                                   class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Group</label>
                        <select name="group" 
                                class="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="production">Production</option>
                            <option value="development">Development</option>
                            <option value="testing">Testing</option>
                        </select>
                    </div>
                    
                    <div class="flex justify-end space-x-3">
                        <button type="button" onclick="window.DevicesPage.closeAddDevice()" 
                                class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400">
                            Cancel
                        </button>
                        <button type="submit" 
                                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            Add Device
                        </button>
                    </div>
                </form>
            </div>
        `;
    }
    
    renderDeviceDetailsModal(device) {
        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">Device Details</h2>
                    <button onclick="window.DevicesPage.closeDeviceDetails()" 
                            class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <!-- Device details content would go here -->
                <div class="space-y-6">
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Device Name</label>
                            <p class="mt-1 text-sm text-gray-900">${device.name}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Status</label>
                            <span class="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getStatusClasses(device.status)}">
                                ${device.status}
                            </span>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Type</label>
                            <p class="mt-1 text-sm text-gray-900 capitalize">${device.type}</p>
                        </div>
                    </div>
                    
                    <!-- More detailed information would be displayed here -->
                </div>
                
                <div class="mt-8 flex justify-end space-x-3">
                    <button onclick="window.DevicesPage.closeDeviceDetails()" 
                            class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400">
                        Close
                    </button>
                    <button onclick="window.DevicesPage.runDeviceScan('${device.id}')" 
                            class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                        Run Scan
                    </button>
                </div>
            </div>
        `;
    }
    
    // ======================
    // Utility Methods
    // ======================
    
    getDeviceTypeIcon(type) {
        const icons = {
            'desktop': 'fas fa-desktop',
            'laptop': 'fas fa-laptop',
            'server': 'fas fa-server',
            'mobile': 'fas fa-mobile-alt'
        };
        return icons[type] || 'fas fa-laptop';
    }
    
    getDeviceTypeColor(type) {
        const colors = {
            'desktop': 'bg-blue-500',
            'laptop': 'bg-green-500',
            'server': 'bg-purple-500',
            'mobile': 'bg-orange-500'
        };
        return colors[type] || 'bg-gray-500';
    }
    
    getStatusColor(status) {
        const colors = {
            'online': 'bg-green-500',
            'offline': 'bg-gray-400',
            'warning': 'bg-yellow-500',
            'error': 'bg-red-500'
        };
        return colors[status] || 'bg-gray-400';
    }
    
    getStatusClasses(status) {
        const classes = {
            'online': 'bg-green-100 text-green-800',
            'offline': 'bg-gray-100 text-gray-800',
            'warning': 'bg-yellow-100 text-yellow-800',
            'error': 'bg-red-100 text-red-800'
        };
        return classes[status] || 'bg-gray-100 text-gray-800';
    }
    
    // ======================
    // Cleanup
    // ======================
    
    destroy() {
        this.selectedDevices.clear();
    }
}

// Initialize global devices page instance
window.DevicesPage = new DevicesPage();
