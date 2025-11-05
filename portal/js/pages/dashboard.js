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
            // For now, show mock data to verify OAuth flow works
            const mockData = {
                devices: {
                    total: 0,
                    active: 0,
                    disabled: 0
                },
                license: {
                    type: 'Personal',
                    maxDevices: 5,
                    daysRemaining: 7
                },
                alerts: []
            };
            
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 500));
            
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
