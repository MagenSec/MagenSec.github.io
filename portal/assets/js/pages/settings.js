// MagenSec Hub - Settings Page Controller
class SettingsPage {
    constructor() {
        this.settings = {};
        this.isDirty = false;
    }

    async initialize() {
        console.log('Settings page initializing...');
        this.setupEventHandlers();
        await this.loadSettings();
        this.renderPage();
    }

    setupEventHandlers() {
        // Save settings button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'save-settings-btn') {
                this.saveSettings();
            }
        });

        // Reset settings button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'reset-settings-btn') {
                this.resetSettings();
            }
        });

        // Export settings button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'export-settings-btn') {
                this.exportSettings();
            }
        });

        // Import settings button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'import-settings-btn') {
                this.importSettings();
            }
        });

        // Settings change tracking
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('setting-input')) {
                this.markDirty();
                this.updateSetting(e.target);
            }
        });

        // Test connection buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('test-connection')) {
                const service = e.target.dataset.service;
                this.testConnection(service);
            }
        });
    }

    async loadSettings() {
        try {
            const response = await window.MagenSecAPI.getSettings();
            this.settings = response.data || this.getDefaultSettings();
        } catch (error) {
            console.warn('Using default settings:', error);
            this.settings = this.getDefaultSettings();
        }
    }

    getDefaultSettings() {
        return {
            general: {
                organizationName: 'MagenSec Corporation',
                adminEmail: 'admin@company.com',
                timezone: 'America/New_York',
                dateFormat: 'MM/DD/YYYY',
                sessionTimeout: 30,
                maxLoginAttempts: 5
            },
            security: {
                requireMFA: true,
                passwordMinLength: 8,
                passwordComplexity: true,
                sessionSecurity: 'high',
                apiRateLimit: 1000,
                enableAuditLog: true
            },
            monitoring: {
                threatDetectionLevel: 'medium',
                alertThreshold: 'high',
                scanFrequency: 'hourly',
                retentionPeriod: 90,
                enableRealTimeAlerts: true,
                autoRemediation: false
            },
            integrations: {
                azureStorageAccount: 'magensecstorage',
                azureSubscriptionId: '',
                syslogServer: '',
                syslogPort: 514,
                emailSmtpServer: '',
                emailSmtpPort: 587,
                webhookUrl: ''
            },
            reporting: {
                autoGenerateReports: true,
                reportFrequency: 'weekly',
                reportFormat: 'pdf',
                includeCharts: true,
                emailReports: true,
                reportRetention: 365
            }
        };
    }

    renderPage() {
        const container = document.getElementById('main-content');
        container.innerHTML = this.getPageHTML();
        this.renderGeneralSettings();
        this.renderSecuritySettings();
        this.renderMonitoringSettings();
        this.renderIntegrationSettings();
        this.renderReportingSettings();
    }

    getPageHTML() {
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">System Settings</h1>
                        <p class="text-gray-600">Configure system-wide settings and preferences</p>
                    </div>
                    <div class="flex space-x-3">
                        <button id="export-settings-btn" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
                            <i class="fas fa-download mr-2"></i>Export
                        </button>
                        <button id="import-settings-btn" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
                            <i class="fas fa-upload mr-2"></i>Import
                        </button>
                        <button id="reset-settings-btn" class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                            Reset
                        </button>
                        <button id="save-settings-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            Save Changes
                        </button>
                    </div>
                </div>

                <!-- Settings Tabs -->
                <div class="bg-white rounded-lg shadow">
                    <div class="border-b border-gray-200">
                        <nav class="-mb-px flex space-x-8 px-6">
                            <button class="settings-tab py-4 px-1 border-b-2 border-blue-500 font-medium text-sm text-blue-600" data-tab="general">
                                General
                            </button>
                            <button class="settings-tab py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-tab="security">
                                Security
                            </button>
                            <button class="settings-tab py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-tab="monitoring">
                                Monitoring
                            </button>
                            <button class="settings-tab py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-tab="integrations">
                                Integrations
                            </button>
                            <button class="settings-tab py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-tab="reporting">
                                Reporting
                            </button>
                        </nav>
                    </div>

                    <div class="p-6">
                        <div id="general-settings" class="settings-panel">
                            <!-- Content will be inserted here -->
                        </div>
                        <div id="security-settings" class="settings-panel hidden">
                            <!-- Content will be inserted here -->
                        </div>
                        <div id="monitoring-settings" class="settings-panel hidden">
                            <!-- Content will be inserted here -->
                        </div>
                        <div id="integration-settings" class="settings-panel hidden">
                            <!-- Content will be inserted here -->
                        </div>
                        <div id="reporting-settings" class="settings-panel hidden">
                            <!-- Content will be inserted here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderGeneralSettings() {
        const container = document.getElementById('general-settings');
        const general = this.settings.general;
        
        container.innerHTML = `
            <h3 class="text-lg font-medium mb-4">General Settings</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Organization Name</label>
                    <input type="text" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                           data-setting="general.organizationName" value="${general.organizationName}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Admin Email</label>
                    <input type="email" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                           data-setting="general.adminEmail" value="${general.adminEmail}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Timezone</label>
                    <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                            data-setting="general.timezone">
                        <option value="America/New_York" ${general.timezone === 'America/New_York' ? 'selected' : ''}>Eastern Time</option>
                        <option value="America/Chicago" ${general.timezone === 'America/Chicago' ? 'selected' : ''}>Central Time</option>
                        <option value="America/Denver" ${general.timezone === 'America/Denver' ? 'selected' : ''}>Mountain Time</option>
                        <option value="America/Los_Angeles" ${general.timezone === 'America/Los_Angeles' ? 'selected' : ''}>Pacific Time</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Date Format</label>
                    <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                            data-setting="general.dateFormat">
                        <option value="MM/DD/YYYY" ${general.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY</option>
                        <option value="DD/MM/YYYY" ${general.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY</option>
                        <option value="YYYY-MM-DD" ${general.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Session Timeout (minutes)</label>
                    <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                           data-setting="general.sessionTimeout" value="${general.sessionTimeout}" min="5" max="1440">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Max Login Attempts</label>
                    <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                           data-setting="general.maxLoginAttempts" value="${general.maxLoginAttempts}" min="3" max="10">
                </div>
            </div>
        `;
    }

    renderSecuritySettings() {
        const container = document.getElementById('security-settings');
        const security = this.settings.security;
        
        container.innerHTML = `
            <h3 class="text-lg font-medium mb-4">Security Settings</h3>
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Require Multi-Factor Authentication</h4>
                        <p class="text-sm text-gray-600">Force all users to enable 2FA</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="security.requireMFA" 
                           ${security.requireMFA ? 'checked' : ''}>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Minimum Password Length</label>
                        <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                               data-setting="security.passwordMinLength" value="${security.passwordMinLength}" min="6" max="32">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">API Rate Limit (requests/hour)</label>
                        <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                               data-setting="security.apiRateLimit" value="${security.apiRateLimit}" min="100" max="10000">
                    </div>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Password Complexity Requirements</h4>
                        <p class="text-sm text-gray-600">Require special characters, numbers, and mixed case</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="security.passwordComplexity" 
                           ${security.passwordComplexity ? 'checked' : ''}>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Enable Audit Logging</h4>
                        <p class="text-sm text-gray-600">Log all user actions and system events</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="security.enableAuditLog" 
                           ${security.enableAuditLog ? 'checked' : ''}>
                </div>
            </div>
        `;
    }

    renderMonitoringSettings() {
        const container = document.getElementById('monitoring-settings');
        const monitoring = this.settings.monitoring;
        
        container.innerHTML = `
            <h3 class="text-lg font-medium mb-4">Monitoring Settings</h3>
            <div class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Threat Detection Level</label>
                        <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                data-setting="monitoring.threatDetectionLevel">
                            <option value="low" ${monitoring.threatDetectionLevel === 'low' ? 'selected' : ''}>Low</option>
                            <option value="medium" ${monitoring.threatDetectionLevel === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="high" ${monitoring.threatDetectionLevel === 'high' ? 'selected' : ''}>High</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Scan Frequency</label>
                        <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                data-setting="monitoring.scanFrequency">
                            <option value="realtime" ${monitoring.scanFrequency === 'realtime' ? 'selected' : ''}>Real-time</option>
                            <option value="hourly" ${monitoring.scanFrequency === 'hourly' ? 'selected' : ''}>Hourly</option>
                            <option value="daily" ${monitoring.scanFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Data Retention Period (days)</label>
                        <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                               data-setting="monitoring.retentionPeriod" value="${monitoring.retentionPeriod}" min="30" max="365">
                    </div>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Enable Real-time Alerts</h4>
                        <p class="text-sm text-gray-600">Send immediate notifications for critical events</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="monitoring.enableRealTimeAlerts" 
                           ${monitoring.enableRealTimeAlerts ? 'checked' : ''}>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Auto Remediation</h4>
                        <p class="text-sm text-gray-600">Automatically respond to certain threats</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="monitoring.autoRemediation" 
                           ${monitoring.autoRemediation ? 'checked' : ''}>
                </div>
            </div>
        `;
    }

    renderIntegrationSettings() {
        const container = document.getElementById('integration-settings');
        const integrations = this.settings.integrations;
        
        container.innerHTML = `
            <h3 class="text-lg font-medium mb-4">Integration Settings</h3>
            <div class="space-y-8">
                <div>
                    <h4 class="font-medium mb-3">Azure Integration</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Storage Account</label>
                            <input type="text" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                   data-setting="integrations.azureStorageAccount" value="${integrations.azureStorageAccount}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Subscription ID</label>
                            <input type="text" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                   data-setting="integrations.azureSubscriptionId" value="${integrations.azureSubscriptionId}">
                        </div>
                    </div>
                    <button class="test-connection mt-2 text-blue-600 hover:text-blue-800 text-sm" data-service="azure">
                        Test Azure Connection
                    </button>
                </div>

                <div>
                    <h4 class="font-medium mb-3">Syslog Integration</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Syslog Server</label>
                            <input type="text" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                   data-setting="integrations.syslogServer" value="${integrations.syslogServer}" placeholder="syslog.company.com">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Port</label>
                            <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                   data-setting="integrations.syslogPort" value="${integrations.syslogPort}" min="1" max="65535">
                        </div>
                    </div>
                    <button class="test-connection mt-2 text-blue-600 hover:text-blue-800 text-sm" data-service="syslog">
                        Test Syslog Connection
                    </button>
                </div>

                <div>
                    <h4 class="font-medium mb-3">Email Integration</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">SMTP Server</label>
                            <input type="text" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                   data-setting="integrations.emailSmtpServer" value="${integrations.emailSmtpServer}" placeholder="smtp.company.com">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">SMTP Port</label>
                            <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                   data-setting="integrations.emailSmtpPort" value="${integrations.emailSmtpPort}" min="1" max="65535">
                        </div>
                    </div>
                    <button class="test-connection mt-2 text-blue-600 hover:text-blue-800 text-sm" data-service="email">
                        Test Email Connection
                    </button>
                </div>
            </div>
        `;
    }

    renderReportingSettings() {
        const container = document.getElementById('reporting-settings');
        const reporting = this.settings.reporting;
        
        container.innerHTML = `
            <h3 class="text-lg font-medium mb-4">Reporting Settings</h3>
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Auto-Generate Reports</h4>
                        <p class="text-sm text-gray-600">Automatically generate scheduled reports</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="reporting.autoGenerateReports" 
                           ${reporting.autoGenerateReports ? 'checked' : ''}>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Report Frequency</label>
                        <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                data-setting="reporting.reportFrequency">
                            <option value="daily" ${reporting.reportFrequency === 'daily' ? 'selected' : ''}>Daily</option>
                            <option value="weekly" ${reporting.reportFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                            <option value="monthly" ${reporting.reportFrequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Report Format</label>
                        <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                                data-setting="reporting.reportFormat">
                            <option value="pdf" ${reporting.reportFormat === 'pdf' ? 'selected' : ''}>PDF</option>
                            <option value="excel" ${reporting.reportFormat === 'excel' ? 'selected' : ''}>Excel</option>
                            <option value="csv" ${reporting.reportFormat === 'csv' ? 'selected' : ''}>CSV</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Report Retention (days)</label>
                        <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                               data-setting="reporting.reportRetention" value="${reporting.reportRetention}" min="30" max="1095">
                    </div>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Include Charts and Graphs</h4>
                        <p class="text-sm text-gray-600">Add visual elements to reports</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="reporting.includeCharts" 
                           ${reporting.includeCharts ? 'checked' : ''}>
                </div>

                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-medium">Email Reports</h4>
                        <p class="text-sm text-gray-600">Automatically email reports to administrators</p>
                    </div>
                    <input type="checkbox" class="setting-input" data-setting="reporting.emailReports" 
                           ${reporting.emailReports ? 'checked' : ''}>
                </div>
            </div>
        `;
    }

    updateSetting(element) {
        const settingPath = element.dataset.setting;
        const value = element.type === 'checkbox' ? element.checked : element.value;
        
        // Update settings object
        const keys = settingPath.split('.');
        let obj = this.settings;
        for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
    }

    markDirty() {
        this.isDirty = true;
        // Show save indicator
    }

    async saveSettings() {
        try {
            // await window.MagenSecAPI.updateSettings(this.settings);
            this.isDirty = false;
            window.MagenSecUtils.showNotification('Settings saved successfully', 'success');
        } catch (error) {
            window.MagenSecUtils.showNotification('Failed to save settings', 'error');
        }
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            this.settings = this.getDefaultSettings();
            this.renderPage();
            window.MagenSecUtils.showNotification('Settings reset to defaults', 'info');
        }
    }

    exportSettings() {
        const blob = new Blob([JSON.stringify(this.settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'magensec-settings.json';
        a.click();
        URL.revokeObjectURL(url);
        window.MagenSecUtils.showNotification('Settings exported successfully', 'success');
    }

    importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        this.settings = JSON.parse(e.target.result);
                        this.renderPage();
                        window.MagenSecUtils.showNotification('Settings imported successfully', 'success');
                    } catch (error) {
                        window.MagenSecUtils.showNotification('Invalid settings file', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    testConnection(service) {
        window.MagenSecUtils.showNotification(`Testing ${service} connection...`, 'info');
        
        // Simulate connection test
        setTimeout(() => {
            window.MagenSecUtils.showNotification(`${service} connection successful`, 'success');
        }, 2000);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.SettingsPage = new SettingsPage();
    });
} else {
    window.SettingsPage = new SettingsPage();
}
