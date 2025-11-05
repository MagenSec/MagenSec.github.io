/**
 * Dashboard Page - Preact + HTM
 */

import { auth } from '../auth.js';
import { api } from '../api.js';

export class DashboardPage extends window.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            data: null,
            error: null
        };
    }

    componentDidMount() {
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
                <header class="bg-white shadow">
                    <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900">Dashboard</h1>
                            <p class="text-sm text-gray-600">Welcome back, ${user?.name || user?.email}</p>
                        </div>
                        <div class="flex items-center gap-4">
                            <a href="#!/devices" class="text-gray-600 hover:text-gray-900">Devices</a>
                            <button 
                                onclick=${() => auth.logout()}
                                class="text-red-600 hover:text-red-800"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </header>

                <!-- Content -->
                <main class="max-w-7xl mx-auto px-4 py-8">
                    ${loading ? html`
                        <div class="flex justify-center items-center h-64">
                            <div class="spinner"></div>
                        </div>
                    ` : error ? html`
                        <div class="bg-red-50 border border-red-200 rounded-lg p-6">
                            <h3 class="text-red-800 font-semibold mb-2">Error loading dashboard</h3>
                            <p class="text-red-600">${error}</p>
                            <button 
                                onclick=${() => this.loadData()}
                                class="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                            >
                                Retry
                            </button>
                        </div>
                    ` : html`
                        <!-- Stats Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            ${this.renderStatCard('Active Devices', data?.activeDevices || 0, 'text-blue-600')}
                            ${this.renderStatCard('Threats Detected', data?.threats || 0, 'text-red-600')}
                            ${this.renderStatCard('Compliance Score', (data?.compliance || 0) + '%', 'text-green-600')}
                        </div>

                        <!-- Recent Activity -->
                        <div class="bg-white rounded-lg shadow p-6">
                            <h2 class="text-xl font-semibold mb-4">Recent Activity</h2>
                            <div class="space-y-3">
                                ${(data?.recentActivity || []).length === 0 ? html`
                                    <p class="text-gray-500 text-center py-8">No recent activity</p>
                                ` : data.recentActivity.map(activity => html`
                                    <div class="flex justify-between items-center border-b pb-3">
                                        <div>
                                            <p class="font-medium">${activity.description}</p>
                                            <p class="text-sm text-gray-500">${activity.device}</p>
                                        </div>
                                        <span class="text-sm text-gray-400">${activity.time}</span>
                                    </div>
                                `)}
                            </div>
                        </div>
                    `}
                </main>
            </div>
        `;
    }

    renderStatCard(title, value, colorClass) {
        const { html } = window;
        return html`
            <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-gray-600 text-sm font-medium mb-2">${title}</h3>
                <p class="${colorClass} text-3xl font-bold">${value}</p>
            </div>
        `;
    }
}
