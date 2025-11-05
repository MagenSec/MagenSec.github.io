/**
 * Devices Page - Preact + HTM
 */

import { auth } from '../auth.js';
import { api } from '../api.js';

export class DevicesPage extends window.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            devices: [],
            error: null
        };
    }

    componentDidMount() {
        this.loadDevices();
    }

    async loadDevices() {
        try {
            // TODO: Replace with real API call when /api/devices is implemented
            // For now, show empty list to verify page works
            const mockData = {
                data: []
            };
            
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.setState({ devices: mockData.data || [], loading: false });
        } catch (error) {
            this.setState({ error: error.message, loading: false });
        }
    }

    render() {
        const { html } = window;
        const { loading, devices, error } = this.state;

        return html`
            <div class="min-h-screen bg-gray-50">
                <!-- Header -->
                <header class="bg-white shadow">
                    <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900">Devices</h1>
                        </div>
                        <div class="flex items-center gap-4">
                            <a href="#!/dashboard" class="text-gray-600 hover:text-gray-900">Dashboard</a>
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
                            <p class="text-red-600">${error}</p>
                        </div>
                    ` : html`
                        <div class="bg-white rounded-lg shadow overflow-hidden">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${devices.length === 0 ? html`
                                        <tr>
                                            <td colspan="3" class="px-6 py-8 text-center text-gray-500">
                                                No devices found
                                            </td>
                                        </tr>
                                    ` : devices.map(device => html`
                                        <tr>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <div class="font-medium text-gray-900">${device.name}</div>
                                                <div class="text-sm text-gray-500">${device.id}</div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <span class="px-2 py-1 text-xs rounded-full ${device.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                                                    ${device.status}
                                                </span>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                ${device.lastSeen}
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    `}
                </main>
            </div>
        `;
    }
}
