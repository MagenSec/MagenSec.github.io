/**
 * Dashboard Page - Professional Security-Focused UI
 * Preact + HTM with enhanced mock data
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { SearchableOrgSwitcher } from '../components/SearchableOrgSwitcher.js';

const { html, Component } = window;

export class DashboardPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            data: null,
            error: null
        };
        
        // Subscribe to org changes
        this.unsubscribeOrg = null;
    }

    componentDidMount() {
        // Subscribe to org context changes
        this.unsubscribeOrg = orgContext.onChange((org) => {
            console.log('[Dashboard] Org changed:', org);
            this.loadData(); // Reload data when org changes
        });
        
        this.loadData();
    }
    
    componentWillUnmount() {
        // Cleanup subscription
        if (this.unsubscribeOrg) {
            this.unsubscribeOrg();
        }
    }
    
    handleOrgChange() {
        // Reload dashboard data when org changes
        this.setState({ loading: true, error: null });
        this.loadData();
    }

    async loadData() {
        try {
            // TODO: Replace with real API call when /api/dashboard is implemented
            // Enhanced mock data showing security value
            const mockData = {
                // Security Overview
                securityScore: 78,
                grade: 'B',
                lastScan: '2 hours ago',
                nextScan: 'in 3 hours',
                
                // Quick Stats
                devices: {
                    total: 5,
                    active: 3,
                    disabled: 1,
                    blocked: 1
                },
                
                threats: {
                    critical: 2,
                    high: 3,
                    medium: 7,
                    low: 12,
                    total: 24
                },
                
                compliance: {
                    score: 85,
                    compliant: 17,
                    nonCompliant: 3,
                    total: 20
                },
                
                // Security Alerts (top 3)
                alerts: [
                    {
                        id: 1,
                        severity: 'critical',
                        title: 'CVE-2024-1234 - Windows SMB Vulnerability',
                        device: 'LAPTOP-ABC',
                        detected: '2 hours ago',
                        description: 'Remote code execution vulnerability'
                    },
                    {
                        id: 2,
                        severity: 'critical',
                        title: 'Outdated Antivirus - Windows Defender',
                        device: 'DESKTOP-XYZ',
                        detected: '5 hours ago',
                        description: 'Definitions are 7 days old'
                    },
                    {
                        id: 3,
                        severity: 'warning',
                        title: 'Missing Windows Update - KB5034765',
                        device: 'LAPTOP-ABC',
                        detected: '1 day ago',
                        description: 'Security update not installed'
                    }
                ],
                
                // Recent Devices
                recentDevices: [
                    { name: 'LAPTOP-ABC', status: 'active', lastSeen: '5m ago', threats: 2 },
                    { name: 'DESKTOP-XYZ', status: 'active', lastSeen: '15m ago', threats: 1 },
                    { name: 'SERVER-001', status: 'blocked', lastSeen: '2d ago', threats: 0 },
                    { name: 'WORK-PC', status: 'disabled', lastSeen: '1h ago', threats: 0 },
                    { name: 'HOME-PC', status: 'active', lastSeen: '30m ago', threats: 0 }
                ]
            };
            
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 800));
            
            this.setState({ data: mockData, loading: false });
        } catch (error) {
            this.setState({ error: error.message, loading: false });
        }
    }

    render() {
        const { html } = window;
        const { loading, data, error } = this.state;
        const user = auth.getUser();

        return html`
            <div class="min-h-screen bg-gray-50">
                <!-- Header -->
                <header class="bg-gradient-to-r from-blue-900 to-blue-700 shadow-lg">
                    <div class="max-w-7xl mx-auto px-4 py-6">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-4">
                                <div class="bg-white/10 p-3 rounded-lg">
                                    <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                                <div class="flex-1">
                                    <h1 class="text-2xl font-bold text-white">Security Dashboard</h1>
                                    <p class="text-blue-100">Welcome back, ${user?.name || user?.email}</p>
                                </div>
                                <!-- Organization Switcher -->
                                <${SearchableOrgSwitcher} onOrgChange=${() => this.handleOrgChange()} />
                            </div>
                            <div class="flex items-center gap-3">
                                <button class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition">
                                    <svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Scan Now
                                </button>
                                <a href="#!/devices" class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition">Devices</a>
                                <button onclick=${() => auth.logout()} class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition">
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Content -->
                <main class="max-w-7xl mx-auto px-4 py-8">
                    ${loading ? this.renderLoading() : error ? this.renderError(error) : this.renderDashboard(data)}
                </main>
            </div>
        `;
    }

    renderLoading() {
        const { html } = window;
        return html`
            <div class="space-y-6">
                <!-- Skeleton for Security Score -->
                <div class="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                    <div class="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                    <div class="h-20 bg-gray-200 rounded"></div>
                </div>
                
                <!-- Skeleton for Stats Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${[1,2,3,4].map(() => html`
                        <div class="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                            <div class="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                            <div class="h-8 bg-gray-200 rounded w-3/4"></div>
                        </div>
                    `)}
                </div>
                
                <!-- Skeleton for Alerts -->
                <div class="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                    <div class="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div class="space-y-3">
                        ${[1,2,3].map(() => html`
                            <div class="h-16 bg-gray-200 rounded"></div>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    renderError(error) {
        const { html } = window;
        return html`
            <div class="bg-red-50 border-2 border-red-200 rounded-xl p-8 text-center">
                <svg class="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 class="text-xl font-semibold text-red-900 mb-2">Error Loading Dashboard</h3>
                <p class="text-red-700 mb-6">${error}</p>
                <button 
                    onclick=${() => this.loadData()}
                    class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
                >
                    Try Again
                </button>
            </div>
        `;
    }

    renderDashboard(data) {
        const { html } = window;
        
        // If no devices, show empty state
        if (data.devices.total === 0) {
            return this.renderEmptyState();
        }
        
        return html`
            <div class="space-y-6">
                <!-- Security Score Card -->
                ${this.renderSecurityScore(data)}
                
                <!-- Quick Stats Grid -->
                ${this.renderStatsGrid(data)}
                
                <!-- Security Alerts -->
                ${this.renderAlerts(data.alerts)}
                
                <!-- Recent Devices -->
                ${this.renderRecentDevices(data.recentDevices)}
            </div>
        `;
    }

    renderEmptyState() {
        const { html } = window;
        return html`
            <div class="bg-white rounded-xl shadow-sm p-12 text-center">
                <div class="bg-blue-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg class="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
                <h2 class="text-2xl font-bold text-gray-900 mb-3">Get Started with MagenSec</h2>
                <p class="text-gray-600 mb-8 max-w-md mx-auto">
                    Install the agent on your first device to start monitoring security posture and vulnerabilities.
                </p>
                <div class="flex gap-4 justify-center">
                    <button class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">
                        Download Windows Agent
                    </button>
                    <button class="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 rounded-lg font-medium transition">
                        View Documentation
                    </button>
                </div>
            </div>
        `;
    }

    renderSecurityScore(data) {
        const { html } = window;
        const { securityScore, grade, lastScan, nextScan } = data;
        
        return html`
            <div class="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl shadow-lg p-6 text-white">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h2 class="text-lg font-medium text-blue-100 mb-2">Overall Security Score</h2>
                        <div class="flex items-baseline gap-4">
                            <div class="text-6xl font-bold">${grade}</div>
                            <div class="text-3xl font-semibold">${securityScore}/100</div>
                        </div>
                        <div class="mt-4 flex gap-6 text-sm">
                            <div>
                                <span class="text-blue-200">Last Scan:</span>
                                <span class="font-medium ml-2">${lastScan}</span>
                            </div>
                            <div>
                                <span class="text-blue-200">Next Scan:</span>
                                <span class="font-medium ml-2">${nextScan}</span>
                            </div>
                        </div>
                    </div>
                    <div class="hidden md:block">
                        <div class="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
                            <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderStatsGrid(data) {
        const { html } = window;
        const { devices, threats, compliance } = data;
        
        return html`
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Active Devices -->
                <div class="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-medium text-gray-600">Devices</h3>
                        <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                    </div>
                    <div class="text-3xl font-bold text-gray-900 mb-1">${devices.active}/${devices.total}</div>
                    <div class="text-sm text-gray-500">Active Devices</div>
                </div>
                
                <!-- Critical Threats -->
                <div class="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-medium text-gray-600">Critical Threats</h3>
                        <div class="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                    </div>
                    <div class="text-3xl font-bold text-red-600 mb-1">${threats.critical}</div>
                    <div class="text-sm text-gray-500">Require Immediate Action</div>
                </div>
                
                <!-- Warnings -->
                <div class="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-medium text-gray-600">Warnings</h3>
                        <div class="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <div class="text-3xl font-bold text-yellow-600 mb-1">${threats.medium + threats.low}</div>
                    <div class="text-sm text-gray-500">Issues Found</div>
                </div>
                
                <!-- Compliance -->
                <div class="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-medium text-gray-600">Compliance</h3>
                        <div class="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <div class="text-3xl font-bold text-green-600 mb-1">${compliance.score}%</div>
                    <div class="text-sm text-gray-500">${compliance.compliant}/${compliance.total} Resources</div>
                </div>
            </div>
        `;
    }

    renderAlerts(alerts) {
        const { html } = window;
        
        if (!alerts || alerts.length === 0) {
            return html`
                <div class="bg-white rounded-xl shadow-sm p-8 text-center">
                    <div class="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-900 mb-2">All Clear - No Security Alerts</h3>
                    <p class="text-gray-600">Your devices are secure and up-to-date.</p>
                </div>
            `;
        }
        
        return html`
            <div class="bg-white rounded-xl shadow-sm p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-xl font-semibold text-gray-900 flex items-center gap-2">
                        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Security Alerts
                        <span class="ml-2 px-2 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">${alerts.length}</span>
                    </h2>
                    <button class="text-blue-600 hover:text-blue-700 font-medium text-sm">View All →</button>
                </div>
                <div class="space-y-4">
                    ${alerts.map(alert => this.renderAlert(alert))}
                </div>
            </div>
        `;
    }

    renderAlert(alert) {
        const { html } = window;
        const severityStyles = {
            critical: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-600' },
            high: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-600' },
            warning: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-600' },
            low: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-600' }
        };
        const style = severityStyles[alert.severity] || severityStyles.low;
        
        return html`
            <div class="border-2 ${style.bg} rounded-lg p-4 hover:shadow-md transition">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <span class="${style.badge} text-white text-xs font-bold px-2 py-1 rounded uppercase">
                                ${alert.severity}
                            </span>
                            <h3 class="font-semibold ${style.text}">${alert.title}</h3>
                        </div>
                        <p class="text-sm text-gray-600 mb-2">${alert.description}</p>
                        <div class="flex gap-4 text-xs text-gray-500">
                            <span>🖥️ ${alert.device}</span>
                            <span>🕒 ${alert.detected}</span>
                        </div>
                    </div>
                    <button class="ml-4 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium transition">
                        Remediate
                    </button>
                </div>
            </div>
        `;
    }

    renderRecentDevices(devices) {
        const { html } = window;
        
        return html`
            <div class="bg-white rounded-xl shadow-sm p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-xl font-semibold text-gray-900 flex items-center gap-2">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Device Status
                    </h2>
                    <a href="#!/devices" class="text-blue-600 hover:text-blue-700 font-medium text-sm">View All →</a>
                </div>
                <div class="space-y-3">
                    ${devices.map(device => this.renderDeviceRow(device))}
                </div>
            </div>
        `;
    }

    renderDeviceRow(device) {
        const { html } = window;
        const statusStyles = {
            active: { badge: 'bg-green-100 text-green-700', icon: '✅' },
            disabled: { badge: 'bg-yellow-100 text-yellow-700', icon: '⚠️' },
            blocked: { badge: 'bg-red-100 text-red-700', icon: '🔴' }
        };
        const style = statusStyles[device.status] || statusStyles.active;
        
        return html`
            <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                <div class="flex items-center gap-4 flex-1">
                    <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <h3 class="font-semibold text-gray-900">${device.name}</h3>
                            <span class="${style.badge} text-xs font-medium px-2 py-1 rounded-full">
                                ${style.icon} ${device.status}
                            </span>
                            ${device.threats > 0 ? html`
                                <span class="bg-red-100 text-red-700 text-xs font-medium px-2 py-1 rounded-full">
                                    ${device.threats} threat${device.threats > 1 ? 's' : ''}
                                </span>
                            ` : ''}
                        </div>
                        <p class="text-sm text-gray-500">Last seen: ${device.lastSeen}</p>
                    </div>
                </div>
                <button class="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    Details →
                </button>
            </div>
        `;
    }
}
