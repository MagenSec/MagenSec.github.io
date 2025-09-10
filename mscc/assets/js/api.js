/**
 * MagenSec Command Center - API Interface Module
 * Handles all communication with the cloud backend and caching
 */

class ApiManager {
    constructor() {
        this.baseUrl = this.detectApiBaseUrl();
        this.apiKey = '';
        this.authManager = null;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.requestQueue = new Map();
        
        this.init();
    }

    /**
     * Detect the appropriate API base URL
     */
    detectApiBaseUrl() {
        const hostname = window.location.hostname;
        
        // Production GitHub Pages
        if (hostname.includes('github.io')) {
            return 'https://your-portal-api-domain.com/api'; // Update with your actual Portal API domain
        }
        
        // Local development - assume Portal API is running locally or use demo mode
        if (hostname === 'localhost' || hostname === '127.0.0.1' || window.location.protocol === 'file:') {
            return 'http://localhost:5000/api'; // Adjust port as needed for your Portal API
        }
        
        // Default production URL
        return '/api';
    }

    /**
     * Initialize API manager
     */
    async init() {
        try {
            await this.loadConfig();
            console.log('API manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize API manager:', error);
        }
    }

    /**
     * Load API configuration
     */
    async loadConfig() {
        try {
            // In production, load from secure config endpoint
            this.baseUrl = window.location.origin.includes('localhost') 
                ? 'http://localhost:5000/api' 
                : 'https://api.magensec.com/api';
                
            // TODO: Load from secure configuration
            // const response = await fetch('/api/config');
            // const config = await response.json();
            // this.baseUrl = config.apiBaseUrl;
            
        } catch (error) {
            console.error('Failed to load API config:', error);
            // Fallback to default configuration
            this.baseUrl = '/api';
        }
    }

    /**
     * Set authentication manager reference
     */
    setAuthManager(authManager) {
        this.authManager = authManager;
    }

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        try {
            // Check if we're in demo mode (no real API available)
            if (this.isDemoMode()) {
                return await this.handleDemoRequest(endpoint, options);
            }

            const url = `${this.baseUrl}${endpoint}`;
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };

            // Add authentication if available
            if (this.authManager && this.authManager.isAuthenticated()) {
                const user = this.authManager.getCurrentUser();
                const org = this.authManager.getCurrentOrganization();
                
                headers['X-User-Email'] = user.email;
                if (org) {
                    headers['X-Organization-ID'] = org.id;
                }
            }

            const config = {
                method: options.method || 'GET',
                headers,
                ...options
            };

            if (config.body && typeof config.body !== 'string') {
                config.body = JSON.stringify(config.body);
            }

            const response = await fetch(url, config);
            
            if (!response.ok) {
                // Fall back to demo mode if API is unavailable
                if (response.status >= 500 || response.status === 0) {
                    console.warn('API unavailable, falling back to demo mode');
                    return await this.handleDemoRequest(endpoint, options);
                }
                throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, response.status);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }

        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            
            // Fall back to demo mode on network errors
            if (error.name === 'TypeError' || error.message.includes('fetch')) {
                console.warn('Network error, falling back to demo mode');
                return await this.handleDemoRequest(endpoint, options);
            }
            
            throw error;
        }
    }

    /**
     * Check if we should use demo mode
     */
    isDemoMode() {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.protocol === 'file:' ||
               localStorage.getItem('mscc_demo_mode') === 'true';
    }

    /**
     * Handle demo requests with mock data
     */
    async handleDemoRequest(endpoint, options = {}) {
        if (!window.simulateApiResponse) {
            throw new Error('Demo data not available');
        }

        // Get user type for appropriate demo data
        let userType = 'individual';
        if (this.authManager && this.authManager.isAuthenticated()) {
            const org = this.authManager.getCurrentOrganization();
            if (org?.type === 'site-admin') {
                userType = 'admin';
            } else if (org?.type === 'business') {
                userType = 'business';
            }
        }

        return await window.simulateApiResponse(endpoint, userType);
    }

    /**
     * GET request with caching
     */
    async get(endpoint, useCache = true) {
        const cacheKey = `GET:${endpoint}`;
        
        // Check cache first
        if (useCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
            this.cache.delete(cacheKey);
        }

        // Prevent duplicate requests
        if (this.requestQueue.has(cacheKey)) {
            return await this.requestQueue.get(cacheKey);
        }

        const requestPromise = this.request(endpoint);
        this.requestQueue.set(cacheKey, requestPromise);

        try {
            const data = await requestPromise;
            
            // Cache successful response
            if (useCache) {
                this.cache.set(cacheKey, {
                    data,
                    timestamp: Date.now()
                });
            }
            
            return data;
        } finally {
            this.requestQueue.delete(cacheKey);
        }
    }

    /**
     * POST request
     */
    async post(endpoint, data) {
        return await this.request(endpoint, {
            method: 'POST',
            body: data
        });
    }

    /**
     * PUT request
     */
    async put(endpoint, data) {
        return await this.request(endpoint, {
            method: 'PUT',
            body: data
        });
    }

    /**
     * DELETE request
     */
    async delete(endpoint) {
        return await this.request(endpoint, {
            method: 'DELETE'
        });
    }

    /**
     * Clear cache
     */
    clearCache(pattern = null) {
        if (pattern) {
            const regex = new RegExp(pattern);
            for (const key of this.cache.keys()) {
                if (regex.test(key)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    // === Device Management APIs ===

    /**
     * Get devices for current organization
     */
    async getDevices(filters = {}) {
        const params = new URLSearchParams(filters);
        const endpoint = `/devices${params.toString() ? `?${params}` : ''}`;
        return await this.get(endpoint);
    }

    /**
     * Get device details
     */
    async getDevice(deviceId) {
        return await this.get(`/devices/${deviceId}`);
    }

    /**
     * Update device settings
     */
    async updateDevice(deviceId, updates) {
        const result = await this.put(`/devices/${deviceId}`, updates);
        this.clearCache(`devices`);
        return result;
    }

    /**
     * Delete device
     */
    async deleteDevice(deviceId) {
        const result = await this.delete(`/devices/${deviceId}`);
        this.clearCache(`devices`);
        return result;
    }

    // === Security Analytics APIs ===

    /**
     * Get security overview metrics
     */
    async getSecurityOverview() {
        return await this.get('/analytics/security/overview');
    }

    /**
     * Get vulnerability scan results
     */
    async getVulnerabilities(filters = {}) {
        const params = new URLSearchParams(filters);
        const endpoint = `/analytics/vulnerabilities${params.toString() ? `?${params}` : ''}`;
        return await this.get(endpoint);
    }

    /**
     * Get compliance status
     */
    async getComplianceStatus() {
        return await this.get('/analytics/compliance');
    }

    /**
     * Get Windows Defender status
     */
    async getDefenderStatus() {
        return await this.get('/analytics/defender');
    }

    /**
     * Get configuration drift analysis
     */
    async getConfigurationDrift() {
        return await this.get('/analytics/config-drift');
    }

    /**
     * Get security incidents
     */
    async getSecurityIncidents(filters = {}) {
        const params = new URLSearchParams(filters);
        const endpoint = `/analytics/incidents${params.toString() ? `?${params}` : ''}`;
        return await this.get(endpoint);
    }

    // === User Management APIs ===

    /**
     * Get organization users (admin only)
     */
    async getOrganizationUsers() {
        return await this.get('/admin/users');
    }

    /**
     * Update user permissions (admin only)
     */
    async updateUserPermissions(userId, permissions) {
        const result = await this.put(`/admin/users/${userId}/permissions`, permissions);
        this.clearCache(`admin/users`);
        return result;
    }

    /**
     * Remove user from organization (admin only)
     */
    async removeUserFromOrganization(userId) {
        const result = await this.delete(`/admin/users/${userId}`);
        this.clearCache(`admin/users`);
        return result;
    }

    // === License Management APIs ===

    /**
     * Get license information
     */
    async getLicenseInfo() {
        return await this.get('/license');
    }

    /**
     * Update license key
     */
    async updateLicense(licenseKey) {
        const result = await this.put('/license', { licenseKey });
        this.clearCache(`license`);
        return result;
    }

    // === Reporting APIs ===

    /**
     * Generate security report
     */
    async generateSecurityReport(options = {}) {
        return await this.post('/reports/security', options);
    }

    /**
     * Get report status
     */
    async getReportStatus(reportId) {
        return await this.get(`/reports/${reportId}/status`);
    }

    /**
     * Download report
     */
    async downloadReport(reportId) {
        const url = `${this.baseUrl}/reports/${reportId}/download`;
        window.open(url, '_blank');
    }

    // === Telemetry APIs ===

    /**
     * Get telemetry data
     */
    async getTelemetryData(filters = {}) {
        const params = new URLSearchParams(filters);
        const endpoint = `/telemetry${params.toString() ? `?${params}` : ''}`;
        return await this.get(endpoint);
    }

    /**
     * Submit telemetry data
     */
    async submitTelemetry(data) {
        return await this.post('/telemetry', data);
    }

    // === System Health APIs ===

    /**
     * Get system health status
     */
    async getSystemHealth() {
        return await this.get('/health', false); // Don't cache health checks
    }

    /**
     * Get API usage statistics
     */
    async getApiUsage() {
        return await this.get('/analytics/api-usage');
    }

    // === Utility Methods ===

    /**
     * Check API connectivity
     */
    async checkConnectivity() {
        try {
            await this.get('/health', false);
            return true;
        } catch (error) {
            console.error('API connectivity check failed:', error);
            return false;
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
            memoryUsage: JSON.stringify(Array.from(this.cache.values())).length
        };
    }

    /**
     * Batch multiple API requests
     */
    async batch(requests) {
        try {
            const promises = requests.map(req => {
                switch (req.method?.toUpperCase()) {
                    case 'POST':
                        return this.post(req.endpoint, req.data);
                    case 'PUT':
                        return this.put(req.endpoint, req.data);
                    case 'DELETE':
                        return this.delete(req.endpoint);
                    default:
                        return this.get(req.endpoint, req.useCache);
                }
            });

            const results = await Promise.allSettled(promises);
            return results.map((result, index) => ({
                request: requests[index],
                success: result.status === 'fulfilled',
                data: result.status === 'fulfilled' ? result.value : null,
                error: result.status === 'rejected' ? result.reason : null
            }));
        } catch (error) {
            console.error('Batch request failed:', error);
            throw error;
        }
    }
}

/**
 * Custom API Error class
 */
class ApiError extends Error {
    constructor(message, status = null, details = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

// Create global API manager instance
window.apiManager = new ApiManager();

// Set up auth manager reference when available
document.addEventListener('DOMContentLoaded', () => {
    if (window.authManager) {
        window.apiManager.setAuthManager(window.authManager);
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ApiManager, ApiError };
}
