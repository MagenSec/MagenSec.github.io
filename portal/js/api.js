/**
 * API Client - Fetch wrapper with auth
 * No build step - pure vanilla JS
 */

import { auth } from './auth.js';
import { config, logger } from './config.js';
import toast from './toast.js';
import { rewindContext } from './rewindContext.js';

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
        this.degradedRetryState = new Map();
        this.degradedRetryDelayMs = 30000;
        this.degradedRetryMaxAttempts = 3;
    }

    extractFreshness(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        const directFreshness = payload.freshness;
        if (directFreshness && typeof directFreshness === 'object') {
            return directFreshness;
        }

        const dataFreshness = payload.data?.freshness;
        if (dataFreshness && typeof dataFreshness === 'object') {
            return dataFreshness;
        }

        const metricsFreshness = payload.data?.platformSummary?.freshness || payload.data?.Freshness;
        if (metricsFreshness && typeof metricsFreshness === 'object') {
            return metricsFreshness;
        }

        return null;
    }

    isDegradedSnapshotResponse(payload) {
        const freshness = this.extractFreshness(payload);
        if (!freshness) {
            return false;
        }

        return freshness.degraded === true
            && (typeof freshness.strategy !== 'string' || freshness.strategy.includes('snapshot'));
    }

    scheduleDegradedRecovery(cacheKey, requestUrl) {
        if (this.degradedRetryState.has(cacheKey)) {
            return;
        }

        const state = {
            attempts: 0,
            timer: null
        };
        this.degradedRetryState.set(cacheKey, state);

        const runAttempt = async () => {
            state.attempts += 1;
            try {
                const probeData = await this.request(requestUrl, {
                    method: 'GET',
                    headers: {
                        'X-SWE-Recovery-Probe': '1'
                    }
                });

                if (!this.isDegradedSnapshotResponse(probeData)) {
                    this.cache.set(cacheKey, { data: probeData, timestamp: Date.now() });
                    this.degradedRetryState.delete(cacheKey);

                    window.dispatchEvent(new CustomEvent('api:degraded-recovered', {
                        detail: {
                            cacheKey,
                            attempts: state.attempts,
                            recoveredAt: new Date().toISOString()
                        }
                    }));
                    return;
                }
            } catch (error) {
                logger.warn('[API] degraded recovery probe failed', {
                    cacheKey,
                    attempts: state.attempts,
                    error: error?.message || String(error)
                });
            }

            if (state.attempts >= this.degradedRetryMaxAttempts) {
                this.degradedRetryState.delete(cacheKey);

                toast.warning('Security signal is delayed. Showing latest cached intelligence. Please refresh later.');
                window.dispatchEvent(new CustomEvent('api:degraded-alert', {
                    detail: {
                        cacheKey,
                        attempts: state.attempts,
                        exhaustedAt: new Date().toISOString()
                    }
                }));
                return;
            }

            state.timer = setTimeout(runAttempt, this.degradedRetryDelayMs);
        };

        state.timer = setTimeout(runAttempt, this.degradedRetryDelayMs);
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

        // Block state-changing requests while Time Warp is active.
        // Allow read-only analytical POST endpoints that explicitly support temporal snapshots.
        const method = options.method || 'GET';
        const isMutatingMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
        const isTimeWarpReadOnlyPost =
            method.toUpperCase() === 'POST'
            && /\/ai-analyst\/ask(\?|$)/i.test(endpoint)
            || method.toUpperCase() === 'POST'
            && /\/ai\/chat-session(\?|$)/i.test(endpoint);
        const isTimeWarpBoundedPost =
            method.toUpperCase() === 'POST'
            && /\/ai\/reports\/generate(\?|$)/i.test(endpoint);
        const isTimeWarpBoundedSideEffectPost =
            method.toUpperCase() === 'POST'
            && /\/ai\/reports\/email-pdf(\?|$)/i.test(endpoint);

        if (isMutatingMethod && rewindContext.isActive() && !isTimeWarpReadOnlyPost && !isTimeWarpBoundedPost && !isTimeWarpBoundedSideEffectPost) {
            const dateLabel = rewindContext.getDateLabel?.() || 'a past date';
            window.toast?.show(
                `⏸ Observer Mode — you are viewing ${dateLabel}. Exit Time Warp to make changes.`,
                'warning',
                4500
            );
            return Promise.reject(new Error('TIME_WARP_READ_ONLY'));
        }

        // Add auth token if available
        const token = auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Send effective date as request guardrail for read paths.
        // Query filters may still be applied by endpoints, but cannot exceed this upper bound.
        const effectiveDate = this.getEffectiveDate();
        if (effectiveDate) {
            headers['X-Effective-Date'] = effectiveDate;
        }

        // Add CSRF token for state-changing requests (reuses `method` declared above)
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
            const apiErrorCode = error?.response?.error || error?.response?.Error;
            const isExpectedAiReportMiss = apiErrorCode === 'NOT_FOUND' && /\/ai\/reports(\/|\?|$)/i.test(endpoint);

            if (isExpectedAiReportMiss) {
                logger.info(`[API] ${endpoint} returned no report for the requested date/context`);
            } else {
                // Log full error details (respects logger production settings)
                logger.error(`[API] ${endpoint} failed:`, error);
            }
            
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
            const sanitizedParams = Object.fromEntries(
                Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
            );
            const queryString = new URLSearchParams(sanitizedParams).toString();
            url = `${endpoint}?${queryString}`;
        }

        // Check cache unless explicitly bypassed
        const cacheKey = url;
        if (!options.skipCache) {
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                logger.debug(`[API] Cache hit: ${url}`);

                if (!options.skipDegradedHandling && this.isDegradedSnapshotResponse(cached.data)) {
                    // Don't schedule recovery probes for historical (rewind) requests
                    if (!rewindContext.isActive()) {
                        this.scheduleDegradedRecovery(cacheKey, url);
                    }
                }

                return cached.data;
            }
        }

        const data = await this.request(url, { method: 'GET' });
        
        // Store in cache
        this.cache.set(cacheKey, { data, timestamp: Date.now() });

        if (!options.skipDegradedHandling && this.isDegradedSnapshotResponse(data)) {
            // Don't schedule recovery probes for historical (rewind) requests
            if (!rewindContext.isActive()) {
                this.scheduleDegradedRecovery(cacheKey, url);
            }
        }
        
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

    // Generic PATCH request
    async patch(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: data ? JSON.stringify(data) : undefined
        });
    }

    // === DATE HELPERS ===

    /**
     * Returns the effective date string to use for API calls.
     * When rewind mode is active, returns the rewind date (yyyyMMdd).
     * Otherwise returns null (live data).
     */
    getEffectiveDate() {
        return rewindContext.getDate();
    }

    // === DASHBOARD ===
    async getUnifiedDashboard(orgId, params = {}) {
        const date = this.getEffectiveDate();
        // Dashboard has its own SWR (localStorage cache → background refresh),
        // so skip api.js degraded recovery to avoid redundant probe calls.
        return this.get(`/api/v1/orgs/${orgId}/dashboard`, date ? { ...params, date } : params, { skipDegradedHandling: true });
    }

    async getLatestComplianceSnapshot(orgId) {
        const date = this.getEffectiveDate();
        return this.get(`/api/v1/orgs/${orgId}/compliance/latest`, date ? { date } : null);
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

    // === DELTA ===
    /**
     * Security posture delta between two dates.
     * @param {string} orgId
     * @param {string} from - yyyyMMdd
     * @param {string} to   - yyyyMMdd (defaults to today)
     */
    async getOrgDelta(orgId, from, to) {
        const today = rewindContext.toDateKey(new Date());
        return this.get(`/api/v1/orgs/${orgId}/delta`, { from, to: to || today }, { skipCache: true });
    }

    /**
     * Export audit evidence pack as a ZIP file (browser download).
     * Uses the bearer token from localStorage; triggers a file download.
     * @param {string} orgId
     * @param {string?} date - yyyyMMdd, optional — defaults to today on server
     */
    async exportAuditEvidence(orgId, date) {
        const token = localStorage.getItem('auth_token') || '';
        const qs = date ? `?date=${date}` : '';
        const res = await fetch(`/api/v1/orgs/${orgId}/audit/export${qs}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.message || `Export failed (${res.status})`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const today = new Date();
        const label = date || rewindContext.toDateKey(today);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-evidence-${orgId}-${label}.zip`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // === POSTURE ENGINE ===
    async getPostureSnapshot(orgId, params = {}) {
        const date = this.getEffectiveDate();
        const merged = date ? { ...params, date } : params;
        return this.get(`/api/v1/orgs/${orgId}/posture`, merged, { skipCache: merged?.force });
    }

    // === DEVICES ===
    async getDevices(orgId, params = null, options = {}) {
        const date = this.getEffectiveDate();
        const merged = date ? { ...(params || {}), date } : params;
        return this.get(`/api/v1/orgs/${orgId}/devices`, merged, options);
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
        const {
            include = 'telemetry,apps,cves',
            telemetryHistoryDays = 180,
            appLimit = 500,
            cveLimit = 500,
            telemetryHistoryLimit = 50,
            includeSummary = false,
            includeCachedSummary = false
        } = options;

        const includeParts = String(include || '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);

        if (includeSummary && !includeParts.includes('summary')) {
            includeParts.push('summary');
        }

        if (includeCachedSummary && !includeParts.includes('cached-summary') && !includeParts.includes('summary')) {
            includeParts.push('cached-summary');
        }

        return this.get(`/api/v1/orgs/${orgId}/devices/${deviceId}/detail`, {
            include: includeParts.join(','),
            includeSummary: includeSummary || undefined,
            includeCachedSummary: includeCachedSummary || undefined,
            telemetryHistoryDays,
            appLimit,
            cveLimit,
            telemetryHistoryLimit
        });
    }

    // === LICENSES ===
    async getLicenses(orgId) {
        return this.get('/api/v1/licenses/action', { operation: 'list', orgId });
    }

    async getLicense(licenseId, orgId) {
        return this.get('/api/v1/licenses/action', { operation: 'get', orgId, licenseId });
    }

    async createLicense(data, operation = 'create-new') {
        return this.post('/api/v1/licenses/action', { operation, ...data });
    }

    async rotateLicense(licenseId, orgId) {
        return this.post('/api/v1/licenses/action', { operation: 'rotate', licenseId, orgId });
    }

    async toggleLicense(licenseId, orgId, enabled) {
        return this.post('/api/v1/licenses/action', { operation: 'state', licenseId, orgId, active: enabled });
    }

    async deleteLicense(licenseId, orgId) {
        return this.post('/api/v1/licenses/action', { operation: 'delete', licenseId, orgId });
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

    // === ADMIN - PAYMENTS / INVOICES ===
    async adminListPendingPayments() {
        return this.get('/api/v1/admin/payments/pending');
    }

    async adminApprovePayment(orgId, paymentId, data) {
        return this.post(`/api/v1/admin/payments/${encodeURIComponent(orgId)}/${encodeURIComponent(paymentId)}/approve`, data);
    }

    async adminRejectPayment(orgId, paymentId, data) {
        return this.post(`/api/v1/admin/payments/${encodeURIComponent(orgId)}/${encodeURIComponent(paymentId)}/reject`, data);
    }

    // === ADMIN - MAGICODES ===
    async adminListMagiCodes(params = {}) {
        return this.get('/api/v1/admin/magi-codes', params);
    }

    async adminCreateMagiCode(data) {
        return this.post('/api/v1/admin/magi-codes', data);
    }

    async adminUpdateMagiCode(code, data) {
        return this.put(`/api/v1/admin/magi-codes/${encodeURIComponent(code)}`, data);
    }

    async adminDisableMagiCode(code, comment = null) {
        return this.post(`/api/v1/admin/magi-codes/${encodeURIComponent(code)}/disable`, { comment });
    }

    async adminDeleteMagiCode(code, comment = null) {
        return this.request(`/api/v1/admin/magi-codes/${encodeURIComponent(code)}`, {
            method: 'DELETE',
            body: JSON.stringify({ comment })
        });
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
        return this.get(`/api/v1/admin/telemetry/config/orgs/${orgId}`);
    }

    async adminUpdateTelemetryConfig(orgId, config) {
        return this.put(`/api/v1/admin/telemetry/config/orgs/${orgId}`, config);
    }

    // === ADMIN - CRON MANAGEMENT ===
    async adminGetCronCatalog() {
        return this.get('/api/v1/admin/cron/catalog');
    }

    async adminGetAvailableCronTasks() {
        return this.get('/api/v1/admin/cron/available-tasks');
    }

    async adminTriggerCron(taskOrRequest, params = {}) {
        const payload = typeof taskOrRequest === 'string'
            ? { taskId: taskOrRequest, ...params }
            : { ...(taskOrRequest || {}) };
        return this.post('/api/v1/admin/cron/trigger', payload);
    }

    async adminGetCronStatus() {
        return this.get('/api/v1/admin/cron/status');
    }

    async adminResetStaleCronRuns(taskId = null) {
        return this.post('/api/v1/admin/cron/reset-stale', taskId ? { taskId } : {});
    }

    async adminGetTraceLogs(partitionKey, tracingId) {
        return this.get(`/api/v1/admin/logs/trace?partitionKey=${encodeURIComponent(partitionKey)}&tracingId=${encodeURIComponent(tracingId)}`);
    }

    async adminGetAuditEvent(eventId, { date, eventKey } = {}) {
        const query = new URLSearchParams();
        if (date) query.set('date', date);
        if (eventKey) query.set('eventKey', eventKey);
        const suffix = query.toString() ? `?${query.toString()}` : '';
        return this.get(`/api/v1/admin/audit/events/${encodeURIComponent(eventId)}${suffix}`);
    }

    async adminResetRemediation(orgId, resetApps = true, resetCves = true) {
        return this.post('/api/v1/admin/remediation/reset', { orgId, resetApps, resetCves });
    }

    // === VULNERABILITIES ===
    async getVulnerabilities(orgId, params) {
        const date = this.getEffectiveDate();
        return this.get(`/api/v1/orgs/${orgId}/vulnerabilities`, date ? { ...(params || {}), date } : params);
    }

    async submitVulnerabilityReview(orgId, data) {
        return this.post(`/api/v1/orgs/${orgId}/vulnerabilities/review-request`, data);
    }

    // === ALERTS ===
    // Endpoint: GET /api/v1/orgs/{orgId}/alerts
    // Params: state (OPEN|SUPPRESSED|CLOSED|ALL), deviceId, controlId, severity (0-3), limit
    async getAlerts(orgId, params = {}) {
        const date = this.getEffectiveDate();
        const merged = date ? { ...params, date } : params;
        return this.get(`/api/v1/orgs/${orgId}/alerts`, merged);
    }

    // Endpoint: GET /api/v1/orgs/{orgId}/alerts/summary
    async getAlertSummary(orgId, params = {}) {
        const date = this.getEffectiveDate();
        const merged = date ? { ...params, date } : params;
        return this.get(`/api/v1/orgs/${orgId}/alerts/summary`, merged);
    }

    // Endpoint: POST /api/v1/orgs/{orgId}/alerts/{deviceId}/suppress
    // Body: { alertRowKey, suppressReason, suppressUntilDays }
    async suppressAlert(orgId, deviceId, body) {
        return this.post(`/api/v1/orgs/${orgId}/alerts/${encodeURIComponent(deviceId)}/suppress`, body);
    }

    // Endpoint: POST /api/v1/orgs/{orgId}/alerts/{deviceId}/reopen
    // Body: { alertRowKey }
    async reopenAlert(orgId, deviceId, body) {
        return this.post(`/api/v1/orgs/${orgId}/alerts/${encodeURIComponent(deviceId)}/reopen`, body);
    }

    // Endpoint: POST /api/v1/orgs/{orgId}/alerts/bulk-suppress
    // Body: { alerts: [{deviceId, alertRowKey}], suppressReason, suppressUntilDays }
    async bulkSuppressAlerts(orgId, alerts, suppressReason, suppressUntilDays) {
        return this.post(`/api/v1/orgs/${orgId}/alerts/bulk-suppress`, { alerts, suppressReason, suppressUntilDays });
    }

    // === ORG INSIGHTS (CVE Details, Threat Analysis, etc.) ===
    // Endpoint: GET /api/v1/orgs/{orgId}/insights?cves={cveId}
    // Org access is enforced at routing level by OrgAccessMiddleware
    async getOrgInsights(orgId, { cves = null } = {}) {
        let url = `/api/v1/orgs/${orgId}/insights`;
        if (cves) {
            url += `?cves=${encodeURIComponent(cves)}`;
        }
        return this.get(url);
    }

    // Convenience method for getting CVE details for organization
    async getCveDetails(cveId, orgId) {
        return this.getOrgInsights(orgId, { cves: cveId });
    }

    // Endpoint: GET /api/v1/orgs/{orgId}/cve/{cveId}
    // Returns full CVE exposure: affected devices (with names+states), apps, alert state counts, EPSS/KEV
    async getOrgCveDetail(orgId, cveId) {
        return this.get(`/api/v1/orgs/${orgId}/cve/${encodeURIComponent(cveId)}`);
    }

    // Endpoint: GET /api/v1/orgs/{orgId}/apps/changelog
    // Returns install/update/uninstall events for the org (or specific device)
    async getInventoryChangelog(orgId, { deviceId, limit, date } = {}) {
        const effectiveDate = date || this.getEffectiveDate();
        const params = {};
        if (deviceId) params.deviceId = deviceId;
        if (limit)    params.limit    = limit;
        if (effectiveDate) params.date = effectiveDate;
        return this.get(`/api/v1/orgs/${orgId}/apps/changelog`, params);
    }

    // Endpoint: GET /api/v1/orgs/{orgId}/snapshots/trends
    async getTrendSnapshots(orgId, from, to) {
        const params = {};
        if (from) params.from = from;
        if (to)   params.to   = to;
        return this.get(`/api/v1/orgs/${orgId}/snapshots/trends`, params);
    }

    // Endpoint: GET /api/v1/orgs/{orgId}/compliance/posture
    async getCompliancePosture(orgId, params = {}) {
        return this.get(`/api/v1/orgs/${orgId}/compliance/posture`, params);
    }

    // === ANALYTICS & TRENDS ===
    async getSoftwareInventory(orgId, deviceId, riskLevel, options = {}) {
        // Backward-compatible overload: getSoftwareInventory(orgId, { date: 'yyyy-MM-dd' })
        if (deviceId && typeof deviceId === 'object') {
            options = deviceId;
            deviceId = undefined;
            riskLevel = undefined;
        }

        if (riskLevel && typeof riskLevel === 'object') {
            options = riskLevel;
            riskLevel = undefined;
        }

        let url = `/api/v1/orgs/${orgId}/apps`;
        const params = [];
        if (deviceId) params.push(`deviceId=${encodeURIComponent(deviceId)}`);
        if (riskLevel) params.push(`riskLevel=${encodeURIComponent(riskLevel)}`);
        if (options?.date) params.push(`date=${encodeURIComponent(options.date)}`);
        if (options?.includeCachedSummary) params.push('include=cached-summary');
        if (params.length) url += `?${params.join('&')}`;
        return this.get(url);
    }

    async getAppLicenses(orgId) {
        return this.get(`/api/v1/orgs/${orgId}/apps/licenses`);
    }

    async setAppLicense(orgId, appKey, licenseData) {
        return this.put(`/api/v1/orgs/${orgId}/apps/${encodeURIComponent(appKey)}/license`, licenseData);
    }

    async deleteAppLicense(orgId, appKey) {
        return this.delete(`/api/v1/orgs/${orgId}/apps/${encodeURIComponent(appKey)}/license`);
    }

    // === AI ANALYST (ORG-SCOPED) ===
    // Note: All AI endpoints are org-scoped. Use these methods from pages:
    // - POST /api/v1/orgs/{orgId}/ai-analyst/run - Generate report
    // - POST /api/v1/orgs/{orgId}/ai-analyst/ask - Ask question
    // - GET /api/v1/orgs/{orgId}/ai-analyst/reports - List reports
    // - GET /api/v1/orgs/{orgId}/ai-analyst/reports/{reportId} - Get report detail
    
    async generateAIReport(orgId, data = {}) {
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

    async getAIReportByDate(orgId, date, params = {}) {
        // Fetch AI report by YYYYMMDD date
        return this.get(`/api/v1/orgs/${orgId}/ai/reports/${date}`, params);
    }

    async getLatestAIReport(orgId, params = {}) {
        // Use dedicated /latest endpoint to get most recent report
        return this.get(`/api/v1/orgs/${orgId}/ai/reports/latest`, params);
    }

    async emailAIReportPDF(orgId) {
        // Send latest report as PDF via email
        return this.post(`/api/v1/orgs/${orgId}/ai/reports/email-pdf`, {});
    }

    async getAuditLogs(orgId, params = {}) {
        // Get audit logs with optional filtering
        const date = this.getEffectiveDate();
        const merged = date ? { ...params, date } : params;
        return this.get(`/api/v1/orgs/${orgId}/audit`, merged);
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
    async queueCommand(orgId, commandType, targetDevices, parameters, resync) {
        return this.post(`/api/v1/orgs/${orgId}/response/commands`, {
            commandType,
            targetDevices: targetDevices ?? null,
            parameters: parameters ?? null,
            resync: resync ?? null
        });
    }

    async getCommands(orgId, deviceId, limit, since) {
        const params = new URLSearchParams();
        if (deviceId) params.set('deviceId', deviceId);
        if (limit) params.set('limit', limit);
        if (since) params.set('since', since);
        const qs = params.toString();
        return this.get(`/api/v1/orgs/${orgId}/response/commands${qs ? '?' + qs : ''}`);
    }

    async getCommandDetail(orgId, commandId) {
        return this.get(`/api/v1/orgs/${orgId}/response/commands/${commandId}`);
    }

    async cancelCommand(orgId, commandId) {
        return this.delete(`/api/v1/orgs/${orgId}/response/commands/${commandId}`);
    }

    // === ATTACK CHAIN ===
    async refreshAttackChain(orgId) {
        return this.post(`/api/v1/orgs/${orgId}/ai/attack-chain/refresh`);
    }

    // === ADMIN - AI RESPONSE LIBRARY ===
    async adminListAiResponses(params = {}) {
        return this.get('/api/v1/admin/ai/responses', params);
    }

    async adminGetAiResponse(rowKey) {
        return this.get(`/api/v1/admin/ai/responses/${encodeURIComponent(rowKey)}`);
    }

    async adminDeleteAiResponse(rowKey) {
        return this.delete(`/api/v1/admin/ai/responses/${encodeURIComponent(rowKey)}`);
    }

    async adminPatchAiResponse(rowKey, data) {
        return this.patch(`/api/v1/admin/ai/responses/${encodeURIComponent(rowKey)}`, data);
    }

    // === ADMIN - APP VULNERABILITY REVIEW ===
    async adminListAppVulnerabilityReview(params = {}) {
        return this.get('/api/v1/admin/vulnerability/review', params);
    }

    async adminSetVulnerabilityOverride(data) {
        return this.post('/api/v1/admin/vulnerability/override', data);
    }

    async adminGetVulnerabilityStats() {
        return this.get('/api/v1/admin/vulnerability/stats');
    }

    // === ADMIN - AI CPE RESOLUTION ===
    async adminRunAiCpe(maxApps = null, apps = null) {
        const params = maxApps ? `?maxApps=${maxApps}` : '';
        const body = apps && apps.length > 0 ? { apps } : undefined;
        return this.post(`/api/v1/admin/ai-cpe/run${params}`, body);
    }

    async adminListAiCpeRuns() {
        return this.get('/api/v1/admin/ai-cpe/runs');
    }

    async adminGetAiCpeRun(runId) {
        return this.get(`/api/v1/admin/ai-cpe/runs/${encodeURIComponent(runId)}`);
    }

    async adminApproveAiCpe(data) {
        return this.post('/api/v1/admin/ai-cpe/approve', data);
    }

    async adminRejectAiCpe(data) {
        return this.post('/api/v1/admin/ai-cpe/reject', data);
    }

    async adminBulkApproveAiCpe(data) {
        return this.post('/api/v1/admin/ai-cpe/approve-batch', data);
    }

    async adminBulkSetVulnerabilityOverride(data) {
        return this.post('/api/v1/admin/vulnerability/override-batch', data);
    }

}

// Global instance
export const api = new ApiClient();
