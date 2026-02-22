/**
 * API Client - Fetch wrapper with auth
 * No build step - pure vanilla JS
 */

import { auth } from './auth.js';
import { config, logger } from './config.js';

/**
 * Normalize API response to handle both camelCase and PascalCase
 * Also unwraps common envelope patterns: {Success, Data}, {success, data}
 */
function normalizeResponse(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => normalizeResponse(item));
    }
    
    // Unwrap common envelope patterns first
    let unwrapped = obj;
    
    // Pattern 1: {Success: bool, Data: {...}, Error: string, Message: string}
    // Pattern 2: {success: bool, data: {...}, error: string, message: string}
    const hasSuccess = 'Success' in obj || 'success' in obj;
    const hasData = 'Data' in obj || 'data' in obj;
    
    if (hasSuccess && hasData) {
        const successVal = obj.Success ?? obj.success;
        const dataVal = obj.Data ?? obj.data;
        const errorVal = obj.Error ?? obj.error;
        const messageVal = obj.Message ?? obj.message;
        
        // Create unwrapped object with normalized keys (lowercase) + original envelope
        unwrapped = {
            success: successVal,
            data: dataVal,
            error: errorVal,
            message: messageVal,
            // Preserve original envelope for backward compat
            Success: successVal,
            Data: dataVal,
            Error: errorVal,
            Message: messageVal
        };
    }
    
    // Create case-insensitive proxy
    const normalized = {};
    const lowerCaseMap = {};
    
    for (const key in unwrapped) {
        const value = unwrapped[key];
        normalized[key] = normalizeResponse(value);
        lowerCaseMap[key.toLowerCase()] = key;
    }
    
    return new Proxy(normalized, {
        get(target, prop) {
            // Direct property exists
            if (prop in target) return target[prop];
            
            // Try lowercase match (camelCase → PascalCase or vice versa)
            const lowerProp = prop.toString().toLowerCase();
            if (lowerProp in lowerCaseMap) {
                return target[lowerCaseMap[lowerProp]];
            }
            
            return undefined;
        },
        has(target, prop) {
            if (prop in target) return true;
            const lowerProp = prop.toString().toLowerCase();
            return lowerProp in lowerCaseMap;
        }
    });
}

export class ApiClient {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minute default
    }

    getCsrfToken() {
        // Try to get CSRF token from meta tag first
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            return metaTag.getAttribute('content');
        }
        
        // Fallback: get from cookie
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'XSRF-TOKEN' || name === 'csrf_token') {
                return decodeURIComponent(value);
            }
        }
        
        return null;
    }

    async request(endpoint, options = {}) {
        const url = `${config.API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add auth token if available
        const token = auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Add CSRF token for state-changing requests
        const method = options.method || 'GET';
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
            const csrfToken = this.getCsrfToken();
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            let data = null;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (e) {
                    // JSON content type but invalid JSON body
                    data = { success: false, message: 'Invalid JSON response from server' };
                }
            } else {
                // Non-JSON response (e.g. 404 HTML, or empty body)
                try {
                    const text = await response.text();
                    // Try to parse as JSON anyway just in case content-type was wrong
                    if (text && (text.startsWith('{') || text.startsWith('['))) {
                        data = JSON.parse(text);
                    } else {
                        // It's not JSON. If it's an error status, we might want the text.
                        // If it's success, maybe it's just empty.
                        data = { 
                            success: response.ok, 
                            message: response.ok ? 'Success' : (text || response.statusText) 
                        };
                    }
                } catch (e) {
                    data = { success: response.ok, message: response.statusText };
                }
            }
            
            // Distinguish between session auth errors (logout) vs permission errors (toast)
            // Session errors: token expired, invalid, or missing → logout
            // Permission errors: user not found, forbidden, etc. → show toast, don't logout
            const isSessionError = data && data.success === false && 
                (data.error === 'SESSION_EXPIRED' || data.error === 'INVALID_SESSION');
            const handleSessionExpiry = () => {
                auth.clearSession();
                window.location.href = '/portal/?expired=1';
            };

            if (!response.ok) {
                // Handle session expiration (logout)
                if (response.status === 401 || isSessionError) {
                    handleSessionExpiry();
                    // Throw to halt downstream handlers
                    const error = new Error('Session expired');
                    error.status = 401;
                    error.response = data;
                    throw error;
                }

                // Other HTTP errors (4xx/5xx) - let caller handle as regular error (will show toast)
                const error = new Error(data.message || data.error || `HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                error.statusText = response.statusText;
                error.response = data;
                throw error;
            }

            // If success=false but 200 OK (envelope pattern)
            // Handle session expiry explicitly, otherwise let caller decide (toast)
            if (data && data.success === false) {
                if (isSessionError) {
                    handleSessionExpiry();
                    const error = new Error('Session expired');
                    error.status = 401;
                    error.response = data;
                    throw error;
                }
                const error = new Error(data.message || data.error || 'Request failed');
                error.status = response.status;
                error.statusText = response.statusText;
                error.response = data;
                throw error;
            }

            // Normalize response to handle both camelCase and PascalCase
            return normalizeResponse(data);
        } catch (error) {
            // Log full error details (respects logger production settings)
            logger.error(`[API] ${endpoint} failed:`, error);
            
            // For network errors, throw user-friendly message (preserve original in debug)
            if (error instanceof TypeError && error.message.includes('fetch')) {
                const userError = new Error('Network error. Please check your connection.');
                userError.originalError = error;
                userError.status = 0;
                throw userError;
            }
            
            throw error;
        }
    }

    // Generic GET request with caching
    async get(endpoint, params = null, options = {}) {
        let url = endpoint;
        if (params) {
            const queryString = new URLSearchParams(params).toString();
            url = `${endpoint}?${queryString}`;
        }

        // Check cache unless explicitly bypassed
        const cacheKey = url;
        if (!options.skipCache) {
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                logger.debug(`[API] Cache hit: ${url}`);
                return cached.data;
            }
        }

        const data = await this.request(url, { method: 'GET' });
        
        // Store in cache
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        
        return data;
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
    }

    // Generic POST request
    async post(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // Generic PUT request
    async put(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined
        });
    }

    // Generic DELETE request
    async delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    }

    // === DASHBOARD ===
    async getUnifiedDashboard(orgId, params = {}) {
        return this.get(`/api/v1/orgs/${orgId}/dashboard`, params);
    }

    // === SNAPSHOTS ===
    async getTrendSnapshots(orgId, params = {}) {
        const query = {
            from: params.from,
            to: params.to
        };
        return this.get(`/api/v1/orgs/${orgId}/snapshots/trends`, query);
    }

    async triggerSnapshotCron(taskId) {
        return this.post('/api/v1/admin/cron/trigger', { taskId });
    }

    // === POSTURE ENGINE ===
    async getPostureSnapshot(orgId, params = {}) {
        return this.get(`/api/v1/orgs/${orgId}/posture`, params, { skipCache: params?.force });
    }

    // === DEVICES ===
    async getDevices(orgId, params = null, options = {}) {
        return this.get(`/api/v1/orgs/${orgId}/devices`, params, options);
    }

    async getDeviceSessions(orgId, deviceId, params = null, options = {}) {
        return this.get(`/api/v1/orgs/${orgId}/devices/${deviceId}/session`, params, options);
    }

    async getDevice(deviceId) {
        return this.get(`/api/v1/devices/${deviceId}`);
    }

    // Consolidated device state update (replaces separate block/enable endpoints)
    async updateDeviceState(orgId, deviceId, state, options = {}) {
        const { deleteTelemetry = false, reason } = options;
        return this.put(`/api/v1/orgs/${orgId}/devices/${deviceId}/state`, {
            state,
            deleteTelemetry,
            reason
        });
    }

    async deleteDevice(deviceId) {
        return this.delete(`/api/v1/devices/${deviceId}`);
    }

    async getDeviceTelemetry(deviceId, params = {}) {
        return this.get(`/api/v1/devices/${deviceId}/telemetry`, params);
    }

    // Unified device detail (combines device + telemetry + apps + cves in one call)
    async getDeviceDetailUnified(orgId, deviceId, options = {}) {
        const { include = 'telemetry,apps,cves', telemetryHistoryDays = 180, appLimit = 500, cveLimit = 500, telemetryHistoryLimit = 50 } = options;
        return this.get(`/api/v1/orgs/${orgId}/devices/${deviceId}/detail`, {
            include,
            telemetryHistoryDays,
            appLimit,
            cveLimit,
            telemetryHistoryLimit
        });
    }

    // === LICENSES ===
    async getLicenses(orgId) {
        return this.get(`/api/v1/orgs/${orgId}/licenses`);
    }

    async getLicense(licenseId) {
        return this.get(`/api/v1/licenses/${licenseId}`);
    }

    async createLicense(data) {
        return this.post('/api/v1/licenses', data);
    }

    async rotateLicense(licenseId) {
        return this.put(`/api/v1/licenses/${licenseId}/rotate`);
    }

    async toggleLicense(licenseId, orgId, enabled) {
        return this.put(`/api/v1/licenses/${licenseId}/state`, { orgId, active: enabled });
    }

    async deleteLicense(licenseId) {
        return this.delete(`/api/v1/licenses/${licenseId}`);
    }

    async adjustLicense(licenseId, { seats, totalCredits, forceAdjust = false, reason }) {
        return this.put(`/api/v1/admin/licenses/${licenseId}/adjustment`, {
            seats,
            totalCredits,
            forceAdjust,
            reason
        });
    }

    async adminGetStaleLicenses(params = {}) {
        return this.get('/api/v1/admin/licenses/stale', params);
    }

    // === ADMIN - ACCOUNTS ===
    async adminListAccounts(params = {}) {
        return this.get('/api/v1/admin/accounts', params);
    }

    // === ADMIN - EMAIL ===
    async adminSendTestEmail(orgId) {
        return this.post('/api/v1/admin/email/test', { orgId });
    }

    // === ORGANIZATION MEMBERS ===
    async getMembers(orgId) {
        return this.get(`/api/v1/orgs/${orgId}/members`);
    }

    async addMember(orgId, email, role = 'ReadWrite') {
        return this.post(`/api/v1/orgs/${orgId}/members`, { email, role });
    }

    async updateMemberRole(orgId, userId, role) {
        return this.put(`/api/v1/orgs/${orgId}/members/${userId}`, { role });
    }

    async removeMember(orgId, userId) {
        return this.delete(`/api/v1/orgs/${orgId}/members/${userId}`);
    }

    // === CONFIGURATION ===
    async getDefaultConfig() {
        return this.get('/api/v1/config/default');
    }

    async updateDefaultConfig(config) {
        return this.put('/api/v1/config/default', config);
    }

    async getOrgConfig(orgId) {
        return this.get(`/api/v1/config/orgs/${orgId}`);
    }

    async updateOrgConfig(orgId, config) {
        return this.put(`/api/v1/config/orgs/${orgId}`, config);
    }

    async getDeviceConfig(deviceId) {
        return this.get(`/api/v1/config/devices/${deviceId}`);
    }

    async updateDeviceConfig(deviceId, config) {
        return this.put(`/api/v1/config/devices/${deviceId}`, config);
    }

    // === USERS ===
    async getUsers(orgId) {
        return this.get('/api/v1/users', { orgId });
    }

    async getUser(email) {
        return this.get(`/api/v1/users/${email}`);
    }

    async updateUser(email, data) {
        return this.put(`/api/v1/users/${email}`, data);
    }

    async getUserOrgs(email) {
        return this.get(`/api/v1/users/${email}/orgs`);
    }

    // === ADMIN - ORGANIZATIONS ===
    async adminGetOrgs() {
        return this.get('/api/v1/admin/orgs');
    }

    async adminGetOrg(orgId) {
        return this.get(`/api/v1/admin/orgs/${orgId}`);
    }

    async adminCreateOrg(data) {
        return this.post('/api/v1/admin/orgs', data);
    }

    async adminUpdateOrg(orgId, data) {
        return this.put(`/api/v1/admin/orgs/${orgId}`, data);
    }

    async adminDisableOrg(orgId) {
        return this.put(`/api/v1/admin/orgs/${orgId}/disable`);
    }

    async adminDeleteOrg(orgId) {
        return this.delete(`/api/v1/admin/orgs/${orgId}`);
    }

    // === ADMIN - USERS ===
    async adminGetAllUsers() {
        return this.get('/api/v1/admin/users');
    }

    async adminElevateUser(userId, orgName, seats = 20, days = 365) {
        return this.post(`/api/v1/admin/users/${userId}/elevate`, {
            orgName,
            seats,
            days
        });
    }

    async adminDowngradeUser(userId) {
        return this.post(`/api/v1/admin/users/${userId}/downgrade`);
    }

    // === ADMIN - TELEMETRY CONFIG ===
    async adminGetTelemetryConfig(orgId) {
        return this.get(`/api/v1/admin/telemetry/config/${orgId}`);
    }

    async adminUpdateTelemetryConfig(orgId, config) {
        return this.put(`/api/v1/admin/telemetry/config/${orgId}`, config);
    }

    // === ADMIN - CRON MANAGEMENT ===
    async adminGetAvailableCronTasks() {
        return this.get('/api/v1/admin/cron/available-tasks');
    }

    async adminTriggerCron(taskId) {
        return this.post('/api/v1/admin/cron/trigger', { taskId });
    }

    async adminResetRemediation(orgId, resetApps = true, resetCves = true) {
        return this.post('/api/v1/admin/remediation/reset', { orgId, resetApps, resetCves });
    }

    // === VULNERABILITIES ===
    async getVulnerabilities(orgId, params) {
        return this.get(`/api/v1/orgs/${orgId}/vulnerabilities`, params);
    }

    // === ORG INSIGHTS (CVE Details, Threat Analysis, etc.) ===
    // Endpoint: GET /api/v1/orgs/{orgId}/detail?cves={cveId}
    // Org access is enforced at routing level by OrgAccessMiddleware
    async getOrgInsights(orgId, { cves = null } = {}) {
        let url = `/api/v1/orgs/${orgId}/detail`;
        if (cves) {
            url += `?cves=${encodeURIComponent(cves)}`;
        }
        return this.get(url);
    }

    // Convenience method for getting CVE details for organization
    async getCveDetails(cveId, orgId) {
        return this.getOrgInsights(orgId, { cves: cveId });
    }

    // === ANALYTICS & TRENDS ===
    async getSoftwareInventory(orgId) {
        return this.get(`/api/v1/orgs/${orgId}/apps`);
    }

    // === AI ANALYST (ORG-SCOPED) ===
    // Note: All AI endpoints are org-scoped. Use these methods from pages:
    // - POST /api/v1/orgs/{orgId}/ai-analyst/run - Generate report
    // - POST /api/v1/orgs/{orgId}/ai-analyst/ask - Ask question
    // - GET /api/v1/orgs/{orgId}/ai-analyst/reports - List reports
    // - GET /api/v1/orgs/{orgId}/ai-analyst/reports/{reportId} - Get report detail
    
    async generateAIReport(orgId, data) {
        // Use unified AI report generation endpoint
        return this.post(`/api/v1/orgs/${orgId}/ai/reports/generate`, data);
    }

    async askAIAnalyst(orgId, data) {
        return this.post(`/api/v1/orgs/${orgId}/ai-analyst/ask`, data);
    }

    async getAIReports(orgId, params = {}) {
        // Listing endpoint is not currently mapped server-side; placeholder
        // Prefer fetching by specific date via getAIReportByDate
        const today = new Date();
        const yyyymmdd = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
        return this.getAIReportByDate(orgId, yyyymmdd);
    }

    async getAIReportByDate(orgId, date) {
        // Fetch AI report by YYYYMMDD date
        return this.get(`/api/v1/orgs/${orgId}/ai/reports/${date}`);
    }

    async getLatestAIReport(orgId) {
        // Use dedicated /latest endpoint to get most recent report
        return this.get(`/api/v1/orgs/${orgId}/ai/reports/latest`);
    }

    async emailAIReportPDF(orgId) {
        // Send latest report as PDF via email
        return this.post(`/api/v1/orgs/${orgId}/ai/reports/email-pdf`, {});
    }

    async getAuditLogs(orgId, params = {}) {
        // Get audit logs with optional filtering
        const queryParams = new URLSearchParams();
        if (params.eventType) queryParams.append('eventType', params.eventType);
        if (params.subType) queryParams.append('subType', params.subType);
        if (params.limit) queryParams.append('limit', params.limit);
        const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return this.get(`/api/v1/orgs/${orgId}/audit${qs}`);
    }

    async getReportPreview(orgId, refresh = false) {
        // Get report preview data. Pass ?refresh=true to bypass cached email HTML and regenerate.
        const qs = refresh ? '?refresh=true' : '';
        return this.get(`/api/v1/orgs/${orgId}/reports/preview${qs}`);
    }

    async sendReport(orgId, reportType, recipient = 'owner', customEmail = '') {
        // Send security report email to selected recipient (owner/admin/custom)
        return this.post(`/api/v1/orgs/${orgId}/reports/send`, { reportType, recipient, customEmail });
    }

    // === TEST SEEDING ===
    async seedTestData(data) {
        return this.post('/api/v1/test/seed', data);
    }

    async unseedTestData() {
        return this.delete('/api/v1/test/unseed');
    }

    // === HEALTH ===
    async getHealth() {
        return this.get('/health');
    }

    // === ADMIN ===
    async getAdminOrgs() {
        return this.get('/api/v1/admin/orgs');
    }

    async createOrg(data) {
        return this.post('/api/v1/admin/orgs', data);
    }

    async updateOrg(orgId, data) {
        return this.put(`/api/v1/admin/orgs/${orgId}`, data);
    }

    async deleteOrg(orgId) {
        return this.delete(`/api/v1/admin/orgs/${orgId}`);
    }

    async getAdminUsers() {
        return this.get('/api/v1/admin/users');
    }

    async elevateUser(userId, data) {
        return this.post(`/api/v1/admin/users/${userId}/elevate`, data);
    }

    async downgradeUser(userId) {
        return this.post(`/api/v1/admin/users/${userId}/downgrade`);
    }

    // === RESPONSE ACTIONS ===
    async queueCommand(orgId, commandType, targetDevices, parameters) {
        return this.post(`/api/v1/orgs/${orgId}/response/commands`, {
            commandType,
            targetDevices: targetDevices ?? null,
            parameters: parameters ?? null
        });
    }

    async getCommands(orgId, deviceId, limit) {
        const params = new URLSearchParams();
        if (deviceId) params.set('deviceId', deviceId);
        if (limit) params.set('limit', limit);
        const qs = params.toString();
        return this.get(`/api/v1/orgs/${orgId}/response/commands${qs ? '?' + qs : ''}`);
    }

    async getCommandDetail(orgId, commandId) {
        return this.get(`/api/v1/orgs/${orgId}/response/commands/${commandId}`);
    }

    async cancelCommand(orgId, commandId) {
        return this.delete(`/api/v1/orgs/${orgId}/response/commands/${commandId}`);
    }

}

// Global instance
export const api = new ApiClient();
