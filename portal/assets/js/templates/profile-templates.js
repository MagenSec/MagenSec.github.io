// Profile page template definitions
window.MagenSecTemplates = window.MagenSecTemplates || {};
window.MagenSecTemplates.profile = {
    
    // User information section template
    userInfo: function(user, isEditing = false) {
        return `
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-lg font-semibold">User Information</h2>
                <button id="edit-profile-btn" class="text-blue-600 hover:text-blue-800">
                    <i class="fas fa-edit mr-1"></i>Edit Profile
                </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    ${this.formField('Full Name', 'user-name', user.name, 'text', isEditing, false)}
                    ${this.formField('Email Address', '', user.email, 'text', false, true)}
                    ${this.formField('Job Title', 'user-title', user.title, 'text', isEditing, false)}
                    ${this.formField('Department', 'user-department', user.department, 'text', isEditing, false)}
                    ${this.formField('Phone', 'user-phone', user.phone, 'tel', isEditing, false)}
                </div>

                <div class="space-y-4">
                    ${this.formField('Location', 'user-location', user.location, 'text', isEditing, false)}
                    ${this.formField('Role', '', user.role, 'text', false, true)}
                    ${this.formField('Join Date', '', new Date(user.joinDate).toLocaleDateString(), 'text', false, true)}
                    ${this.formField('Last Login', '', new Date(user.lastLogin).toLocaleString(), 'text', false, true)}
                </div>
            </div>

            ${isEditing ? this.editButtons() : ''}
        `;
    },

    // Reusable form field template
    formField: function(label, id, value, type = 'text', isEditing = false, isReadOnly = false) {
        return `
            <div>
                <label class="block text-sm font-medium text-gray-700">${label}</label>
                ${isEditing && !isReadOnly ? `
                    <input type="${type}" id="${id}" value="${value}" 
                           class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                ` : `
                    <p class="mt-1 text-gray-900">${value}</p>
                `}
            </div>
        `;
    },

    // Edit mode buttons
    editButtons: function() {
        return `
            <div class="flex space-x-3 pt-6 border-t border-gray-200">
                <button id="save-profile-btn" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Save Changes
                </button>
                <button id="cancel-edit-btn" class="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        `;
    },

    // Security settings template
    securitySettings: function(user) {
        return `
            <h2 class="text-lg font-semibold mb-6">Security Settings</h2>
            
            <div class="space-y-6">
                ${this.securityCard('Password', 'Last changed 30 days ago', 'change-password-btn', 'Change Password')}
                ${this.twoFactorCard(user.twoFactorEnabled)}
                ${this.activeSessionsCard()}
            </div>
        `;
    },

    // Security setting card template
    securityCard: function(title, description, buttonId, buttonText) {
        return `
            <div class="flex justify-between items-center p-4 border border-gray-200 rounded-lg">
                <div>
                    <h3 class="font-medium text-gray-900">${title}</h3>
                    <p class="text-sm text-gray-600">${description}</p>
                </div>
                <button id="${buttonId}" class="text-blue-600 hover:text-blue-800">
                    ${buttonText}
                </button>
            </div>
        `;
    },

    // Two-factor authentication toggle card
    twoFactorCard: function(isEnabled) {
        return `
            <div class="flex justify-between items-center p-4 border border-gray-200 rounded-lg">
                <div>
                    <h3 class="font-medium text-gray-900">Two-Factor Authentication</h3>
                    <p class="text-sm text-gray-600">Add an extra layer of security to your account</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="two-factor-toggle" class="sr-only peer" ${isEnabled ? 'checked' : ''}>
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
            </div>
        `;
    },

    // Active sessions management card
    activeSessionsCard: function() {
        const sessions = [
            {
                device: 'Current Session - Chrome on Windows',
                location: '192.168.1.100 • Active now',
                isCurrent: true
            },
            {
                device: 'Mobile App - iOS',
                location: '10.0.0.50 • 2 hours ago',
                isCurrent: false
            }
        ];

        return `
            <div class="p-4 border border-gray-200 rounded-lg">
                <h3 class="font-medium text-gray-900 mb-3">Active Sessions</h3>
                <div class="space-y-2">
                    ${sessions.map(session => this.sessionItem(session)).join('')}
                </div>
            </div>
        `;
    },

    // Individual session item
    sessionItem: function(session) {
        return `
            <div class="flex justify-between items-center text-sm">
                <div>
                    <p class="font-medium">${session.device}</p>
                    <p class="text-gray-600">${session.location}</p>
                </div>
                ${session.isCurrent ? 
                    '<span class="text-green-600">Current</span>' : 
                    '<button class="text-red-600 hover:text-red-800">Revoke</button>'
                }
            </div>
        `;
    },

    // Activity log template
    activityLog: function() {
        const activities = [
            { action: 'Profile updated', timestamp: '2024-01-15 10:30 AM', details: 'Job title changed' },
            { action: 'Password changed', timestamp: '2024-01-10 2:15 PM', details: 'Password updated successfully' },
            { action: 'Login', timestamp: '2024-01-08 9:00 AM', details: 'Chrome on Windows' },
            { action: '2FA enabled', timestamp: '2024-01-05 4:20 PM', details: 'Two-factor authentication activated' }
        ];

        return `
            <h2 class="text-lg font-semibold mb-6">Recent Activity</h2>
            <div class="space-y-4">
                ${activities.map(activity => this.activityItem(activity)).join('')}
            </div>
        `;
    },

    // Individual activity item
    activityItem: function(activity) {
        return `
            <div class="flex items-start space-x-3 p-3 border border-gray-100 rounded-lg">
                <div class="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div class="flex-1">
                    <p class="font-medium text-gray-900">${activity.action}</p>
                    <p class="text-sm text-gray-600">${activity.details}</p>
                    <p class="text-xs text-gray-500 mt-1">${activity.timestamp}</p>
                </div>
            </div>
        `;
    }
};