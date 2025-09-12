// MagenSec Hub - Profile Page Controller
class ProfilePage {
    constructor() {
        this.user = null;
        this.preferences = {};
        this.isEditing = false;
    }

    async initialize() {
        console.log('Profile page initializing...');
        this.setupEventHandlers();
        await this.loadUserProfile();
        this.renderPage();
    }

    setupEventHandlers() {
        // Edit profile button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'edit-profile-btn') {
                this.toggleEditMode();
            }
        });

        // Save profile button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'save-profile-btn') {
                this.saveProfile();
            }
        });

        // Cancel edit button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'cancel-edit-btn') {
                this.cancelEdit();
            }
        });

        // Change password button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'change-password-btn') {
                this.showChangePasswordModal();
            }
        });

        // Two-factor auth toggle
        document.addEventListener('change', (e) => {
            if (e.target.id === 'two-factor-toggle') {
                this.toggleTwoFactorAuth(e.target.checked);
            }
        });

        // Notification preferences
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('notification-preference')) {
                this.updateNotificationPreference(e.target);
            }
        });
    }

    async loadUserProfile() {
        try {
            const response = await window.MagenSecAPI.getUserProfile();
            this.user = response.data || this.getMockUserData();
            this.preferences = this.user.preferences || {};
        } catch (error) {
            console.warn('Using mock user data:', error);
            this.user = this.getMockUserData();
            this.preferences = this.user.preferences || {};
        }
    }

    getMockUserData() {
        return {
            id: 'user_123',
            email: 'admin@company.com',
            name: 'John Administrator',
            title: 'Security Administrator',
            department: 'IT Security',
            phone: '+1 (555) 123-4567',
            timezone: 'America/New_York',
            language: 'en',
            avatar: null,
            lastLogin: '2025-09-12T08:30:00Z',
            accountCreated: '2024-01-15T00:00:00Z',
            twoFactorEnabled: true,
            role: 'admin',
            permissions: ['view_all', 'manage_users', 'generate_reports'],
            preferences: {
                emailNotifications: true,
                pushNotifications: false,
                threatAlerts: true,
                complianceAlerts: true,
                weeklyReports: true,
                theme: 'light',
                dashboardLayout: 'default'
            }
        };
    }

    renderPage() {
        const container = document.getElementById('main-content');
        container.innerHTML = this.getPageHTML();
        this.renderUserInfo();
        this.renderSecuritySettings();
        this.renderPreferences();
    }

    getPageHTML() {
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Profile Settings</h1>
                        <p class="text-gray-600">Manage your account and preferences</p>
                    </div>
                </div>

                <!-- User Information -->
                <div id="user-info" class="bg-white rounded-lg shadow p-6">
                    <!-- Content will be inserted here -->
                </div>

                <!-- Security Settings -->
                <div id="security-settings" class="bg-white rounded-lg shadow p-6">
                    <!-- Content will be inserted here -->
                </div>

                <!-- Preferences -->
                <div id="preferences" class="bg-white rounded-lg shadow p-6">
                    <!-- Content will be inserted here -->
                </div>
            </div>
        `;
    }

    renderUserInfo() {
        const container = document.getElementById('user-info');
        
        container.innerHTML = `
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-lg font-semibold">User Information</h2>
                <button id="edit-profile-btn" class="text-blue-600 hover:text-blue-800">
                    <i class="fas fa-edit mr-1"></i>Edit Profile
                </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Full Name</label>
                        ${this.isEditing ? `
                            <input type="text" id="user-name" value="${this.user.name}" 
                                   class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                        ` : `
                            <p class="mt-1 text-gray-900">${this.user.name}</p>
                        `}
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Email Address</label>
                        <p class="mt-1 text-gray-900">${this.user.email}</p>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Job Title</label>
                        ${this.isEditing ? `
                            <input type="text" id="user-title" value="${this.user.title}" 
                                   class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                        ` : `
                            <p class="mt-1 text-gray-900">${this.user.title}</p>
                        `}
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Department</label>
                        ${this.isEditing ? `
                            <input type="text" id="user-department" value="${this.user.department}" 
                                   class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                        ` : `
                            <p class="mt-1 text-gray-900">${this.user.department}</p>
                        `}
                    </div>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Phone Number</label>
                        ${this.isEditing ? `
                            <input type="text" id="user-phone" value="${this.user.phone}" 
                                   class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                        ` : `
                            <p class="mt-1 text-gray-900">${this.user.phone}</p>
                        `}
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Timezone</label>
                        ${this.isEditing ? `
                            <select id="user-timezone" class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                                <option value="America/New_York" ${this.user.timezone === 'America/New_York' ? 'selected' : ''}>Eastern Time</option>
                                <option value="America/Chicago" ${this.user.timezone === 'America/Chicago' ? 'selected' : ''}>Central Time</option>
                                <option value="America/Denver" ${this.user.timezone === 'America/Denver' ? 'selected' : ''}>Mountain Time</option>
                                <option value="America/Los_Angeles" ${this.user.timezone === 'America/Los_Angeles' ? 'selected' : ''}>Pacific Time</option>
                            </select>
                        ` : `
                            <p class="mt-1 text-gray-900">${this.user.timezone}</p>
                        `}
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Role</label>
                        <p class="mt-1 text-gray-900">${this.user.role}</p>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Last Login</label>
                        <p class="mt-1 text-gray-900">${new Date(this.user.lastLogin).toLocaleString()}</p>
                    </div>
                </div>
            </div>

            ${this.isEditing ? `
                <div class="mt-6 flex space-x-3">
                    <button id="save-profile-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                        Save Changes
                    </button>
                    <button id="cancel-edit-btn" class="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400">
                        Cancel
                    </button>
                </div>
            ` : ''}
        `;
    }

    renderSecuritySettings() {
        const container = document.getElementById('security-settings');
        
        container.innerHTML = `
            <h2 class="text-lg font-semibold mb-6">Security Settings</h2>
            
            <div class="space-y-6">
                <div class="flex justify-between items-center p-4 border border-gray-200 rounded-lg">
                    <div>
                        <h3 class="font-medium text-gray-900">Password</h3>
                        <p class="text-sm text-gray-600">Last changed 30 days ago</p>
                    </div>
                    <button id="change-password-btn" class="text-blue-600 hover:text-blue-800">
                        Change Password
                    </button>
                </div>

                <div class="flex justify-between items-center p-4 border border-gray-200 rounded-lg">
                    <div>
                        <h3 class="font-medium text-gray-900">Two-Factor Authentication</h3>
                        <p class="text-sm text-gray-600">Add an extra layer of security to your account</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="two-factor-toggle" class="sr-only peer" ${this.user.twoFactorEnabled ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>

                <div class="p-4 border border-gray-200 rounded-lg">
                    <h3 class="font-medium text-gray-900 mb-3">Active Sessions</h3>
                    <div class="space-y-2">
                        <div class="flex justify-between items-center text-sm">
                            <div>
                                <p class="font-medium">Current Session - Chrome on Windows</p>
                                <p class="text-gray-600">192.168.1.100 • Active now</p>
                            </div>
                            <span class="text-green-600">Current</span>
                        </div>
                        <div class="flex justify-between items-center text-sm">
                            <div>
                                <p class="font-medium">Mobile App - iOS</p>
                                <p class="text-gray-600">10.0.0.50 • 2 hours ago</p>
                            </div>
                            <button class="text-red-600 hover:text-red-800">Revoke</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderPreferences() {
        const container = document.getElementById('preferences');
        
        container.innerHTML = `
            <h2 class="text-lg font-semibold mb-6">Notification Preferences</h2>
            
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-medium text-gray-900">Email Notifications</h3>
                        <p class="text-sm text-gray-600">Receive updates via email</p>
                    </div>
                    <input type="checkbox" class="notification-preference" data-pref="emailNotifications" 
                           ${this.preferences.emailNotifications ? 'checked' : ''}>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-medium text-gray-900">Push Notifications</h3>
                        <p class="text-sm text-gray-600">Receive browser notifications</p>
                    </div>
                    <input type="checkbox" class="notification-preference" data-pref="pushNotifications" 
                           ${this.preferences.pushNotifications ? 'checked' : ''}>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-medium text-gray-900">Threat Alerts</h3>
                        <p class="text-sm text-gray-600">Immediate notifications for security threats</p>
                    </div>
                    <input type="checkbox" class="notification-preference" data-pref="threatAlerts" 
                           ${this.preferences.threatAlerts ? 'checked' : ''}>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-medium text-gray-900">Compliance Alerts</h3>
                        <p class="text-sm text-gray-600">Notifications for compliance issues</p>
                    </div>
                    <input type="checkbox" class="notification-preference" data-pref="complianceAlerts" 
                           ${this.preferences.complianceAlerts ? 'checked' : ''}>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-medium text-gray-900">Weekly Reports</h3>
                        <p class="text-sm text-gray-600">Automated weekly summary reports</p>
                    </div>
                    <input type="checkbox" class="notification-preference" data-pref="weeklyReports" 
                           ${this.preferences.weeklyReports ? 'checked' : ''}>
                </div>
            </div>
        `;
    }

    toggleEditMode() {
        this.isEditing = !this.isEditing;
        this.renderUserInfo();
    }

    async saveProfile() {
        const updatedUser = {
            name: document.getElementById('user-name').value,
            title: document.getElementById('user-title').value,
            department: document.getElementById('user-department').value,
            phone: document.getElementById('user-phone').value,
            timezone: document.getElementById('user-timezone').value
        };

        try {
            // await window.MagenSecAPI.updateUserProfile(updatedUser);
            Object.assign(this.user, updatedUser);
            this.isEditing = false;
            this.renderUserInfo();
            window.MagenSecUtils.showNotification('Profile updated successfully', 'success');
        } catch (error) {
            window.MagenSecUtils.showNotification('Failed to update profile', 'error');
        }
    }

    cancelEdit() {
        this.isEditing = false;
        this.renderUserInfo();
    }

    showChangePasswordModal() {
        // Show password change modal
        window.MagenSecUtils.showNotification('Password change functionality coming soon', 'info');
    }

    toggleTwoFactorAuth(enabled) {
        // Toggle 2FA
        this.user.twoFactorEnabled = enabled;
        window.MagenSecUtils.showNotification(
            enabled ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled',
            'success'
        );
    }

    updateNotificationPreference(element) {
        const preference = element.dataset.pref;
        const value = element.checked;
        this.preferences[preference] = value;
        
        // Save to backend
        // await window.MagenSecAPI.updateUserPreferences(this.preferences);
        
        window.MagenSecUtils.showNotification('Preferences updated', 'success');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ProfilePage = new ProfilePage();
    });
} else {
    window.ProfilePage = new ProfilePage();
}
