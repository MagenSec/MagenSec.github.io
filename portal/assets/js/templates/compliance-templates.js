// Compliance page template definitions
window.MagenSecTemplates = window.MagenSecTemplates || {};
window.MagenSecTemplates.compliance = {
    
    // Compliance frameworks overview template
    frameworksOverview: function(frameworks) {
        return `
            <h2 class="text-lg font-semibold mb-4">Compliance Frameworks</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${frameworks.map(framework => this.frameworkCard(framework)).join('')}
            </div>
        `;
    },

    // Individual framework card template
    frameworkCard: function(framework) {
        const statusClass = framework.status === 'compliant' ? 'online' : 
                           framework.status === 'partial' ? 'medium' : 'critical';
        const progressColor = framework.score >= 80 ? 'green' : 
                             framework.score >= 60 ? 'yellow' : 'red';
        
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="font-medium text-gray-900">${framework.name}</h3>
                    <span class="status-dot status-${statusClass}"></span>
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
                        <div class="bg-${progressColor}-500 h-2 rounded-full" style="width: ${framework.score}%"></div>
                    </div>
                </div>
            </div>
        `;
    },

    // Compliance requirements table template
    requirementsTable: function(requirements) {
        return `
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
                            ${requirements.map(req => this.requirementRow(req)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // Individual requirement row template
    requirementRow: function(req) {
        const statusClasses = {
            'compliant': 'bg-green-100 text-green-800',
            'partial': 'bg-yellow-100 text-yellow-800',
            'non-compliant': 'bg-red-100 text-red-800'
        };
        
        return `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900">${req.id}</div>
                    <div class="text-sm text-gray-500">${req.title}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${req.framework.toUpperCase()}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[req.status] || statusClasses['non-compliant']}">${req.status}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${req.priority}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${req.lastReview}</td>
            </tr>
        `;
    }
};