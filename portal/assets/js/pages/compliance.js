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
        // Org change event: reload compliance data and re-render
        window.addEventListener('magensec-org-changed', async () => {
            await this.loadComplianceData();
            this.renderPage();
        });
    }

    async loadComplianceData() {
        try {
            const response = await window.MagenSecAPI.getCompliance();
            if (response && response.data && Object.keys(response.data).length > 0) {
                this.complianceData = response.data;
            } else {
                throw new Error('No compliance data returned from API');
            }
        } catch (error) {
            window.MagenSecUI.showToast('Failed to load compliance data: ' + error.message, 'error');
            this.complianceData = null;
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
        
        container.innerHTML = window.MagenSecTemplates.compliance.frameworksOverview(frameworks);
    }

    renderComplianceDetails() {
        const container = document.getElementById('compliance-details');
        const requirements = this.complianceData.requirements || [];
        
        container.innerHTML = window.MagenSecTemplates.compliance.requirementsTable(requirements);
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
