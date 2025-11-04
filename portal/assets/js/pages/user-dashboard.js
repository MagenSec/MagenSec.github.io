// MagenSec Hub - User Dashboard Page Controller
class UserDashboardPage {
    constructor() {
        this.userData = {};
        this.devices = [];
        this.threats = [];
        this.currentView = 'overview';
        this.refreshInterval = null;
    }

    async render(route) {
        console.log('User dashboard page rendering...');
        
        // Basic authentication check
        if (!window.MagenSecAuth.isAuthenticated()) {
            window.MagenSecRouter.navigate('/auth');
            return;
        }

        await this.initialize();
    }

    async initialize() {
        this.setupEventHandlers();
        await this.loadUserData();
        this.renderPage();
        this.startAutoRefresh();
    }

    setupEventHandlers() {
        // View switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('user-view-btn')) {
                this.switchView(e.target.dataset.view);
            }
        });

        // Device actions (limited for users)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('device-info-btn')) {
                this.showDeviceDetails(e.target.dataset.deviceId);
            }
            if (e.target.classList.contains('refresh-device-btn')) {
                this.refreshDevice(e.target.dataset.deviceId);
            }
        });

        // Threat actions
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('threat-details-btn')) {
                this.showThreatDetails(e.target.dataset.threatId);
            }
            if (e.target.classList.contains('acknowledge-threat-btn')) {
                this.acknowledgeThreat(e.target.dataset.threatId);
            }
        });

        // Quick actions
        document.addEventListener('click', (e) => {
            if (e.target.id === 'scan-all-btn') {
                this.scanAllDevices();
            }
            if (e.target.id === 'refresh-data-btn') {
                this.refreshData();
            }
            if (e.target.id === 'download-report-btn') {
                this.downloadUserReport();
            }
        });

        // Cleanup interval on page unload
        window.addEventListener('beforeunload', () => {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
        });
    }

    async loadUserData() {
        try {
            window.MagenSecUI.showLoading();

            // Load user-specific data
            const [dashboard, devices, threats, compliance] = await Promise.all([
                window.MagenSecAPI.getDashboardData('24h'),
                window.MagenSecAPI.getDevices({ owned: true }),
                window.MagenSecAPI.get('/portal/api/threats/user'),
                window.MagenSecAPI.get('/portal/api/compliance/user')
            ]);

            this.userData = {
                dashboard: dashboard.data || this.getMockDashboardData(),
                devices: devices.data || this.getMockDevicesData(),
                threats: threats.data || this.getMockThreatsData(),
                compliance: compliance.data || this.getMockComplianceData()
            };

            window.MagenSecUI.hideLoading();
        } catch (error) {
            console.warn('User API not available, using mock data:', error);
            this.userData = {
                dashboard: this.getMockDashboardData(),
                devices: this.getMockDevicesData(),
                threats: this.getMockThreatsData(),
                compliance: this.getMockComplianceData()
            };
            window.MagenSecUI.hideLoading();
        }
    }

    startAutoRefresh() {
        // Refresh data every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.refreshData(false); // Silent refresh
        }, 30000);
    }

    renderPage() {
        const container = document.getElementById('main-content');
        container.innerHTML = this.getPageHTML();
        this.switchView(this.currentView);
    }

    getPageHTML() {
        const user = window.MagenSecAuth.getCurrentUser();
        
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Welcome back, ${user?.name || 'User'}!</h1>
                        <p class="text-gray-600">Your security dashboard and device overview</p>
                    </div>
                    <div class="flex space-x-3">
                        <button id="refresh-data-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-sync mr-2"></i>Refresh
                        </button>
                        <button id="download-report-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                            <i class="fas fa-download mr-2"></i>Report
                        </button>
                    </div>
                </div>

                <!-- Quick Stats -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${this.renderQuickStats()}
                </div>

                <!-- User Navigation -->
                <div class="bg-white rounded-lg shadow">
                    <div class="border-b border-gray-200">
                        <nav class="-mb-px flex space-x-8 px-6">
                            <button class="user-view-btn py-4 px-1 border-b-2 border-blue-500 font-medium text-sm text-blue-600" data-view="overview">
                                Overview
                            </button>
                            <button class="user-view-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-view="devices">
                                My Devices
                            </button>
                            <button class="user-view-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-view="threats">
                                Security Alerts
                            </button>
                            <button class="user-view-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-view="compliance">
                                Compliance
                            </button>
                        </nav>
                    </div>

                    <div class="p-6">
                        <div id="user-overview" class="user-panel">
                            <!-- Overview content -->
                        </div>
                        <div id="user-devices" class="user-panel hidden">
                            <!-- Devices content -->
                        </div>
                        <div id="user-threats" class="user-panel hidden">
                            <!-- Threats content -->
                        </div>
                        <div id="user-compliance" class="user-panel hidden">
                            <!-- Compliance content -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderQuickStats() {
        const dashboard = this.userData.dashboard;
        
        return `
            ${this.renderStatCard('My Devices', dashboard.deviceCount, dashboard.deviceChange, 'fas fa-laptop', 'blue')}
            ${this.renderStatCard('Active Threats', dashboard.threatCount, dashboard.threatChange, 'fas fa-shield-virus', 'red')}
            ${this.renderStatCard('Compliance Score', `${dashboard.complianceScore}%`, dashboard.complianceChange, 'fas fa-clipboard-check', 'green')}
            ${this.renderStatCard('Last Scan', dashboard.lastScanTime, null, 'fas fa-search', 'purple')}
        `;
    }

    renderStatCard(title, value, change, icon, color) {
        return `
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <div class="w-8 h-8 bg-${color}-500 rounded-md flex items-center justify-center">
                            <i class="${icon} text-white text-sm"></i>
                        </div>
                    </div>
                    <div class="ml-5 w-0 flex-1">
                        <dl>
                            <dt class="text-sm font-medium text-gray-500 truncate">${title}</dt>
                            <dd class="flex items-baseline">
                                <div class="text-2xl font-semibold text-gray-900">${value}</div>
                                ${change ? `<div class="ml-2 flex items-baseline text-sm font-semibold ${
                                    change.startsWith('+') ? 'text-green-600' : change.startsWith('-') ? 'text-red-600' : 'text-gray-600'
                                }">
                                    ${change}
                                </div>` : ''}
                            </dd>
                        </dl>
                    </div>
                </div>
            </div>
        `;
    }

    switchView(view) {
        // Update navigation
        document.querySelectorAll('.user-view-btn').forEach(btn => {
            btn.classList.remove('border-blue-500', 'text-blue-600');
            btn.classList.add('border-transparent', 'text-gray-500');
        });
        
        document.querySelector(`[data-view="${view}"]`).classList.remove('border-transparent', 'text-gray-500');
        document.querySelector(`[data-view="${view}"]`).classList.add('border-blue-500', 'text-blue-600');

        // Update content
        document.querySelectorAll('.user-panel').forEach(panel => panel.classList.add('hidden'));
        document.getElementById(`user-${view}`).classList.remove('hidden');

        this.currentView = view;
        this.renderCurrentView();
    }

    renderCurrentView() {
        switch (this.currentView) {
            case 'overview':
                this.renderOverview();
                break;
            case 'devices':
                this.renderDevices();
                break;
            case 'threats':
                this.renderThreats();
                break;
            case 'compliance':
                this.renderCompliance();
                break;
        }
    }

    renderOverview() {
        const container = document.getElementById('user-overview');
        const dashboard = this.userData.dashboard;

        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Recent Activity -->
                <div class="bg-gray-50 rounded-lg p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-medium text-gray-900">Recent Activity</h3>
                        <button id="scan-all-btn" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                            <i class="fas fa-search mr-1"></i>Scan All
                        </button>
                    </div>
                    <div class="space-y-3">
                        ${dashboard.recentActivity.map(activity => `
                            <div class="flex items-center space-x-3">
                                <div class="flex-shrink-0">
                                    <i class="${activity.icon} text-${activity.color}-500"></i>
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm text-gray-900">${activity.description}</p>
                                    <p class="text-xs text-gray-500">${new Date(activity.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Security Status -->
                <div class="bg-gray-50 rounded-lg p-6">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Security Status</h3>
                    <div class="space-y-4">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-medium text-gray-900">Overall Score</span>
                            <div class="flex items-center">
                                <div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
                                    <div class="bg-green-500 h-2 rounded-full" style="width: ${dashboard.securityScore}%"></div>
                                </div>
                                <span class="text-sm font-medium text-gray-900">${dashboard.securityScore}%</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600">Antivirus Status</span>
                                <span class="text-green-600">Protected</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600">Firewall Status</span>
                                <span class="text-green-600">Active</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600">System Updates</span>
                                <span class="text-yellow-600">1 Pending</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="mt-6 bg-blue-50 rounded-lg p-6">
                <h3 class="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button class="flex items-center justify-center p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                        <i class="fas fa-shield-alt text-blue-500 mr-3"></i>
                        <span class="font-medium">Run Security Scan</span>
                    </button>
                    <button class="flex items-center justify-center p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                        <i class="fas fa-download text-green-500 mr-3"></i>
                        <span class="font-medium">Update Definitions</span>
                    </button>
                    <button class="flex items-center justify-center p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                        <i class="fas fa-chart-line text-purple-500 mr-3"></i>
                        <span class="font-medium">View Full Report</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderDevices() {
        const container = document.getElementById('user-devices');
        const devices = this.userData.devices;

        container.innerHTML = `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900">My Devices</h3>
                    <span class="text-sm text-gray-500">${devices.length} devices registered</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${devices.map(device => `
                        <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                            <div class="flex items-center justify-between mb-4">
                                <div class="flex items-center space-x-3">
                                    <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <i class="fas fa-${device.type === 'laptop' ? 'laptop' : 'desktop'} text-gray-600"></i>
                                    </div>
                                    <div>
                                        <h4 class="font-medium text-gray-900">${device.name}</h4>
                                        <p class="text-sm text-gray-500">${device.os}</p>
                                    </div>
                                </div>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    device.status === 'online' ? 'bg-green-100 text-green-800' : 
                                    device.status === 'offline' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                }">
                                    ${device.status}
                                </span>
                            </div>
                            
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Last Seen:</span>
                                    <span class="text-gray-900">${device.lastSeen ? new Date(device.lastSeen).toLocaleDateString() : 'Never'}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Version:</span>
                                    <span class="text-gray-900">${device.version}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Security Score:</span>
                                    <span class="text-gray-900 font-medium">${device.securityScore}/100</span>
                                </div>
                            </div>

                            <div class="mt-4 flex space-x-2">
                                <button class="device-info-btn flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700" data-device-id="${device.id}">
                                    <i class="fas fa-info-circle mr-1"></i>Details
                                </button>
                                <button class="refresh-device-btn flex-1 bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-700" data-device-id="${device.id}">
                                    <i class="fas fa-sync mr-1"></i>Refresh
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderThreats() {
        const container = document.getElementById('user-threats');
        const threats = this.userData.threats;

        container.innerHTML = `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900">Security Alerts</h3>
                    <span class="text-sm text-gray-500">${threats.filter(t => t.status === 'active').length} active alerts</span>
                </div>

                <div class="space-y-4">
                    ${threats.map(threat => `
                        <div class="bg-white border border-gray-200 rounded-lg p-6">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center space-x-3">
                                    <div class="w-8 h-8 ${this.getThreatSeverityColor(threat.severity)} rounded-full flex items-center justify-center">
                                        <i class="fas fa-exclamation-triangle text-white text-xs"></i>
                                    </div>
                                    <div>
                                        <h4 class="font-medium text-gray-900">${threat.title}</h4>
                                        <p class="text-sm text-gray-500">${threat.device} • ${new Date(threat.timestamp).toLocaleString()}</p>
                                    </div>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        threat.severity === 'high' ? 'bg-red-100 text-red-800' :
                                        threat.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                                    }">
                                        ${threat.severity}
                                    </span>
                                    ${threat.status === 'active' ? `
                                        <button class="acknowledge-threat-btn text-blue-600 hover:text-blue-800" data-threat-id="${threat.id}">
                                            <i class="fas fa-check"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            
                            <p class="text-sm text-gray-700 mb-3">${threat.description}</p>
                            
                            <div class="flex justify-between items-center">
                                <span class="text-xs text-gray-500">Category: ${threat.category}</span>
                                <button class="threat-details-btn text-blue-600 hover:text-blue-800 text-sm" data-threat-id="${threat.id}">
                                    View Details →
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderCompliance() {
        const container = document.getElementById('user-compliance');
        const compliance = this.userData.compliance;

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900">Compliance Status</h3>
                    <span class="text-sm text-gray-500">Overall Score: ${compliance.overallScore}%</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    ${compliance.frameworks.map(framework => `
                        <div class="bg-white border border-gray-200 rounded-lg p-6">
                            <div class="flex items-center justify-between mb-4">
                                <h4 class="font-medium text-gray-900">${framework.name}</h4>
                                <span class="text-sm font-medium ${
                                    framework.score >= 80 ? 'text-green-600' :
                                    framework.score >= 60 ? 'text-yellow-600' : 'text-red-600'
                                }">${framework.score}%</span>
                            </div>
                            
                            <div class="w-full bg-gray-200 rounded-full h-2 mb-4">
                                <div class="${
                                    framework.score >= 80 ? 'bg-green-500' :
                                    framework.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                } h-2 rounded-full" style="width: ${framework.score}%"></div>
                            </div>
                            
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Compliant Controls:</span>
                                    <span class="text-gray-900">${framework.compliantControls}/${framework.totalControls}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Last Assessment:</span>
                                    <span class="text-gray-900">${new Date(framework.lastAssessment).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="bg-blue-50 rounded-lg p-6">
                    <h4 class="font-medium text-gray-900 mb-3">Recommendations</h4>
                    <ul class="space-y-2">
                        ${compliance.recommendations.map(rec => `
                            <li class="flex items-start space-x-2">
                                <i class="fas fa-lightbulb text-blue-500 mt-1"></i>
                                <span class="text-sm text-gray-700">${rec}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;
    }

    getThreatSeverityColor(severity) {
        switch (severity) {
            case 'high': return 'bg-red-500';
            case 'medium': return 'bg-yellow-500';
            case 'low': return 'bg-blue-500';
            default: return 'bg-gray-500';
        }
    }

    // Mock data methods
    getMockDashboardData() {
        return {
            deviceCount: 3,
            deviceChange: '+1',
            threatCount: 2,
            threatChange: '-1',
            complianceScore: 85,
            complianceChange: '+5%',
            lastScanTime: '2 hours ago',
            securityScore: 87,
            recentActivity: [
                {
                    description: 'Security scan completed on Work Laptop',
                    timestamp: new Date().toISOString(),
                    icon: 'fas fa-shield-alt',
                    color: 'green'
                },
                {
                    description: 'Threat detected and quarantined',
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                    icon: 'fas fa-exclamation-triangle',
                    color: 'yellow'
                },
                {
                    description: 'System update installed',
                    timestamp: new Date(Date.now() - 7200000).toISOString(),
                    icon: 'fas fa-download',
                    color: 'blue'
                }
            ]
        };
    }

    getMockDevicesData() {
        return [
            {
                id: 'device1',
                name: 'Work Laptop',
                type: 'laptop',
                os: 'Windows 11 Pro',
                status: 'online',
                lastSeen: new Date().toISOString(),
                version: '2.1.0',
                securityScore: 92
            },
            {
                id: 'device2',
                name: 'Home Desktop',
                type: 'desktop',
                os: 'Windows 10 Home',
                status: 'offline',
                lastSeen: new Date(Date.now() - 86400000).toISOString(),
                version: '2.0.5',
                securityScore: 78
            },
            {
                id: 'device3',
                name: 'Mobile Workstation',
                type: 'laptop',
                os: 'Windows 11 Pro',
                status: 'scanning',
                lastSeen: new Date(Date.now() - 1800000).toISOString(),
                version: '2.1.0',
                securityScore: 85
            }
        ];
    }

    getMockThreatsData() {
        return [
            {
                id: 'threat1',
                title: 'Suspicious Network Activity',
                description: 'Unusual outbound connections detected from Work Laptop',
                device: 'Work Laptop',
                severity: 'medium',
                category: 'Network',
                status: 'active',
                timestamp: new Date(Date.now() - 1800000).toISOString()
            },
            {
                id: 'threat2',
                title: 'Outdated Software Detected',
                description: 'Critical security update available for Adobe Reader',
                device: 'Home Desktop',
                severity: 'low',
                category: 'Software',
                status: 'acknowledged',
                timestamp: new Date(Date.now() - 3600000).toISOString()
            }
        ];
    }

    getMockComplianceData() {
        return {
            overallScore: 82,
            frameworks: [
                {
                    name: 'NIST Cybersecurity Framework',
                    score: 85,
                    compliantControls: 17,
                    totalControls: 20,
                    lastAssessment: new Date(Date.now() - 604800000).toISOString()
                },
                {
                    name: 'ISO 27001',
                    score: 78,
                    compliantControls: 23,
                    totalControls: 30,
                    lastAssessment: new Date(Date.now() - 1209600000).toISOString()
                }
            ],
            recommendations: [
                'Enable automatic security updates on all devices',
                'Implement multi-factor authentication for all accounts',
                'Schedule regular security awareness training',
                'Update outdated software on Home Desktop'
            ]
        };
    }

    // Event handlers
    async refreshData(showToast = true) {
        if (showToast) {
            window.MagenSecUI.showToast('Refreshing data...', 'info');
        }
        
        await this.loadUserData();
        this.renderCurrentView();
        
        if (showToast) {
            window.MagenSecUI.showToast('Data refreshed successfully', 'success');
        }
    }

    showDeviceDetails(deviceId) {
        const device = this.userData.devices.find(d => d.id === deviceId);
        if (device) {
            window.MagenSecUI.showToast(`Device details for ${device.name} - Feature coming soon`, 'info');
        }
    }

    refreshDevice(deviceId) {
        const device = this.userData.devices.find(d => d.id === deviceId);
        if (device) {
            window.MagenSecUI.showToast(`Refreshing ${device.name}...`, 'info');
            setTimeout(() => {
                window.MagenSecUI.showToast(`${device.name} refreshed successfully`, 'success');
            }, 2000);
        }
    }

    showThreatDetails(threatId) {
        const threat = this.userData.threats.find(t => t.id === threatId);
        if (threat) {
            window.MagenSecUI.showToast(`Threat details for "${threat.title}" - Feature coming soon`, 'info');
        }
    }

    acknowledgeThreat(threatId) {
        const threat = this.userData.threats.find(t => t.id === threatId);
        if (threat) {
            threat.status = 'acknowledged';
            this.renderCurrentView();
            window.MagenSecUI.showToast('Threat acknowledged', 'success');
        }
    }

    scanAllDevices() {
        window.MagenSecUI.showToast('Starting security scan on all devices...', 'info');
        setTimeout(() => {
            window.MagenSecUI.showToast('Security scan completed on all devices', 'success');
            this.refreshData(false);
        }, 5000);
    }

    downloadUserReport() {
        window.MagenSecUI.showToast('Generating personal security report...', 'info');
        setTimeout(() => {
            window.MagenSecUI.showToast('Report downloaded successfully', 'success');
        }, 3000);
    }

    // Cleanup
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserDashboardPage;
}

// Make available globally
window.UserDashboardPage = new UserDashboardPage();