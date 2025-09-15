// MagenSec Hub API Service
class MagenSecAPI {
    constructor() {
        this.config = window.MagenSecConfig.api;
        this.baseURL = this.config.base; // Initial fallback
        // Normalize endpoint paths (ensure leading slash)
        if (this.config && this.config.endpoints) {
            for (const key of Object.keys(this.config.endpoints)) {
                const val = this.config.endpoints[key];
                if (typeof val === 'string' && val && !val.startsWith('http')) {
                    this.config.endpoints[key] = val.startsWith('/') ? val : '/' + val;
                }
            }
        }
        this.requestInterceptors = [];
        this.responseInterceptors = [];
        this.retryQueue = new Map();
        this.isInitialized = false;
        
        // Track API health
        this.isOnline = true;
        this.lastHealthCheck = null;
        
        // Initialize request monitoring and resolve API base
        this.initializeMonitoring();
        this.resolveApiBase();
    }
    
    async resolveApiBase() {
        if (window.apiResolver) {
            try {
                this.baseURL = await window.apiResolver.resolveApiBase();
                console.log('API service using resolved base URL:', this.baseURL);
            } catch (error) {
                console.warn('Failed to resolve API base, using fallback:', error);
            }
        }
        this.isInitialized = true;
    }
    
    async waitForInitialization() {
        if (this.isInitialized) return;
        
        // Wait for initialization to complete
        while (!this.isInitialized) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    
    // ======================
    // Core HTTP Methods
    // ======================
    
    async request(endpoint, options = {}) {
        // Wait for API base resolution
        await this.waitForInitialization();
        
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...options.headers
            },
            timeout: options.timeout || this.config.timeout,
            ...options
        };
        
        // Add authentication
        await this.addAuthHeaders(config);
        
        // Apply request interceptors
        for (const interceptor of this.requestInterceptors) {
            await interceptor(config);
        }
        
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
        
        try {
            const response = await this.fetchWithTimeout(url, config);
            
            // Apply response interceptors
            for (const interceptor of this.responseInterceptors) {
                await interceptor(response);
            }
            
            if (!response.ok) {
                // Allow graceful mock fallback for not-yet-implemented resources
                if (response.status === 404 && typeof endpoint === 'string') {
                    const ep = endpoint.toLowerCase();
                    if (ep.includes('/devices') || ep.includes('/reports') || ep.includes('/compliance')) {
                        throw new APIError(`HTTP 404 (mock fallback): ${response.statusText}`, response.status, response);
                    }
                }
                throw new APIError(`HTTP ${response.status}: ${response.statusText}`, response.status, response);
            }
            
            // Handle different response types
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                return { data, response };
            } else {
                const text = await response.text();
                return { data: text, response };
            }
            
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            
            // Handle network errors and retries
            if (options.retry !== false && this.shouldRetry(error)) {
                return this.retryRequest(endpoint, options);
            }
            
            throw new APIError(error.message, error.status || 0, null, error);
        }
    }
    
    async get(endpoint, params = {}, options = {}) {
        const url = this.buildURL(endpoint, params);
        return this.request(url, { method: 'GET', ...options });
    }
    
    async post(endpoint, data = null, options = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: data ? JSON.stringify(data) : null,
            ...options
        });
    }
    
    async put(endpoint, data = null, options = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : null,
            ...options
        });
    }
    
    async delete(endpoint, options = {}) {
        return this.request(endpoint, { method: 'DELETE', ...options });
    }
    
    // ======================
    // Authentication Methods
    // ======================
    
    async addAuthHeaders(config) {
        const token = await window.MagenSecAuth.getValidToken();
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        // Always get latest org context from auth
        let orgObj = window.MagenSecAuth.getCurrentOrganization();
        let orgId = orgObj?.id || orgObj;
        
        // Debug logging for organization context
        console.log('[API] Organization context:', {
            orgObj: orgObj,
            orgId: orgId,
            user: window.MagenSecAuth.getCurrentUser(),
            hasToken: !!token
        });
        
        if (orgId) {
            config.headers['X-Organization-ID'] = orgId;
        } else {
            console.warn('[API] No organization ID available for request');
        }
    }
    
    // ======================
    // Dashboard & Analytics
    // ======================
    
    async getDashboardData(timeRange = '24h') {
        console.log('[API] Requesting dashboard data with timeRange:', timeRange);
        const result = await this.get(this.config.endpoints.dashboard, { timeRange });
        console.log('[API] Dashboard response:', {
            status: result?.response?.status,
            summary: result?.data ? Object.keys(result.data) : 'No data',
            data: result?.data
        });
        return result;
    }
    
    async getDashboardStats(timeRange = '24h') {
        return this.get(this.config.endpoints.stats, { timeRange });
    }
    
    // ======================
    // Threat Management
    // ======================
    
    async getThreats(params = {}) {
        const defaultParams = {
            page: 1,
            limit: window.MagenSecConfig.ui.pageSize,
            sortBy: 'detectedAt',
            sortDirection: 'desc'
        };
        return this.get(this.config.endpoints.threats, { ...defaultParams, ...params });
    }
    
    async getThreatDetails(threatId) {
        return this.get(`${this.config.endpoints.threats}/${threatId}`);
    }
    
    async updateThreatStatus(threatId, status, notes = '') {
        return this.put(`${this.config.endpoints.threats}/${threatId}/status`, {
            status,
            notes,
            updatedAt: new Date().toISOString()
        });
    }
    
    async dismissThreat(threatId, reason = '') {
        return this.post(`${this.config.endpoints.threats}/${threatId}/dismiss`, {
            reason,
            dismissedAt: new Date().toISOString()
        });
    }
    
    // ======================
    // Device Management
    // ======================
    
    async getDevices(params = {}) {
        const defaultParams = {
            page: 1,
            limit: window.MagenSecConfig.ui.pageSize,
            status: 'all'
        };
        const result = await this.get(this.config.endpoints.devices, { ...defaultParams, ...params });
        console.log('[API] Devices response:', {
            status: result?.response?.status,
            summary: result?.data ? Object.keys(result.data) : 'No data',
            data: result?.data
        });
        return result;
    }
    
    async getDeviceDetails(deviceId) {
        return this.get(`${this.config.endpoints.devices}/${deviceId}`);
    }
    
    async updateDeviceSettings(deviceId, settings) {
        return this.put(`${this.config.endpoints.devices}/${deviceId}/settings`, settings);
    }
    
    async disableDevice(deviceId, reason = '') {
        return this.post(`${this.config.endpoints.devices}/${deviceId}/disable`, { reason });
    }
    
    async enableDevice(deviceId) {
        return this.post(`${this.config.endpoints.devices}/${deviceId}/enable`);
    }
    
    async getDeviceActivities(deviceId, params = {}) {
        return this.get(`${this.config.endpoints.devices}/${deviceId}/activities`, params);
    }
    
    // ======================
    // Compliance Management
    // ======================
    
    async getComplianceStatus(framework = null) {
        const params = framework ? { framework } : {};
        return this.get(this.config.endpoints.compliance, params);
    }

    // Backwards-compatible method name expected by compliance.js
    async getCompliance(params = {}) {
        // If a specific framework passed, map to framework param
        const framework = params.framework || params.name || null;
        return this.getComplianceStatus(framework);
    }
    
    async getComplianceReport(framework, format = 'json') {
        return this.get(`${this.config.endpoints.compliance}/report`, { framework, format });
    }
    
    async updateComplianceControl(controlId, status, evidence = null) {
        return this.put(`${this.config.endpoints.compliance}/controls/${controlId}`, {
            status,
            evidence,
            updatedAt: new Date().toISOString()
        });
    }
    
    // ======================
    // Activity & Audit Logs
    // ======================
    
    async getActivities(params = {}) {
        const defaultParams = {
            page: 1,
            limit: window.MagenSecConfig.ui.pageSize,
            timeRange: '7d'
        };
        return this.get(this.config.endpoints.activities, { ...defaultParams, ...params });
    }
    
    async getAuditTrail(resourceType, resourceId, params = {}) {
        return this.get(`${this.config.endpoints.activities}/audit/${resourceType}/${resourceId}`, params);
    }
    
    // ======================
    // Reports & Analytics
    // ======================
    
    async getReports(type = 'all') {
        return this.get(this.config.endpoints.reports, { type });
    }
    
    async generateReport(reportType, params = {}) {
        return this.post(`${this.config.endpoints.reports}/generate`, {
            type: reportType,
            parameters: params,
            requestedAt: new Date().toISOString()
        });
    }
    
    async downloadReport(reportId, format = 'pdf') {
        const response = await this.get(`${this.config.endpoints.reports}/${reportId}/download`, 
            { format }, 
            { headers: { 'Accept': `application/${format}` } }
        );
        return response;
    }
    
    // ======================
    // Organization Management
    // ======================
    
    async getOrganizationInfo() {
        return this.get(this.config.endpoints.organizations + '/current');
    }
    
    async updateOrganizationSettings(settings) {
        return this.put(this.config.endpoints.organizations + '/current', settings);
    }
    
    async getUsers() {
        return this.get(this.config.endpoints.organizations + '/current/users');
    }
    
    async inviteUser(email, role = 'viewer') {
        return this.post(this.config.endpoints.organizations + '/current/users/invite', {
            email,
            role,
            invitedAt: new Date().toISOString()
        });
    }
    
    // ======================
    // User Profile Management
    // ======================
    
    async getUserProfile() {
        return this.get('/portal/api/profile');
    }
    
    async updateUserProfile(profileData) {
        return this.put('/portal/api/profile', profileData);
    }
    
    // ======================
    // User Settings Management
    // ======================
    
    async getSettings() {
        return this.get('/portal/api/settings');
    }
    
    async updateSettings(settings) {
        return this.put('/portal/api/settings', settings);
    }
    
    // ======================
    // Health & Monitoring
    // ======================
    
    async checkHealth() {
        try {
            const response = await this.get(this.config.endpoints.health + '?quick=1');
            this.isOnline = true;
            this.lastHealthCheck = Date.now();
            return response.data;
        } catch (error) {
            this.isOnline = false;
            throw error;
        }
    }
    
    // ======================
    // Utility Methods
    // ======================
    
    buildURL(endpoint, params = {}) {
        if (!params || Object.keys(params).length === 0) {
            return endpoint;
        }
        
        const url = new URL(endpoint.startsWith('http') ? endpoint : this.baseURL + endpoint);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                url.searchParams.append(key, String(value));
            }
        });
        
        return endpoint.startsWith('http') ? url.toString() : url.pathname + url.search;
    }
    
    async fetchWithTimeout(url, config) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);
        
        try {
            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    
    shouldRetry(error) {
        // Retry on network errors or 5xx status codes
        return !error.status || (error.status >= 500 && error.status <= 599);
    }
    
    async retryRequest(endpoint, options, attempt = 1) {
        if (attempt > this.config.retryAttempts) {
            throw new APIError('Maximum retry attempts exceeded', 0);
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.request(endpoint, { ...options, retry: false, _attempt: attempt + 1 });
    }
    
    initializeMonitoring() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            window.MagenSecUI.showToast('Connection restored', 'success');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            window.MagenSecUI.showToast('Connection lost. Retrying...', 'warning');
        });
        
        // Periodic health check
        setInterval(() => {
            if (this.isOnline && (!this.lastHealthCheck || Date.now() - this.lastHealthCheck > 300000)) {
                this.checkHealth().catch(() => {
                    // Silent fail for health checks
                });
            }
        }, 60000); // Check every minute
    }
    
    // ======================
    // Request/Response Interceptors
    // ======================
    
    addRequestInterceptor(interceptor) {
        this.requestInterceptors.push(interceptor);
    }
    
    addResponseInterceptor(interceptor) {
        this.responseInterceptors.push(interceptor);
    }
}

// Custom Error Class
class APIError extends Error {
    constructor(message, status = 0, response = null, originalError = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.response = response;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
    }
    
    // Mock data methods for debug mode
    getMockDashboardData() {
        return {
            activeThreats: 7,
            resolvedThreats: 23,
            totalDevices: 156,
            onlineDevices: 134,
            complianceScore: 87,
            securityAlerts: 3,
            recentThreats: [
                {
                    id: 'T001',
                    type: 'malware',
                    severity: 'high',
                    description: 'Trojan.Win32.Generic detected on WORKSTATION-01',
                    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    status: 'active',
                    deviceName: 'WORKSTATION-01'
                },
                {
                    id: 'T002',
                    type: 'policy-violation',
                    severity: 'medium',
                    description: 'Unauthorized software installation attempt',
                    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                    status: 'investigating',
                    deviceName: 'LAPTOP-05'
                }
            ],
            recentActivities: [
                {
                    id: 'A001',
                    type: 'LOGIN',
                    description: 'User john.doe logged in from WORKSTATION-01',
                    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                    userName: 'john.doe',
                    deviceName: 'WORKSTATION-01'
                }
            ],
            deviceStatus: {
                online: 134,
                offline: 22,
                warning: 8,
                critical: 2
            }
        };
    }
}

// Initialize global API instance
window.MagenSecAPI = new MagenSecAPI();

// Debug helpers for development
if (window.MagenSecConfig.development.debug) {
    window.MagenSecAPI.addRequestInterceptor(async (config) => {
        console.log('🚀 API Request:', config);
    });
    
    window.MagenSecAPI.addResponseInterceptor(async (response) => {
        console.log('✅ API Response:', response);
    });
}
