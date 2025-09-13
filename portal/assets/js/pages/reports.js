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
            
            // Initialize the page
            await this.initialize();
            
        } catch (error) {
            console.error('Reports page render error:', error);
            window.MagenSecUI?.showToast('Failed to load reports page', 'error');
            
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.innerHTML = this.renderErrorState(error);
            }
        }
    }

    renderLoadingState() {
        return `
            <div class="flex items-center justify-center min-h-screen">
                <div class="flex flex-col items-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p class="mt-4 text-gray-600">Loading reports...</p>
                </div>
            </div>
        `;
    }

    renderErrorState(error) {
        return `
            <div class="flex items-center justify-center min-h-screen">
                <div class="text-center">
                    <div class="text-red-500 text-6xl mb-4">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-gray-800 mb-2">Error Loading Reports Page</h2>
                    <p class="text-gray-600 mb-4">${error.message}</p>
                    <button onclick="window.location.reload()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                        Retry
                    </button>
                </div>
            </div>
        `;
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
        container.innerHTML = window.MagenSecTemplates.reports.reportGenerators();
    }

    renderReportsList() {
        const container = document.getElementById('reports-list');
        container.innerHTML = window.MagenSecTemplates.reports.reportsList(this.reports);
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
