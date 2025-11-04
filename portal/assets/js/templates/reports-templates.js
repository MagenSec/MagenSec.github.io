// Reports page template definitions
window.MagenSecTemplates = window.MagenSecTemplates || {};
window.MagenSecTemplates.reports = {
    
    // Report generation section template
    reportGenerators: function() {
        const reportTypes = [
            {
                icon: 'fas fa-shield-alt',
                color: 'blue',
                title: 'Security Summary',
                description: 'Overall security posture and key metrics',
                type: 'security'
            },
            {
                icon: 'fas fa-exclamation-triangle',
                color: 'red',
                title: 'Threat Analysis',
                description: 'Latest threats and vulnerabilities',
                type: 'threat'
            },
            {
                icon: 'fas fa-clipboard-check',
                color: 'green',
                title: 'Compliance',
                description: 'Regulatory compliance status',
                type: 'compliance'
            },
            {
                icon: 'fas fa-inventory',
                color: 'purple',
                title: 'Asset Inventory',
                description: 'Complete device and software inventory',
                type: 'inventory'
            }
        ];

        return `
            <h2 class="text-lg font-semibold mb-4">Generate New Report</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${reportTypes.map(report => this.reportGeneratorCard(report)).join('')}
            </div>
        `;
    },

    // Individual report generator card template
    reportGeneratorCard: function(report) {
        return `
            <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                <div class="text-center">
                    <div class="text-${report.color}-600 mb-2">
                        <i class="${report.icon} text-2xl"></i>
                    </div>
                    <h3 class="font-medium text-gray-900 mb-2">${report.title}</h3>
                    <p class="text-sm text-gray-600 mb-3">${report.description}</p>
                    <button class="generate-report w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700" data-report-type="${report.type}">
                        Generate
                    </button>
                </div>
            </div>
        `;
    },

    // Reports list template
    reportsList: function(reports) {
        return `
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
                            ${reports.map(report => this.reportRow(report)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // Individual report row template
    reportRow: function(report) {
        const statusClasses = {
            'completed': 'bg-green-100 text-green-800',
            'generating': 'bg-yellow-100 text-yellow-800',
            'failed': 'bg-red-100 text-red-800'
        };

        const actionButtons = this.reportActions(report);

        return `
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
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[report.status] || statusClasses['failed']}">
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
                    ${actionButtons}
                </td>
            </tr>
        `;
    },

    // Report action buttons based on status
    reportActions: function(report) {
        switch (report.status) {
            case 'completed':
                return `
                    <button class="view-report text-blue-600 hover:text-blue-900 mr-3" data-report-id="${report.id}">
                        View
                    </button>
                    <button class="download-report text-green-600 hover:text-green-900" data-report-id="${report.id}">
                        Download
                    </button>
                `;
            case 'generating':
                return '<span class="text-yellow-600">Generating...</span>';
            case 'failed':
                return '<span class="text-red-600">Failed</span>';
            default:
                return '<span class="text-gray-600">Unknown</span>';
        }
    }
};