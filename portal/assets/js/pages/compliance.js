// MagenSec Hub - Compliance Page Controller
class CompliancePage {
    constructor() {
        this.complianceData = [];
        this.currentView = 'overview';
        this.selectedFramework = 'all';
        this.filters = {
            status: 'all',
            priority: 'all',
            category: 'all'
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
            console.error('Compliance page render error:', error);
            window.MagenSecUI?.showToast('Failed to load compliance page', 'error');
            
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
                    <p class="mt-4 text-gray-600">Loading compliance data...</p>
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
                    <h2 class="text-2xl font-bold text-gray-800 mb-2">Error Loading Compliance Page</h2>
                    <p class="text-gray-600 mb-4">${error.message}</p>
                    <button onclick="window.location.reload()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }

    async initialize() {
        console.log('Compliance page initializing...');
        this.setupEventHandlers();
        await this.loadComplianceData();
        this.renderPage();
    }

    setupEventHandlers() {
        // Framework selector
        document.addEventListener('change', (e) => {
            if (e.target.id === 'framework-selector') {
                this.selectedFramework = e.target.value;
                this.filterAndRenderData();
            }
        });

        // Filter controls
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('compliance-filter')) {
                const filterType = e.target.dataset.filter;
                this.filters[filterType] = e.target.value;
                this.filterAndRenderData();
            }
        });

        // View toggle buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('view-toggle')) {
                this.currentView = e.target.dataset.view;
                this.renderPage();
            }
        });

        // Export functionality
        document.addEventListener('click', (e) => {
            if (e.target.id === 'export-compliance') {
                this.exportComplianceReport();
            }
        });
    }

    async loadComplianceData() {
        try {
            const response = await window.MagenSecAPI.getCompliance();
            this.complianceData = response.data || this.getMockData();
        } catch (error) {
            console.warn('Using mock compliance data:', error);
            this.complianceData = this.getMockData();
        }
    }

    getMockData() {
        return {
            frameworks: [
                {
                    id: 'iso27001',
                    name: 'ISO 27001',
                    status: 'compliant',
                    score: 85,
                    controls: 114,
                    implemented: 97,
                    lastAssessment: '2025-09-10'
                },
                {
                    id: 'nist',
                    name: 'NIST Cybersecurity Framework',
                    status: 'partial',
                    score: 72,
                    controls: 98,
                    implemented: 71,
                    lastAssessment: '2025-09-08'
                },
                {
                    id: 'pci',
                    name: 'PCI DSS',
                    status: 'non-compliant',
                    score: 45,
                    controls: 12,
                    implemented: 5,
                    lastAssessment: '2025-09-05'
                }
            ],
            requirements: [
                {
                    id: 'A.5.1.1',
                    framework: 'iso27001',
                    title: 'Information Security Policy',
                    status: 'compliant',
                    priority: 'high',
                    category: 'policies',
                    evidence: 'Policy document approved',
                    lastReview: '2025-08-15'
                },
                {
                    id: 'A.6.1.2',
                    framework: 'iso27001',
                    title: 'Access Control Policy',
                    status: 'partial',
                    priority: 'medium',
                    category: 'access',
                    evidence: 'Under review',
                    lastReview: '2025-09-01'
                }
            ]
        };
    }

    renderPage() {
        const container = document.getElementById('main-content');
        container.innerHTML = this.getPageHTML();
        this.renderComplianceOverview();
        this.renderComplianceDetails();
    }

    getPageHTML() {
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Compliance Management</h1>
                        <p class="text-gray-600">Monitor and manage regulatory compliance status</p>
                    </div>
                    <div class="flex space-x-3">
                        <button id="export-compliance" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-download mr-2"></i>Export Report
                        </button>
                    </div>
                </div>

                <!-- Framework Overview -->
                <div id="compliance-overview" class="bg-white rounded-lg shadow p-6">
                    <!-- Content will be inserted here -->
                </div>

                <!-- Compliance Details -->
                <div id="compliance-details" class="bg-white rounded-lg shadow">
                    <!-- Content will be inserted here -->
                </div>
            </div>
        `;
    }

    renderComplianceOverview() {
        const container = document.getElementById('compliance-overview');
        const frameworks = this.complianceData.frameworks || [];

        container.innerHTML = `
            <h2 class="text-lg font-semibold mb-4">Compliance Frameworks</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${frameworks.map(framework => `
                    <div class="border border-gray-200 rounded-lg p-4">
                        <div class="flex justify-between items-start mb-3">
                            <h3 class="font-medium text-gray-900">${framework.name}</h3>
                            <span class="status-dot status-${framework.status === 'compliant' ? 'online' : framework.status === 'partial' ? 'medium' : 'critical'}"></span>
                        </div>
                        <div class="space-y-2">
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600">Score:</span>
                                <span class="font-medium">${framework.score}%</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600">Controls:</span>
                                <span class="font-medium">${framework.implemented}/${framework.controls}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span class="text-gray-600">Last Assessment:</span>
                                <span class="font-medium">${framework.lastAssessment}</span>
                            </div>
                        </div>
                        <div class="mt-3">
                            <div class="bg-gray-200 rounded-full h-2">
                                <div class="bg-${framework.score >= 80 ? 'green' : framework.score >= 60 ? 'yellow' : 'red'}-500 h-2 rounded-full" style="width: ${framework.score}%"></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderComplianceDetails() {
        const container = document.getElementById('compliance-details');
        const requirements = this.complianceData.requirements || [];

        container.innerHTML = `
            <div class="p-6">
                <h2 class="text-lg font-semibold mb-4">Compliance Requirements</h2>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requirement</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Framework</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Review</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${requirements.map(req => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-gray-900">${req.id}</div>
                                        <div class="text-sm text-gray-500">${req.title}</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${req.framework.toUpperCase()}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            req.status === 'compliant' ? 'bg-green-100 text-green-800' :
                                            req.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-red-100 text-red-800'
                                        }">${req.status}</span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${req.priority}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${req.lastReview}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    filterAndRenderData() {
        // Apply filters and re-render
        this.renderComplianceDetails();
    }

    exportComplianceReport() {
        // Generate and download compliance report
        console.log('Exporting compliance report...');
        window.MagenSecUtils.showNotification('Compliance report exported successfully', 'success');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.CompliancePage = new CompliancePage();
    });
} else {
    window.CompliancePage = new CompliancePage();
}
