/**
 * Settings Page Templates
 * 
 * HTML templates for various settings sections
 */

// Make settings templates available globally
window.MagenSecTemplates = window.MagenSecTemplates || {};
window.MagenSecTemplates.settings = {};

window.MagenSecTemplates.settings.general = `
    <h3 class="text-lg font-medium mb-4">General Settings</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
            <label class="block text-sm font-medium text-gray-700">Organization Name</label>
            <input type="text" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                   data-setting="general.organizationName" value="{{organizationName}}">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">Admin Email</label>
            <input type="email" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                   data-setting="general.adminEmail" value="{{adminEmail}}">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">Timezone</label>
            <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                    data-setting="general.timezone">
                <option value="America/New_York" {{timezoneEasternSelected}}>Eastern Time</option>
                <option value="America/Chicago" {{timezoneCentralSelected}}>Central Time</option>
                <option value="America/Denver" {{timezoneMountainSelected}}>Mountain Time</option>
                <option value="America/Los_Angeles" {{timezonePacificSelected}}>Pacific Time</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">Date Format</label>
            <select class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                    data-setting="general.dateFormat">
                <option value="MM/DD/YYYY" {{dateFormatUSSelected}}>MM/DD/YYYY</option>
                <option value="DD/MM/YYYY" {{dateFormatEUSelected}}>DD/MM/YYYY</option>
                <option value="YYYY-MM-DD" {{dateFormatISOSelected}}>YYYY-MM-DD</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">Session Timeout (minutes)</label>
            <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                   data-setting="general.sessionTimeout" value="{{sessionTimeout}}" min="5" max="1440">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">Max Login Attempts</label>
            <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                   data-setting="general.maxLoginAttempts" value="{{maxLoginAttempts}}" min="3" max="10">
        </div>
    </div>
`;

window.MagenSecTemplates.settings.security = `
    <h3 class="text-lg font-medium mb-4">Security Settings</h3>
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <div>
                <h4 class="font-medium">Two-Factor Authentication</h4>
                <p class="text-sm text-gray-600">Require 2FA for all users</p>
            </div>
            <input type="checkbox" class="setting-input" data-setting="security.requireTwoFactor" {{twoFactorChecked}}>
        </div>
        
        <div class="flex justify-between items-center">
            <div>
                <h4 class="font-medium">Password Complexity</h4>
                <p class="text-sm text-gray-600">Enforce strong password requirements</p>
            </div>
            <input type="checkbox" class="setting-input" data-setting="security.enforcePasswordComplexity" {{passwordComplexityChecked}}>
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700">Password Minimum Length</label>
            <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                   data-setting="security.passwordMinLength" value="{{passwordMinLength}}" min="8" max="32">
        </div>
        
        <div>
            <label class="block text-sm font-medium text-gray-700">Session Inactivity Timeout (minutes)</label>
            <input type="number" class="setting-input mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                   data-setting="security.sessionInactivityTimeout" value="{{sessionInactivityTimeout}}" min="5" max="60">
        </div>
    </div>
`;