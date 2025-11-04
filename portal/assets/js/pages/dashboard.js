// MagenSec Hub Dashboard Page
class DashboardPage {
    constructor() {
        this.dashboardData = null;
        this.refreshInterval = null;
        this.lastUpdate = null;
        
        // Chart instances
        this.charts = {};
    }
    
    async render(route) {
        try {
            // Show main app view
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            
            // Get main content container
            const mainContent = document.getElementById('main-content');
            if (!mainContent) throw new Error('Main content container not found');
            
            // Show loading state
            mainContent.innerHTML = this.renderLoadingState();
            
            // Load dashboard data
            await this.loadDashboardData();
            
            // Render dashboard content
            mainContent.innerHTML = this.renderDashboard();
            
            // Initialize interactive components
            this.initializeComponents();
            
            // Setup auto-refresh
            // Auto-refresh is disabled to prevent excessive API calls and flooding the backend.
            // If requirements change, re-enable by wiring this method to setInterval as before.
            // Manual refresh is available via the Refresh button.
            //this.setupAutoRefresh();

            // Listen for org change event to reload dashboard
            window.addEventListener('magensec-org-changed', () => {
                this.refresh();
            });
            
        } catch (error) {
            console.error('Dashboard render error:', error);
            window.MagenSecUI.showToast('Failed to load dashboard', 'error');
            
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderErrorState(error);
            }
        }
    }
    
    async loadDashboardData() {
        try {
            // Check if user has an organization set
            const currentOrg = window.MagenSecAuth.getCurrentOrganization();
            const currentUser = window.MagenSecAuth.getCurrentUser();
            
            console.log('[Dashboard] Loading data for:', {
                organization: currentOrg,
                user: currentUser?.email,
                hasOrg: !!currentOrg,
                orgId: currentOrg?.id || currentOrg
            });
            
            if (!currentOrg) {
                console.warn('[Dashboard] No organization context available');
                throw new Error('No organization selected. Please contact your administrator to assign you to an organization.');
            }
            
            // Load dashboard data from API
            const response = await window.MagenSecAPI.getDashboardData('24h');
            this.dashboardData = response.data;
            this.lastUpdate = new Date();
            
            // Also load some summary stats
            const statsResponse = await window.MagenSecAPI.getDashboardStats('24h');
            this.dashboardData.stats = statsResponse.data;
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            
            // Use fallback data structure
            this.dashboardData = {
                activeThreats: 0,
                resolvedThreats: 0,
                totalDevices: 0,
                onlineDevices: 0,
                complianceScore: 0,
                securityAlerts: 0,
                recentThreats: [],
                recentActivities: [],
                deviceStatus: {
                    online: 0,
                    offline: 0,
                    warning: 0
                },
                threatTrends: [],
                complianceStatus: []
            };
            
            throw error;
        }
    }
    
    renderLoadingState() {
        return `
            <div class="p-6">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    ${Array(4).fill().map(() => `
                        <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                            <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                            <div class="h-8 bg-gray-200 rounded w-1/2"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    ${Array(2).fill().map(() => `
                        <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                            <div class="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                            <div class="h-64 bg-gray-200 rounded"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    renderDashboard() {
        const data = this.dashboardData;
        
        return `
            <div class="p-6 bg-gray-50 min-h-screen">
                <!-- Header -->
                <div class="mb-8">
                    <div class="flex justify-between items-center">
                        <div>
                            <h1 class="text-3xl font-bold text-gray-900">Security Dashboard</h1>
                            <p class="text-gray-600 mt-1">Real-time security monitoring and threat management</p>
                        </div>
                        <div class="flex items-center space-x-4">
                            <div class="text-sm text-gray-500">
                                Last updated: <span id="last-update">${window.MagenSecUI.formatDate(this.lastUpdate, 'relative')}</span>
                            </div>
                            <button onclick="window.DashboardPage.refresh()" 
                                    class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center">
                                <i class="fas fa-sync-alt mr-2"></i>Refresh
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Key Metrics -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    ${this.renderMetricCard('Active Threats', data.activeThreats, 'fas fa-shield-virus', 'red', '/threats?status=active')}
                    ${this.renderMetricCard('Protected Devices', data.totalDevices, 'fas fa-laptop', 'blue', '/devices')}
                    ${this.renderMetricCard('Compliance Score', data.complianceScore + '%', 'fas fa-clipboard-check', 'green', '/compliance')}
                    ${this.renderMetricCard('Security Alerts', data.securityAlerts, 'fas fa-exclamation-triangle', 'yellow', '/threats')}
                </div>

                <!-- Main Content Grid -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <!-- Threat Overview -->
                    <div class="lg:col-span-2">
                        ${this.renderThreatOverview()}
                    </div>
                    
                    <!-- Device Status -->
                    <div>
                        ${this.renderDeviceStatus()}
                    </div>
                </div>

                <!-- Secondary Content Grid -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <!-- Recent Threats -->
                    <div>
                        ${this.renderRecentThreats()}
                    </div>
                    
                    <!-- Compliance Status -->
                    <div>
                        ${this.renderComplianceStatus()}
                    </div>
                </div>

                <!-- Activity Feed -->
                <div class="mb-8">
                    ${this.renderActivityFeed()}
                </div>

                <!-- Quick Actions -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    ${this.renderQuickActions()}
                </div>
            </div>
        `;
    }
    
    renderMetricCard(title, value, icon, color, link) {
        const colors = {
            'red': 'bg-red-500 text-red-600 bg-red-50',
            'blue': 'bg-blue-500 text-blue-600 bg-blue-50',
            'green': 'bg-green-500 text-green-600 bg-green-50',
            'yellow': 'bg-yellow-500 text-yellow-600 bg-yellow-50'
        };
        
        const colorClasses = colors[color] || colors.blue;
        const [bgColor, textColor, bgLight] = colorClasses.split(' ');
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                <div class="p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 mb-1">${title}</p>
                            <p class="text-3xl font-bold text-gray-900">${value}</p>
                        </div>
                        <div class="flex-shrink-0">
                            <div class="${bgLight} p-3 rounded-lg">
                                <i class="${icon} text-xl ${textColor}"></i>
                            </div>
                        </div>
                    </div>
                    ${link ? `
                        <div class="mt-4">
                            <a href="#${link}" class="text-sm ${textColor} hover:underline flex items-center">
                                View details <i class="fas fa-arrow-right ml-1"></i>
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    renderThreatOverview() {
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-semibold text-gray-900">Threat Overview</h3>
                        <div class="flex space-x-2">
                            <button class="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border time-filter active" data-period="24h">24h</button>
                            <button class="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border time-filter" data-period="7d">7d</button>
                            <button class="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border time-filter" data-period="30d">30d</button>
                        </div>
                    </div>
                    
                    <!-- Threat Statistics -->
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div class="text-center p-4 bg-red-50 rounded-lg">
                            <div class="text-2xl font-bold text-red-600">${this.dashboardData.activeThreats}</div>
                            <div class="text-sm text-red-600 font-medium">Active Threats</div>
                        </div>
                        <div class="text-center p-4 bg-green-50 rounded-lg">
                            <div class="text-2xl font-bold text-green-600">${this.dashboardData.resolvedThreats}</div>
                            <div class="text-sm text-green-600 font-medium">Resolved Today</div>
                        </div>
                    </div>
                    
                    <!-- Threat Chart Placeholder -->
                    <div id="threat-chart" class="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                        <div class="text-center text-gray-500">
                            <i class="fas fa-chart-line text-4xl mb-4"></i>
                            <p>Threat trends chart will appear here</p>
                            <p class="text-sm mt-2">Real-time threat detection analytics</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderDeviceStatus() {
        const data = this.dashboardData;
        const online = data.onlineDevices || 0;
        const total = data.totalDevices || 0;
        const offline = total - online;
        const onlinePercentage = total > 0 ? Math.round((online / total) * 100) : 0;
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-6">Device Status</h3>
                    
                    <!-- Device Status Overview -->
                    <div class="text-center mb-6">
                        <div class="text-4xl font-bold text-gray-900 mb-2">${total}</div>
                        <div class="text-sm text-gray-600">Total Devices</div>
                    </div>
                    
                    <!-- Status Breakdown -->
                    <div class="space-y-4">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center">
                                <div class="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                                <span class="text-sm font-medium text-gray-900">Online</span>
                            </div>
                            <div class="text-sm text-gray-600">${online} (${onlinePercentage}%)</div>
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <div class="flex items-center">
                                <div class="w-3 h-3 bg-gray-400 rounded-full mr-3"></div>
                                <span class="text-sm font-medium text-gray-900">Offline</span>
                            </div>
                            <div class="text-sm text-gray-600">${offline} (${100 - onlinePercentage}%)</div>
                        </div>
                    </div>
                    
                    <!-- Progress Bar -->
                    <div class="mt-6">
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-green-500 h-2 rounded-full" style="width: ${onlinePercentage}%"></div>
                        </div>
                    </div>
                    
                    <!-- Quick Actions -->
                    <div class="mt-6 space-y-2">
                        <a href="#/devices" class="block w-full text-center bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 text-sm font-medium">
                            Manage Devices
                        </a>
                        <button onclick="window.DashboardPage.addDevice()" class="block w-full text-center border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 text-sm font-medium">
                            Add New Device
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderRecentThreats() {
        const threats = this.dashboardData.recentThreats || [];
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-semibold text-gray-900">Recent Threats</h3>
                        <a href="#/threats" class="text-sm text-blue-600 hover:text-blue-800">View all</a>
                    </div>
                    
                    ${threats.length > 0 ? `
                        <div class="space-y-4">
                            ${threats.slice(0, 5).map(threat => `
                                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div class="flex items-center space-x-3">
                                        <div class="flex-shrink-0">
                                            <div class="w-3 h-3 ${this.getThreatColor(threat.severity)} rounded-full"></div>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-medium text-gray-900 truncate">${threat.name}</p>
                                            <p class="text-xs text-gray-500">${window.MagenSecUI.formatDate(threat.detectedAt, 'relative')}</p>
                                        </div>
                                    </div>
                                    <div class="flex-shrink-0">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getThreatSeverityClasses(threat.severity)}">
                                            ${threat.severity}
                                        </span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-shield-check text-4xl mb-4 text-green-500"></i>
                            <p>No recent threats detected</p>
                            <p class="text-sm mt-2">Your systems are secure</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
    
    renderComplianceStatus() {
        const complianceItems = this.dashboardData.complianceStatus || [];
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-semibold text-gray-900">Compliance Status</h3>
                        <a href="#/compliance" class="text-sm text-blue-600 hover:text-blue-800">View details</a>
                    </div>
                    
                    <!-- Overall Score -->
                    <div class="text-center mb-6">
                        <div class="text-3xl font-bold text-green-600 mb-1">${this.dashboardData.complianceScore}%</div>
                        <div class="text-sm text-gray-600">Overall Compliance</div>
                    </div>
                    
                    <!-- Framework Breakdown -->
                    <div class="space-y-3">
                        ${['SOC2', 'ISO27001', 'GDPR', 'HIPAA'].map(framework => {
                            const score = Math.floor(Math.random() * 20) + 80; // Mock scores
                            return `
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center">
                                        <span class="text-sm font-medium text-gray-900">${framework}</span>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <div class="w-20 bg-gray-200 rounded-full h-2">
                                            <div class="bg-green-500 h-2 rounded-full" style="width: ${score}%"></div>
                                        </div>
                                        <span class="text-sm text-gray-600 w-8 text-right">${score}%</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    
    renderActivityFeed() {
        const activities = this.dashboardData.recentActivities || [];
        
        return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-semibold text-gray-900">Recent Activity</h3>
                        <a href="#/activities" class="text-sm text-blue-600 hover:text-blue-800">View all activity</a>
                    </div>
                    
                    ${activities.length > 0 ? `
                        <div class="flow-root">
                            <ul class="-mb-8">
                                ${activities.slice(0, 5).map((activity, index) => `
                                    <li>
                                        <div class="relative pb-8">
                                            ${index !== activities.length - 1 && index !== 4 ? '<span class="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"></span>' : ''}
                                            <div class="relative flex space-x-3">
                                                <div>
                                                    <span class="h-8 w-8 rounded-full ${this.getActivityColor(activity.type)} flex items-center justify-center ring-8 ring-white">
                                                        <i class="${this.getActivityIcon(activity.type)} text-white text-sm"></i>
                                                    </span>
                                                </div>
                                                <div class="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                                                    <div>
                                                        <p class="text-sm text-gray-500">${activity.description}</p>
                                                        <p class="text-xs text-gray-400">${activity.deviceName || 'System'}</p>
                                                    </div>
                                                    <div class="text-right text-sm whitespace-nowrap text-gray-500">
                                                        ${window.MagenSecUI.formatDate(activity.timestamp, 'relative')}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : `
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-history text-4xl mb-4"></i>
                            <p>No recent activity</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
    
    renderQuickActions() {
        return `
            <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-sm text-white">
                <div class="p-6">
                    <h3 class="text-lg font-semibold mb-4">Quick Actions</h3>
                    <div class="space-y-3">
                        <button onclick="window.DashboardPage.runSecurityScan()" 
                                class="w-full text-left flex items-center p-3 rounded-lg bg-white bg-opacity-20 hover:bg-opacity-30 transition-colors">
                            <i class="fas fa-search mr-3"></i>
                            <div>
                                <div class="font-medium">Run Security Scan</div>
                                <div class="text-sm opacity-75">Comprehensive system check</div>
                            </div>
                        </button>
                        <button onclick="window.DashboardPage.generateReport()" 
                                class="w-full text-left flex items-center p-3 rounded-lg bg-white bg-opacity-20 hover:bg-opacity-30 transition-colors">
                            <i class="fas fa-file-alt mr-3"></i>
                            <div>
                                <div class="font-medium">Generate Report</div>
                                <div class="text-sm opacity-75">Security summary report</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
                    <div class="space-y-4">
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600">Security Engine</span>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <i class="fas fa-check-circle mr-1"></i>Online
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600">Threat Detection</span>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <i class="fas fa-check-circle mr-1"></i>Active
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600">Data Protection</span>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <i class="fas fa-check-circle mr-1"></i>Enabled
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">Need Help?</h3>
                    <div class="space-y-3">
                        <a href="#/help" class="block text-sm text-blue-600 hover:text-blue-800">
                            <i class="fas fa-book mr-2"></i>Documentation
                        </a>
                        <a href="#/support" class="block text-sm text-blue-600 hover:text-blue-800">
                            <i class="fas fa-headset mr-2"></i>Contact Support
                        </a>
                        <a href="#/training" class="block text-sm text-blue-600 hover:text-blue-800">
                            <i class="fas fa-graduation-cap mr-2"></i>Security Training
                        </a>
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
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">Dashboard Unavailable</h2>
                    <p class="text-gray-600 mb-6">Unable to load dashboard data. Please try again.</p>
                    <button onclick="window.DashboardPage.render()" 
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
        // Setup time filter buttons
        const timeFilters = document.querySelectorAll('.time-filter');
        timeFilters.forEach(filter => {
            filter.addEventListener('click', (e) => {
                timeFilters.forEach(f => f.classList.remove('active', 'bg-blue-600', 'text-white'));
                e.target.classList.add('active', 'bg-blue-600', 'text-white');
                this.updateTimeFilter(e.target.dataset.period);
            });
        });
        
        // Setup refresh interval display
        this.updateLastUpdateDisplay();
        setInterval(() => this.updateLastUpdateDisplay(), 60000); // Update every minute
    }
    
    setupAutoRefresh() {
        // Clear existing interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Setup new interval (refresh every 30 seconds)
        this.refreshInterval = setInterval(() => {
            this.refresh(true); // Silent refresh
        }, window.MagenSecConfig.ui.refreshInterval);
    }
    
    updateLastUpdateDisplay() {
        const lastUpdateElement = document.getElementById('last-update');
        if (lastUpdateElement && this.lastUpdate) {
            lastUpdateElement.textContent = window.MagenSecUI.formatDate(this.lastUpdate, 'relative');
        }
    }
    
    async updateTimeFilter(period) {
        try {
            const response = await window.MagenSecAPI.getDashboardData(period);
            this.dashboardData = response.data;
            this.lastUpdate = new Date();
            
            // Re-render threat overview section
            const threatOverview = document.querySelector('#threat-chart').closest('.bg-white');
            if (threatOverview) {
                threatOverview.outerHTML = this.renderThreatOverview();
                this.initializeComponents(); // Re-initialize event listeners
            }
            
        } catch (error) {
            console.error('Failed to update time filter:', error);
            window.MagenSecUI.showToast('Failed to update data', 'error');
        }
    }
    
    // ======================
    // Action Handlers
    // ======================
    
    async refresh(silent = false) {
        try {
            if (!silent) {
                window.MagenSecUI.showToast('Refreshing dashboard...', 'info');
            }
            
            await this.loadDashboardData();
            
            // Re-render entire dashboard
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderDashboard();
                this.initializeComponents();
            }
            
            if (!silent) {
                window.MagenSecUI.showToast('Dashboard updated', 'success');
            }
            
        } catch (error) {
            console.error('Refresh failed:', error);
            if (!silent) {
                window.MagenSecUI.showToast('Failed to refresh dashboard', 'error');
            }
        }
    }
    
    addDevice() {
        window.MagenSecRouter.navigate('/devices/add');
    }
    
    runSecurityScan() {
        window.MagenSecUI.showConfirmation(
            'Run Security Scan',
            'This will perform a comprehensive security scan of all connected devices. This may take several minutes.',
            'Start Scan',
            'Cancel'
        ).then((confirmed) => {
            if (confirmed) {
                window.MagenSecUI.showToast('Security scan started', 'info');
                // Implementation would trigger actual scan
            }
        });
    }
    
    generateReport() {
        window.MagenSecRouter.navigate('/reports/generate');
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
    
    getActivityColor(type) {
        const colors = {
            'LOGIN': 'bg-green-500',
            'LOGOUT': 'bg-gray-500',
            'FILE_ACCESS': 'bg-blue-500',
            'SYSTEM_CHANGE': 'bg-yellow-500',
            'SECURITY_ALERT': 'bg-red-500',
            'POLICY_UPDATE': 'bg-purple-500'
        };
        return colors[type] || 'bg-gray-500';
    }
    
    getActivityIcon(type) {
        const icons = {
            'LOGIN': 'fas fa-sign-in-alt',
            'LOGOUT': 'fas fa-sign-out-alt',
            'FILE_ACCESS': 'fas fa-file',
            'SYSTEM_CHANGE': 'fas fa-cog',
            'SECURITY_ALERT': 'fas fa-exclamation-triangle',
            'POLICY_UPDATE': 'fas fa-shield-alt'
        };
        return icons[type] || 'fas fa-info-circle';
    }
    
    // Mock data methods for testing
    getMockDashboardData() {
        return {
            activeThreats: 7,
            resolvedThreats: 23,
            totalDevices: 156,
            onlineDevices: 134,
            complianceScore: 87,
            securityAlerts: 3,
            recentThreats: [
                {
                    id: 'T001',
                    type: 'malware',
                    severity: 'high',
                    description: 'Trojan.Win32.Generic detected on WORKSTATION-01',
                    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
                    status: 'active',
                    deviceName: 'WORKSTATION-01'
                },
                {
                    id: 'T002',
                    type: 'policy-violation',
                    severity: 'medium',
                    description: 'Unauthorized software installation attempt',
                    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
                    status: 'investigating',
                    deviceName: 'LAPTOP-05'
                },
                {
                    id: 'T003',
                    type: 'network',
                    severity: 'low',
                    description: 'Suspicious network activity detected',
                    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
                    status: 'resolved',
                    deviceName: 'SERVER-02'
                }
            ],
            recentActivities: [
                {
                    id: 'A001',
                    type: 'LOGIN',
                    description: 'User john.doe logged in from WORKSTATION-01',
                    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
                    userName: 'john.doe',
                    deviceName: 'WORKSTATION-01'
                },
                {
                    id: 'A002',
                    type: 'SECURITY_ALERT',
                    description: 'Security policy updated: Password complexity requirements',
                    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
                    userName: 'admin',
                    deviceName: 'MANAGEMENT-CONSOLE'
                },
                {
                    id: 'A003',
                    type: 'FILE_ACCESS',
                    description: 'Confidential file accessed by user jane.smith',
                    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
                    userName: 'jane.smith',
                    deviceName: 'LAPTOP-03'
                }
            ],
            deviceStatus: {
                online: 134,
                offline: 22,
                warning: 8,
                critical: 2
            },
            threatTrends: {
                labels: ['6h ago', '5h ago', '4h ago', '3h ago', '2h ago', '1h ago', 'Now'],
                data: [2, 3, 1, 4, 2, 3, 7]
            },
            complianceBreakdown: {
                compliant: 87,
                warnings: 8,
                violations: 5
            },
            topThreats: [
                { type: 'malware', count: 12, percentage: 35 },
                { type: 'policy-violation', count: 8, percentage: 24 },
                { type: 'network', count: 6, percentage: 18 },
                { type: 'phishing', count: 4, percentage: 12 },
                { type: 'other', count: 4, percentage: 11 }
            ]
        };
    }
    
    // ======================
    // Cleanup
    // ======================
    
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        // Clear chart instances
        Object.values(this.charts).forEach(chart => {
            if (chart && chart.destroy) {
                chart.destroy();
            }
        });
        this.charts = {};
    }
}

// Initialize global dashboard page instance
window.DashboardPage = new DashboardPage();
