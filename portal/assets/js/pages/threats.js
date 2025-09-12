// MagenSec Hub Threats Page
class ThreatsPage {
    constructor() {
        this.threats = [];
        this.filteredThreats = [];
        this.currentFilters = {
            status: 'all',
            severity: 'all',
            search: '',
            dateRange: '7d'
        };
        this.sortField = 'detectedAt';
        this.sortDirection = 'desc';
        this.currentPage = 1;
        this.pageSize = 20;
        this.selectedThreats = new Set();
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
            
            // Load threats data
            await this.loadThreats();
            
            // Render threats content
            mainContent.innerHTML = this.renderThreats();
            
            // Initialize interactive components
            this.initializeComponents();
            
        } catch (error) {
            console.error('Threats render error:', error);
            window.MagenSecUI.showToast('Failed to load threats', 'error');
            
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
        if (params.has('severity')) {
            this.currentFilters.severity = params.get('severity');
        }
        if (params.has('search')) {
            this.currentFilters.search = params.get('search');
        }
    }
    
    async loadThreats() {
        try {
            // Load threats from API with current filters
            const response = await window.MagenSecAPI.getThreats({
                status: this.currentFilters.status === 'all' ? undefined : this.currentFilters.status,
                severity: this.currentFilters.severity === 'all' ? undefined : this.currentFilters.severity,
                search: this.currentFilters.search || undefined,
                dateRange: this.currentFilters.dateRange,
                page: this.currentPage,
                pageSize: this.pageSize,
                sortBy: this.sortField,
                sortOrder: this.sortDirection
            });
            
            this.threats = response.data.threats || [];
            this.totalCount = response.data.totalCount || 0;
            this.applyFilters();
            
        } catch (error) {
            console.error('Failed to load threats:', error);
            
            // Use fallback data
            this.threats = [];
            this.totalCount = 0;
            this.filteredThreats = [];
            
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
    
    renderThreats() {
        return `
            <div class="p-6 bg-gray-50 min-h-screen">
                <!-- Header -->
                <div class="mb-8">
                    <div class="flex justify-between items-center">
                        <div>
                            <h1 class="text-3xl font-bold text-gray-900">Threat Management</h1>
                            <p class="text-gray-600 mt-1">Monitor and respond to security threats across your organization</p>
                        </div>
                        <div class="flex items-center space-x-4">
                            <button onclick="window.ThreatsPage.exportThreats()" 
                                    class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center">
                                <i class="fas fa-download mr-2"></i>Export
                            </button>
                            <button onclick="window.ThreatsPage.refreshThreats()" 
                                    class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center">
                                <i class="fas fa-sync-alt mr-2"></i>Refresh
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Threat Statistics -->
                ${this.renderThreatStats()}

                <!-- Filters and Controls -->
                ${this.renderFiltersAndControls()}

                <!-- Threats Table -->
                ${this.renderThreatsTable()}

                <!-- Pagination -->
                ${this.renderPagination()}

                <!-- Threat Details Modal (hidden by default) -->
                <div id="threat-details-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden z-50">
                    <div class="flex items-center justify-center min-h-screen">
                        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-screen overflow-y-auto">
                            <div id="threat-details-content">
                                <!-- Content will be loaded dynamically -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderThreatStats() {
        const stats = this.calculateStats();
        
        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Active Threats</p>
                            <p class="text-3xl font-bold text-red-600">${stats.active}</p>
                        </div>
                        <div class="bg-red-50 p-3 rounded-lg">
                            <i class="fas fa-exclamation-triangle text-xl text-red-600"></i>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Critical</p>
                            <p class="text-3xl font-bold text-red-500">${stats.critical}</p>
                        </div>
                        <div class="bg-red-50 p-3 rounded-lg">
                            <i class="fas fa-skull-crossbones text-xl text-red-500"></i>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Resolved Today</p>
                            <p class="text-3xl font-bold text-green-600">${stats.resolvedToday}</p>
                        </div>
                        <div class="bg-green-50 p-3 rounded-lg">
                            <i class="fas fa-check-circle text-xl text-green-600"></i>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">Response Time</p>
                            <p class="text-3xl font-bold text-blue-600">${stats.avgResponseTime}m</p>
                        </div>
                        <div class="bg-blue-50 p-3 rounded-lg">
                            <i class="fas fa-clock text-xl text-blue-600"></i>
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
                                <input type="text" id="threat-search" placeholder="Search threats..." 
                                       value="${this.currentFilters.search}"
                                       class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">
                            </div>
                        </div>
                        
                        <!-- Filters -->
                        <div class="flex items-center space-x-4">
                            <!-- Status Filter -->
                            <select id="status-filter" class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500">
                                <option value="all" ${this.currentFilters.status === 'all' ? 'selected' : ''}>All Status</option>
                                <option value="active" ${this.currentFilters.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="investigating" ${this.currentFilters.status === 'investigating' ? 'selected' : ''}>Investigating</option>
                                <option value="resolved" ${this.currentFilters.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                                <option value="dismissed" ${this.currentFilters.status === 'dismissed' ? 'selected' : ''}>Dismissed</option>
                            </select>
                            
                            <!-- Severity Filter -->
                            <select id="severity-filter" class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500">
                                <option value="all" ${this.currentFilters.severity === 'all' ? 'selected' : ''}>All Severity</option>
                                <option value="Critical" ${this.currentFilters.severity === 'Critical' ? 'selected' : ''}>Critical</option>
                                <option value="High" ${this.currentFilters.severity === 'High' ? 'selected' : ''}>High</option>
                                <option value="Medium" ${this.currentFilters.severity === 'Medium' ? 'selected' : ''}>Medium</option>
                                <option value="Low" ${this.currentFilters.severity === 'Low' ? 'selected' : ''}>Low</option>
                            </select>
                            
                            <!-- Date Range Filter -->
                            <select id="date-filter" class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500">
                                <option value="24h" ${this.currentFilters.dateRange === '24h' ? 'selected' : ''}>Last 24 hours</option>
                                <option value="7d" ${this.currentFilters.dateRange === '7d' ? 'selected' : ''}>Last 7 days</option>
                                <option value="30d" ${this.currentFilters.dateRange === '30d' ? 'selected' : ''}>Last 30 days</option>
                                <option value="90d" ${this.currentFilters.dateRange === '90d' ? 'selected' : ''}>Last 90 days</option>
                            </select>
                        </div>
                        
                        <!-- Bulk Actions -->
                        <div class="flex items-center space-x-2">
                            <button id="bulk-actions-btn" onclick="window.ThreatsPage.showBulkActions()" 
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
        if (this.currentFilters.severity !== 'all') {
            activeFilters.push({ type: 'severity', value: this.currentFilters.severity });
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
                            <button onclick="window.ThreatsPage.removeFilter('${filter.type}')" 
                                    class="ml-2 text-blue-600 hover:text-blue-800">
                                <i class="fas fa-times"></i>
                            </button>
                        </span>
                    `).join('')}
                    <button onclick="window.ThreatsPage.clearAllFilters()" 
                            class="text-sm text-gray-500 hover:text-gray-700 underline">
                        Clear all
                    </button>
                </div>
            </div>
        `;
    }
    
    renderThreatsTable() {
        if (this.filteredThreats.length === 0) {
            return this.renderEmptyState();
        }
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left">
                                    <input type="checkbox" id="select-all-threats" 
                                           onchange="window.ThreatsPage.toggleSelectAll(this.checked)"
                                           class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                                </th>
                                ${this.renderTableHeader('Threat', 'name')}
                                ${this.renderTableHeader('Severity', 'severity')}
                                ${this.renderTableHeader('Status', 'status')}
                                ${this.renderTableHeader('Device', 'deviceName')}
                                ${this.renderTableHeader('Detected', 'detectedAt')}
                                ${this.renderTableHeader('Updated', 'lastUpdated')}
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${this.filteredThreats.map(threat => this.renderThreatRow(threat)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    renderTableHeader(label, field) {
        const isActive = this.sortField === field;
        const direction = isActive ? this.sortDirection : 'asc';
        const nextDirection = isActive && direction === 'asc' ? 'desc' : 'asc';
        
        return `
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onclick="window.ThreatsPage.sortBy('${field}', '${nextDirection}')">
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
    
    renderThreatRow(threat) {
        const isSelected = this.selectedThreats.has(threat.id);
        
        return `
            <tr class="hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}">
                <td class="px-6 py-4 whitespace-nowrap">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="window.ThreatsPage.toggleThreatSelection('${threat.id}', this.checked)"
                           class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="flex-shrink-0 h-3 w-3 ${this.getThreatColor(threat.severity)} rounded-full mr-3"></div>
                        <div>
                            <div class="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600" 
                                 onclick="window.ThreatsPage.showThreatDetails('${threat.id}')">
                                ${threat.name}
                            </div>
                            <div class="text-sm text-gray-500 truncate max-w-xs">
                                ${threat.description || 'No description'}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getThreatSeverityClasses(threat.severity)}">
                        ${threat.severity}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getThreatStatusClasses(threat.status)}">
                        ${threat.status}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${threat.deviceName || 'Unknown'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${window.MagenSecUI.formatDate(threat.detectedAt, 'relative')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${window.MagenSecUI.formatDate(threat.lastUpdated, 'relative')}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div class="flex items-center space-x-2">
                        <button onclick="window.ThreatsPage.showThreatDetails('${threat.id}')" 
                                class="text-blue-600 hover:text-blue-800" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${threat.status === 'active' ? `
                            <button onclick="window.ThreatsPage.updateThreatStatus('${threat.id}', 'investigating')" 
                                    class="text-yellow-600 hover:text-yellow-800" title="Start Investigation">
                                <i class="fas fa-search"></i>
                            </button>
                            <button onclick="window.ThreatsPage.updateThreatStatus('${threat.id}', 'resolved')" 
                                    class="text-green-600 hover:text-green-800" title="Mark Resolved">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                        <button onclick="window.ThreatsPage.showThreatActions('${threat.id}')" 
                                class="text-gray-600 hover:text-gray-800" title="More Actions">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
    
    renderEmptyState() {
        const hasFilters = this.currentFilters.status !== 'all' || 
                          this.currentFilters.severity !== 'all' || 
                          this.currentFilters.search;
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="text-center py-12">
                    <i class="fas fa-shield-check text-6xl text-green-500 mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">
                        ${hasFilters ? 'No threats match your filters' : 'No threats detected'}
                    </h3>
                    <p class="text-gray-500 mb-6">
                        ${hasFilters ? 'Try adjusting your search criteria or filters.' : 'Your systems are secure. No security threats have been detected.'}
                    </p>
                    ${hasFilters ? `
                        <button onclick="window.ThreatsPage.clearAllFilters()" 
                                class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            Clear Filters
                        </button>
                    ` : ''}
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
            <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-lg shadow-sm">
                <div class="flex-1 flex justify-between sm:hidden">
                    <button onclick="window.ThreatsPage.goToPage(${this.currentPage - 1})" 
                            ${this.currentPage === 1 ? 'disabled' : ''}
                            class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                        Previous
                    </button>
                    <button onclick="window.ThreatsPage.goToPage(${this.currentPage + 1})" 
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
                            <button onclick="window.ThreatsPage.goToPage(${this.currentPage - 1})" 
                                    ${this.currentPage === 1 ? 'disabled' : ''}
                                    class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            ${pages.map(page => `
                                <button onclick="window.ThreatsPage.goToPage(${page})" 
                                        class="relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                            page === this.currentPage 
                                                ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' 
                                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                        }">
                                    ${page}
                                </button>
                            `).join('')}
                            <button onclick="window.ThreatsPage.goToPage(${this.currentPage + 1})" 
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
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Unable to Load Threats</h2>
                    <p class="text-gray-600 mb-6">There was an error loading threat data. Please try again.</p>
                    <button onclick="window.ThreatsPage.render()" 
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
        const searchInput = document.getElementById('threat-search');
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
        ['status-filter', 'severity-filter', 'date-filter'].forEach(filterId => {
            const filterElement = document.getElementById(filterId);
            if (filterElement) {
                filterElement.addEventListener('change', (e) => {
                    const filterType = filterId.replace('-filter', '');
                    const value = filterType === 'date' ? 'dateRange' : filterType;
                    this.updateFilter(value, e.target.value);
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
        this.filteredThreats = this.threats.filter(threat => {
            // Status filter
            if (this.currentFilters.status !== 'all' && threat.status !== this.currentFilters.status) {
                return false;
            }
            
            // Severity filter
            if (this.currentFilters.severity !== 'all' && threat.severity !== this.currentFilters.severity) {
                return false;
            }
            
            // Search filter
            if (this.currentFilters.search) {
                const searchTerm = this.currentFilters.search.toLowerCase();
                if (!threat.name.toLowerCase().includes(searchTerm) &&
                    !threat.description?.toLowerCase().includes(searchTerm) &&
                    !threat.deviceName?.toLowerCase().includes(searchTerm)) {
                    return false;
                }
            }
            
            return true;
        });
        
        this.sortThreats();
    }
    
    sortThreats() {
        this.filteredThreats.sort((a, b) => {
            let aValue = a[this.sortField];
            let bValue = b[this.sortField];
            
            // Handle dates
            if (this.sortField === 'detectedAt' || this.sortField === 'lastUpdated') {
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
            active: 0,
            critical: 0,
            resolvedToday: 0,
            avgResponseTime: 0
        };
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        this.threats.forEach(threat => {
            if (threat.status === 'active') {
                stats.active++;
            }
            
            if (threat.severity === 'Critical') {
                stats.critical++;
            }
            
            if (threat.status === 'resolved' && new Date(threat.lastUpdated) >= today) {
                stats.resolvedToday++;
            }
        });
        
        // Mock average response time calculation
        stats.avgResponseTime = Math.floor(Math.random() * 30) + 15;
        
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
        
        // Reload threats with new filters
        try {
            await this.loadThreats();
            
            // Re-render content
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderThreats();
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
            severity: 'all',
            search: ''
        };
        
        this.updateFilter(filterType, defaultValues[filterType] || '');
    }
    
    clearAllFilters() {
        this.currentFilters = {
            status: 'all',
            severity: 'all',
            search: '',
            dateRange: '7d'
        };
        
        this.updateFilter('status', 'all');
    }
    
    sortBy(field, direction) {
        this.sortField = field;
        this.sortDirection = direction;
        
        this.applyFilters();
        
        // Re-render table
        const tableContainer = document.querySelector('.overflow-x-auto').parentElement;
        if (tableContainer) {
            tableContainer.outerHTML = this.renderThreatsTable();
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
            await this.loadThreats();
            
            // Re-render content
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderThreats();
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
        if (this.currentFilters.severity !== 'all') {
            params.set('severity', this.currentFilters.severity);
        }
        if (this.currentFilters.search) {
            params.set('search', this.currentFilters.search);
        }
        if (this.currentPage > 1) {
            params.set('page', this.currentPage.toString());
        }
        
        const newURL = '#/threats' + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState(null, '', newURL);
    }
    
    // ======================
    // Selection Management
    // ======================
    
    toggleSelectAll(checked) {
        this.selectedThreats.clear();
        
        if (checked) {
            this.filteredThreats.forEach(threat => {
                this.selectedThreats.add(threat.id);
            });
        }
        
        // Update individual checkboxes
        document.querySelectorAll('input[type="checkbox"]:not(#select-all-threats)').forEach(checkbox => {
            checkbox.checked = checked;
        });
        
        this.updateBulkActionsButton();
    }
    
    toggleThreatSelection(threatId, checked) {
        if (checked) {
            this.selectedThreats.add(threatId);
        } else {
            this.selectedThreats.delete(threatId);
        }
        
        // Update select all checkbox
        const selectAllCheckbox = document.getElementById('select-all-threats');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = this.selectedThreats.size === this.filteredThreats.length;
            selectAllCheckbox.indeterminate = this.selectedThreats.size > 0 && this.selectedThreats.size < this.filteredThreats.length;
        }
        
        this.updateBulkActionsButton();
    }
    
    updateBulkActionsButton() {
        const bulkActionsBtn = document.getElementById('bulk-actions-btn');
        if (bulkActionsBtn) {
            bulkActionsBtn.disabled = this.selectedThreats.size === 0;
            bulkActionsBtn.textContent = `Bulk Actions (${this.selectedThreats.size})`;
        }
    }
    
    // ======================
    // Action Handlers
    // ======================
    
    async refreshThreats() {
        try {
            window.MagenSecUI.showToast('Refreshing threats...', 'info');
            
            await this.loadThreats();
            
            // Re-render content
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderThreats();
                this.initializeComponents();
            }
            
            window.MagenSecUI.showToast('Threats updated', 'success');
            
        } catch (error) {
            console.error('Refresh failed:', error);
            window.MagenSecUI.showToast('Failed to refresh threats', 'error');
        }
    }
    
    exportThreats() {
        window.MagenSecUI.showToast('Exporting threats...', 'info');
        // Implementation would generate CSV/Excel export
        setTimeout(() => {
            window.MagenSecUI.showToast('Export completed', 'success');
        }, 2000);
    }
    
    async showThreatDetails(threatId) {
        try {
            // Load detailed threat information
            const response = await window.MagenSecAPI.getThreatDetails(threatId);
            const threat = response.data;
            
            // Render threat details modal
            const modalContent = document.getElementById('threat-details-content');
            const modal = document.getElementById('threat-details-modal');
            
            if (modalContent && modal) {
                modalContent.innerHTML = this.renderThreatDetailsModal(threat);
                modal.classList.remove('hidden');
                
                // Setup close handlers
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.closeThreatDetails();
                    }
                });
            }
            
        } catch (error) {
            console.error('Failed to load threat details:', error);
            window.MagenSecUI.showToast('Failed to load threat details', 'error');
        }
    }
    
    closeThreatDetails() {
        const modal = document.getElementById('threat-details-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    async updateThreatStatus(threatId, newStatus) {
        try {
            await window.MagenSecAPI.updateThreatStatus(threatId, newStatus);
            
            // Update local data
            const threat = this.threats.find(t => t.id === threatId);
            if (threat) {
                threat.status = newStatus;
                threat.lastUpdated = new Date().toISOString();
            }
            
            // Re-apply filters and re-render
            this.applyFilters();
            
            const tableContainer = document.querySelector('.overflow-x-auto').parentElement;
            if (tableContainer) {
                tableContainer.outerHTML = this.renderThreatsTable();
                this.initializeComponents();
            }
            
            window.MagenSecUI.showToast(`Threat status updated to ${newStatus}`, 'success');
            
        } catch (error) {
            console.error('Failed to update threat status:', error);
            window.MagenSecUI.showToast('Failed to update threat status', 'error');
        }
    }
    
    showBulkActions() {
        const actions = [
            'Mark as Investigating',
            'Mark as Resolved',
            'Dismiss Threats',
            'Export Selected',
            'Assign to User'
        ];
        
        // Implementation would show a dropdown or modal with bulk actions
        window.MagenSecUI.showToast(`Bulk actions for ${this.selectedThreats.size} threats`, 'info');
    }
    
    showThreatActions(threatId) {
        // Implementation would show contextual menu
        window.MagenSecUI.showToast('Threat actions menu', 'info');
    }
    
    renderThreatDetailsModal(threat) {
        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">Threat Details</h2>
                    <button onclick="window.ThreatsPage.closeThreatDetails()" 
                            class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <!-- Threat overview content would go here -->
                <div class="space-y-6">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Threat Name</label>
                            <p class="mt-1 text-sm text-gray-900">${threat.name}</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Severity</label>
                            <span class="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getThreatSeverityClasses(threat.severity)}">
                                ${threat.severity}
                            </span>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Description</label>
                        <p class="mt-1 text-sm text-gray-900">${threat.description || 'No description available'}</p>
                    </div>
                    
                    <!-- More detailed information would be displayed here -->
                </div>
                
                <div class="mt-8 flex justify-end space-x-3">
                    <button onclick="window.ThreatsPage.closeThreatDetails()" 
                            class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400">
                        Close
                    </button>
                    <button onclick="window.ThreatsPage.updateThreatStatus('${threat.id}', 'resolved')" 
                            class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                        Mark Resolved
                    </button>
                </div>
            </div>
        `;
    }
    
    // ======================
    // Utility Methods
    // ======================
    
    getThreatColor(severity) {
        const colors = {
            'Critical': 'bg-red-500',
            'High': 'bg-orange-500',
            'Medium': 'bg-yellow-500',
            'Low': 'bg-blue-500'
        };
        return colors[severity] || 'bg-gray-500';
    }
    
    getThreatSeverityClasses(severity) {
        const classes = {
            'Critical': 'bg-red-100 text-red-800',
            'High': 'bg-orange-100 text-orange-800',
            'Medium': 'bg-yellow-100 text-yellow-800',
            'Low': 'bg-blue-100 text-blue-800'
        };
        return classes[severity] || 'bg-gray-100 text-gray-800';
    }
    
    getThreatStatusClasses(status) {
        const classes = {
            'active': 'bg-red-100 text-red-800',
            'investigating': 'bg-yellow-100 text-yellow-800',
            'resolved': 'bg-green-100 text-green-800',
            'dismissed': 'bg-gray-100 text-gray-800'
        };
        return classes[status] || 'bg-gray-100 text-gray-800';
    }
    
    // ======================
    // Cleanup
    // ======================
    
    destroy() {
        this.selectedThreats.clear();
    }
}

// Initialize global threats page instance
window.ThreatsPage = new ThreatsPage();
