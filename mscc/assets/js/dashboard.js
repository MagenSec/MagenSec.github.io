/**
 * MagenSec Command Center - Dashboard Module
 * Handles dashboard UI, data visualization, and user interactions
 */

class DashboardManager {
    constructor() {
        this.authManager = null;
        this.apiManager = null;
        this.charts = new Map();
        this.refreshInterval = null;
        this.refreshRate = 30000; // 30 seconds
        this.isVisible = true;
        
        this.init();
    }

    /**
     * Initialize dashboard
     */
    async init() {
        try {
            // Wait for dependencies
            await this.waitForDependencies();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Initialize charts library
            await this.initChartsLibrary();
            
            // Set up auth state listener
            this.authManager.setAuthStateChangeCallback(this.onAuthStateChange.bind(this));
            
            console.log('Dashboard manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
        }
    }

    /**
     * Wait for required dependencies
     */
    async waitForDependencies() {
        return new Promise((resolve) => {
            const checkDependencies = () => {
                if (window.authManager && window.apiManager) {
                    this.authManager = window.authManager;
                    this.apiManager = window.apiManager;
                    resolve();
                } else {
                    setTimeout(checkDependencies, 100);
                }
            };
            checkDependencies();
        });
    }

    /**
     * Initialize Chart.js library
     */
    async initChartsLibrary() {
        return new Promise((resolve, reject) => {
            if (window.Chart) {
                this.setupChartDefaults();
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
            script.onload = () => {
                this.setupChartDefaults();
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });
    }

    /**
     * Setup Chart.js default configuration
     */
    setupChartDefaults() {
        Chart.defaults.font.family = "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif";
        Chart.defaults.color = '#64748b';
        Chart.defaults.plugins.legend.position = 'bottom';
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = false;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Page visibility for performance optimization
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            if (this.isVisible) {
                this.refreshDashboard();
            }
        });

        // User menu toggle
        const userToggle = document.getElementById('user-menu-toggle');
        const userDropdown = document.getElementById('user-dropdown');
        if (userToggle && userDropdown) {
            userToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('hidden');
            });

            document.addEventListener('click', () => {
                userDropdown.classList.add('hidden');
            });
        }

        // Sign out button
        const signOutBtn = document.getElementById('sign-out-btn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', () => this.authManager.signOut());
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshDashboard());
        }

        // Navigation links
        const navLinks = document.querySelectorAll('.dashboard-nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                if (view) {
                    this.switchView(view);
                }
            });
        });
    }

    /**
     * Handle authentication state changes
     */
    async onAuthStateChange(user, organizations) {
        if (user) {
            await this.loadDashboard();
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
            this.clearDashboard();
        }
    }

    /**
     * Load dashboard data
     */
    async loadDashboard() {
        try {
            this.showLoading(true);
            
            const userType = this.getUserType();
            
            switch (userType) {
                case 'site-admin':
                    await this.loadAdminDashboard();
                    break;
                case 'business-admin':
                    await this.loadBusinessDashboard();
                    break;
                default:
                    await this.loadIndividualDashboard();
                    break;
            }
            
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Load admin dashboard (CISO view)
     */
    async loadAdminDashboard() {
        const requests = [
            { endpoint: '/analytics/security/overview', key: 'securityOverview' },
            { endpoint: '/analytics/vulnerabilities', key: 'vulnerabilities' },
            { endpoint: '/analytics/compliance', key: 'compliance' },
            { endpoint: '/analytics/incidents', key: 'incidents' },
            { endpoint: '/admin/users', key: 'users' },
            { endpoint: '/analytics/api-usage', key: 'apiUsage' }
        ];

        const results = await this.apiManager.batch(requests);
        const data = this.processBatchResults(results);

        // Render admin widgets
        this.renderSecurityOverview(data.securityOverview);
        this.renderVulnerabilityChart(data.vulnerabilities);
        this.renderComplianceStatus(data.compliance);
        this.renderIncidentTrends(data.incidents);
        this.renderUserManagement(data.users);
        this.renderApiUsageChart(data.apiUsage);
    }

    /**
     * Load business dashboard (Startup owner view)
     */
    async loadBusinessDashboard() {
        const requests = [
            { endpoint: '/analytics/security/overview', key: 'securityOverview' },
            { endpoint: '/devices', key: 'devices' },
            { endpoint: '/analytics/vulnerabilities', key: 'vulnerabilities' },
            { endpoint: '/analytics/compliance', key: 'compliance' },
            { endpoint: '/license', key: 'license' }
        ];

        const results = await this.apiManager.batch(requests);
        const data = this.processBatchResults(results);

        // Render business widgets
        this.renderSecurityOverview(data.securityOverview);
        this.renderDeviceStatus(data.devices);
        this.renderVulnerabilityChart(data.vulnerabilities);
        this.renderComplianceStatus(data.compliance);
        this.renderLicenseInfo(data.license);
        this.renderCostOptimization(data);
    }

    /**
     * Load individual dashboard (Housewife view)
     */
    async loadIndividualDashboard() {
        const requests = [
            { endpoint: '/devices', key: 'devices' },
            { endpoint: '/analytics/defender', key: 'defender' },
            { endpoint: '/analytics/vulnerabilities?severity=high,critical', key: 'criticalVulns' },
            { endpoint: '/analytics/config-drift', key: 'configDrift' }
        ];

        const results = await this.apiManager.batch(requests);
        const data = this.processBatchResults(results);

        // Render individual widgets
        this.renderDeviceHealth(data.devices);
        this.renderDefenderStatus(data.defender);
        this.renderCriticalAlerts(data.criticalVulns);
        this.renderSimplifiedSecurity(data);
    }

    /**
     * Process batch API results
     */
    processBatchResults(results) {
        const data = {};
        results.forEach(result => {
            if (result.success) {
                data[result.request.key] = result.data;
            } else {
                console.error(`Failed to fetch ${result.request.key}:`, result.error);
                data[result.request.key] = null;
            }
        });
        return data;
    }

    /**
     * Get current user type
     */
    getUserType() {
        const org = this.authManager.getCurrentOrganization();
        if (!org) return 'individual';
        
        switch (org.type) {
            case 'site-admin':
                return 'site-admin';
            case 'business':
                return 'business-admin';
            default:
                return 'individual';
        }
    }

    // === Widget Rendering Methods ===

    /**
     * Render security overview widget
     */
    renderSecurityOverview(data) {
        if (!data) return;

        const container = document.getElementById('security-overview');
        if (!container) return;

        const metrics = [
            { label: 'Secure Devices', value: data.secureDevices || 0, type: 'success' },
            { label: 'Vulnerable Devices', value: data.vulnerableDevices || 0, type: 'warning' },
            { label: 'Critical Issues', value: data.criticalIssues || 0, type: 'danger' },
            { label: 'Compliance Score', value: `${data.complianceScore || 0}%`, type: 'info' }
        ];

        container.innerHTML = metrics.map(metric => `
            <div class="metric-widget">
                <span class="metric-value ${metric.type}">${metric.value}</span>
                <span class="metric-label">${metric.label}</span>
            </div>
        `).join('');
    }

    /**
     * Render vulnerability chart
     */
    renderVulnerabilityChart(data) {
        if (!data) return;

        const canvas = document.getElementById('vulnerability-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart
        if (this.charts.has('vulnerabilities')) {
            this.charts.get('vulnerabilities').destroy();
        }

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Critical', 'High', 'Medium', 'Low'],
                datasets: [{
                    data: [
                        data.critical || 0,
                        data.high || 0,
                        data.medium || 0,
                        data.low || 0
                    ],
                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e']
                }]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        this.charts.set('vulnerabilities', chart);
    }

    /**
     * Render compliance status widget
     */
    renderComplianceStatus(data) {
        if (!data) return;

        const container = document.getElementById('compliance-status');
        if (!container) return;

        const frameworks = data.frameworks || [];
        
        container.innerHTML = frameworks.map(framework => `
            <div class="progress-item">
                <div class="progress-label">${framework.name}</div>
                <div class="progress-value">${framework.score}%</div>
                <div class="progress-bar">
                    <div class="progress-bar-fill ${this.getComplianceColor(framework.score)}" 
                         style="width: ${framework.score}%"></div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render device status widget
     */
    renderDeviceStatus(data) {
        if (!data) return;

        const container = document.getElementById('device-status');
        if (!container) return;

        const devices = data.devices || [];
        const online = devices.filter(d => d.status === 'online').length;
        const offline = devices.filter(d => d.status === 'offline').length;
        const vulnerable = devices.filter(d => d.vulnerabilityCount > 0).length;

        container.innerHTML = `
            <div class="grid grid-cols-3">
                <div class="metric-widget">
                    <span class="metric-value success">${online}</span>
                    <span class="metric-label">Online</span>
                </div>
                <div class="metric-widget">
                    <span class="metric-value warning">${offline}</span>
                    <span class="metric-label">Offline</span>
                </div>
                <div class="metric-widget">
                    <span class="metric-value danger">${vulnerable}</span>
                    <span class="metric-label">At Risk</span>
                </div>
            </div>
        `;
    }

    /**
     * Render device health for individual users
     */
    renderDeviceHealth(data) {
        if (!data) return;

        const container = document.getElementById('device-health');
        if (!container) return;

        const devices = data.devices || [];
        
        container.innerHTML = devices.map(device => `
            <div class="card">
                <div class="card-content">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="font-semibold">${device.name}</h3>
                            <p class="text-sm text-gray-600">${device.type}</p>
                        </div>
                        <span class="status-dot ${this.getDeviceStatusColor(device.status)}"></span>
                    </div>
                    <div class="mt-4">
                        <div class="text-sm">
                            <span class="text-gray-600">Last Seen:</span>
                            ${this.formatRelativeTime(device.lastSeen)}
                        </div>
                        ${device.vulnerabilityCount > 0 ? `
                            <div class="text-sm text-red-600 mt-1">
                                ${device.vulnerabilityCount} security issues found
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render Windows Defender status
     */
    renderDefenderStatus(data) {
        if (!data) return;

        const container = document.getElementById('defender-status');
        if (!container) return;

        const status = data.overallStatus || 'unknown';
        const lastScan = data.lastScan || 'Never';
        const threats = data.threatsFound || 0;

        container.innerHTML = `
            <div class="alert-widget ${this.getDefenderAlertType(status)}">
                <div class="alert-icon">🛡️</div>
                <div class="alert-title">Windows Defender</div>
                <div class="alert-message">
                    Status: ${status.charAt(0).toUpperCase() + status.slice(1)}<br>
                    Last Scan: ${this.formatRelativeTime(lastScan)}<br>
                    ${threats > 0 ? `⚠️ ${threats} threats detected` : '✅ No threats detected'}
                </div>
            </div>
        `;
    }

    // === Utility Methods ===

    /**
     * Get compliance color based on score
     */
    getComplianceColor(score) {
        if (score >= 90) return 'success';
        if (score >= 70) return 'warning';
        return 'danger';
    }

    /**
     * Get device status color
     */
    getDeviceStatusColor(status) {
        switch (status) {
            case 'online': return 'green';
            case 'offline': return 'red';
            case 'warning': return 'yellow';
            default: return 'gray';
        }
    }

    /**
     * Get defender alert type
     */
    getDefenderAlertType(status) {
        switch (status) {
            case 'healthy': return 'success';
            case 'warning': return 'warning';
            case 'critical': return 'danger';
            default: return 'info';
        }
    }

    /**
     * Format relative time
     */
    formatRelativeTime(timestamp) {
        if (!timestamp || timestamp === 'Never') return 'Never';
        
        const now = new Date();
        const time = new Date(timestamp);
        const diff = now - time;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'Just now';
    }

    /**
     * Switch dashboard view
     */
    switchView(viewName) {
        // Update navigation
        document.querySelectorAll('.dashboard-nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');

        // Show/hide view sections
        document.querySelectorAll('[data-view-section]').forEach(section => {
            section.classList.add('hidden');
        });
        document.querySelector(`[data-view-section="${viewName}"]`)?.classList.remove('hidden');

        // Load view-specific data
        this.loadViewData(viewName);
    }

    /**
     * Load data for specific view
     */
    async loadViewData(viewName) {
        try {
            switch (viewName) {
                case 'devices':
                    await this.loadDevicesView();
                    break;
                case 'security':
                    await this.loadSecurityView();
                    break;
                case 'reports':
                    await this.loadReportsView();
                    break;
                case 'settings':
                    await this.loadSettingsView();
                    break;
            }
        } catch (error) {
            console.error(`Failed to load ${viewName} view:`, error);
        }
    }

    /**
     * Start auto-refresh
     */
    startAutoRefresh() {
        this.stopAutoRefresh(); // Clear any existing interval
        this.refreshInterval = setInterval(() => {
            if (this.isVisible) {
                this.refreshDashboard();
            }
        }, this.refreshRate);
    }

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Refresh dashboard data
     */
    async refreshDashboard() {
        try {
            await this.loadDashboard();
            this.showRefreshSuccess();
        } catch (error) {
            console.error('Dashboard refresh failed:', error);
        }
    }

    /**
     * Clear dashboard
     */
    clearDashboard() {
        // Destroy all charts
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();

        // Clear widget containers
        const containers = [
            'security-overview', 'device-status', 'compliance-status',
            'defender-status', 'device-health'
        ];
        containers.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.innerHTML = '';
        });
    }

    /**
     * Show loading state
     */
    showLoading(show) {
        const loadingElement = document.getElementById('dashboard-loading');
        if (loadingElement) {
            loadingElement.classList.toggle('hidden', !show);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        // TODO: Implement error display
        console.error(message);
    }

    /**
     * Show refresh success
     */
    showRefreshSuccess() {
        // TODO: Implement success indicator
        console.log('Dashboard refreshed successfully');
    }
}

// Create global dashboard manager instance
window.dashboardManager = new DashboardManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardManager;
}
