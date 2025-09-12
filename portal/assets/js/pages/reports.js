// MagenSec Hub - Reports Page Controller
class ReportsPage {
    constructor() {
        this.reports = [];
        this.currentView = 'list';
        this.selectedReport = null;
        this.filters = {
            type: 'all',
            dateRange: '30d',
            status: 'all'
        };
    }

    async initialize() {
        console.log('Reports page initializing...');
        this.setupEventHandlers();
        await this.loadReports();
        this.renderPage();
    }

    setupEventHandlers() {
        // Report type filter
        document.addEventListener('change', (e) => {
            if (e.target.id === 'report-type-filter') {
                this.filters.type = e.target.value;
                this.filterAndRenderReports();
            }
        });

        // Date range filter
        document.addEventListener('change', (e) => {
            if (e.target.id === 'date-range-filter') {
                this.filters.dateRange = e.target.value;
                this.filterAndRenderReports();
            }
        });

        // Generate report buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('generate-report')) {
                const reportType = e.target.dataset.reportType;
                this.generateReport(reportType);
            }
        });

        // View report buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('view-report')) {
                const reportId = e.target.dataset.reportId;
                this.viewReport(reportId);
            }
        });

        // Download report buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('download-report')) {
                const reportId = e.target.dataset.reportId;
                this.downloadReport(reportId);
            }
        });
    }

    async loadReports() {
        try {
            const response = await window.MagenSecAPI.getReports();
            this.reports = response.data || this.getMockData();
        } catch (error) {
            console.warn('Using mock reports data:', error);
            this.reports = this.getMockData();
        }
    }

    getMockData() {
        return [
            {
                id: 'rpt_001',
                name: 'Weekly Security Summary',
                type: 'security',
                status: 'completed',
                generatedAt: '2025-09-12T08:00:00Z',
                generatedBy: 'System',
                size: '2.4 MB',
                format: 'PDF',
                description: 'Comprehensive weekly security status report'
            },
            {
                id: 'rpt_002',
                name: 'Threat Intelligence Digest',
                type: 'threat',
                status: 'completed',
                generatedAt: '2025-09-11T16:30:00Z',
                generatedBy: 'admin@company.com',
                size: '1.8 MB',
                format: 'PDF',
                description: 'Latest threat intelligence and indicators'
            },
            {
                id: 'rpt_003',
                name: 'Compliance Audit Report',
                type: 'compliance',
                status: 'generating',
                generatedAt: '2025-09-12T10:15:00Z',
                generatedBy: 'System',
                size: null,
                format: 'PDF',
                description: 'Monthly compliance audit findings'
            },
            {
                id: 'rpt_004',
                name: 'Device Inventory Report',
                type: 'inventory',
                status: 'failed',
                generatedAt: '2025-09-12T09:00:00Z',
                generatedBy: 'admin@company.com',
                size: null,
                format: 'Excel',
                description: 'Complete device inventory with security status'
            }
        ];
    }

    renderPage() {
        const container = document.getElementById('main-content');
        container.innerHTML = this.getPageHTML();
        this.renderReportTemplates();
        this.renderReportsList();
    }

    getPageHTML() {
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
                        <p class="text-gray-600">Generate and manage security reports</p>
                    </div>
                </div>

                <!-- Report Templates -->
                <div id="report-templates" class="bg-white rounded-lg shadow p-6">
                    <!-- Content will be inserted here -->
                </div>

                <!-- Reports List -->
                <div id="reports-list" class="bg-white rounded-lg shadow">
                    <!-- Content will be inserted here -->
                </div>
            </div>
        `;
    }

    renderReportTemplates() {
        const container = document.getElementById('report-templates');
        
        container.innerHTML = `
            <h2 class="text-lg font-semibold mb-4">Generate New Report</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div class="text-center">
                        <div class="text-blue-600 mb-2">
                            <i class="fas fa-shield-alt text-2xl"></i>
                        </div>
                        <h3 class="font-medium text-gray-900 mb-2">Security Summary</h3>
                        <p class="text-sm text-gray-600 mb-3">Overall security posture and key metrics</p>
                        <button class="generate-report w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700" data-report-type="security">
                            Generate
                        </button>
                    </div>
                </div>

                <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div class="text-center">
                        <div class="text-red-600 mb-2">
                            <i class="fas fa-exclamation-triangle text-2xl"></i>
                        </div>
                        <h3 class="font-medium text-gray-900 mb-2">Threat Analysis</h3>
                        <p class="text-sm text-gray-600 mb-3">Latest threats and vulnerabilities</p>
                        <button class="generate-report w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700" data-report-type="threat">
                            Generate
                        </button>
                    </div>
                </div>

                <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div class="text-center">
                        <div class="text-green-600 mb-2">
                            <i class="fas fa-clipboard-check text-2xl"></i>
                        </div>
                        <h3 class="font-medium text-gray-900 mb-2">Compliance</h3>
                        <p class="text-sm text-gray-600 mb-3">Regulatory compliance status</p>
                        <button class="generate-report w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700" data-report-type="compliance">
                            Generate
                        </button>
                    </div>
                </div>

                <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div class="text-center">
                        <div class="text-purple-600 mb-2">
                            <i class="fas fa-desktop text-2xl"></i>
                        </div>
                        <h3 class="font-medium text-gray-900 mb-2">Device Inventory</h3>
                        <p class="text-sm text-gray-600 mb-3">Complete device status report</p>
                        <button class="generate-report w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700" data-report-type="inventory">
                            Generate
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderReportsList() {
        const container = document.getElementById('reports-list');
        
        container.innerHTML = `
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-lg font-semibold">Recent Reports</h2>
                    <div class="flex space-x-3">
                        <select id="report-type-filter" class="border border-gray-300 rounded px-3 py-1 text-sm">
                            <option value="all">All Types</option>
                            <option value="security">Security</option>
                            <option value="threat">Threat</option>
                            <option value="compliance">Compliance</option>
                            <option value="inventory">Inventory</option>
                        </select>
                        <select id="date-range-filter" class="border border-gray-300 rounded px-3 py-1 text-sm">
                            <option value="7d">Last 7 days</option>
                            <option value="30d" selected>Last 30 days</option>
                            <option value="90d">Last 90 days</option>
                        </select>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Report</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Generated</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${this.reports.map(report => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-gray-900">${report.name}</div>
                                        <div class="text-sm text-gray-500">${report.description}</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                                            ${report.type}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            report.status === 'completed' ? 'bg-green-100 text-green-800' :
                                            report.status === 'generating' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-red-100 text-red-800'
                                        }">
                                            ${report.status}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${new Date(report.generatedAt).toLocaleDateString()}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        ${report.size || 'N/A'}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        ${report.status === 'completed' ? `
                                            <button class="view-report text-blue-600 hover:text-blue-900 mr-3" data-report-id="${report.id}">
                                                View
                                            </button>
                                            <button class="download-report text-green-600 hover:text-green-900" data-report-id="${report.id}">
                                                Download
                                            </button>
                                        ` : report.status === 'generating' ? `
                                            <span class="text-yellow-600">Generating...</span>
                                        ` : `
                                            <span class="text-red-600">Failed</span>
                                        `}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    filterAndRenderReports() {
        // Filter reports based on current filters
        this.renderReportsList();
    }

    generateReport(type) {
        console.log(`Generating ${type} report...`);
        window.MagenSecUtils.showNotification(`${type} report generation started`, 'info');
        
        // Simulate report generation
        setTimeout(() => {
            window.MagenSecUtils.showNotification(`${type} report generated successfully`, 'success');
            this.loadReports();
        }, 3000);
    }

    viewReport(reportId) {
        console.log(`Viewing report: ${reportId}`);
        window.MagenSecUtils.showNotification('Opening report viewer...', 'info');
    }

    downloadReport(reportId) {
        console.log(`Downloading report: ${reportId}`);
        window.MagenSecUtils.showNotification('Report download started', 'success');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ReportsPage = new ReportsPage();
    });
} else {
    window.ReportsPage = new ReportsPage();
}
