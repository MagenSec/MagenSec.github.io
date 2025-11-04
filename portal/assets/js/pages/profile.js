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
            if (response && response.data && Object.keys(response.data).length > 0) {
                this.user = response.data;
                this.preferences = this.user.preferences || {};
            } else {
                throw new Error('No user profile data returned from API');
            }
        } catch (error) {
            window.MagenSecUI.showToast('Failed to load user profile: ' + error.message, 'error');
            this.user = null;
            this.preferences = {};
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
        container.innerHTML = window.MagenSecTemplates.profile.userInfo(this.user, this.isEditing);
    }

    renderSecuritySettings() {
        const container = document.getElementById('security-settings');
        container.innerHTML = window.MagenSecTemplates.profile.securitySettings(this.user);
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
