/**
 * MagenSec Command Center - Azure Tables Data Service
 * Handles direct communication with Azure Tables for telemetry and device data
 */

console.log('MSCC dataService.js loaded');

window.msccDataService = (() => {
    // Use sessionStorage for caching across views and page reloads
    const cache = {
        _prefix: 'msccCache:',
        _getKey: function(key) {
            return `${this._prefix}${key}`;
        },
        getItem: function(key) {
            const itemStr = sessionStorage.getItem(this._getKey(key));
            if (!itemStr) return null;
            try {
                return JSON.parse(itemStr);
            } catch (e) {
                console.error('Error parsing cache data for key:', key, e);
                return null;
            }
        },
        setItem: function(key, value) {
            try {
                sessionStorage.setItem(this._getKey(key), JSON.stringify(value));
            } catch (e) {
                console.error('Error setting cache data for key:', key, e);
                this.clearOld();
                try {
                    sessionStorage.setItem(this._getKey(key), JSON.stringify(value));
                } catch (e2) {
                    console.error('Failed to set cache data even after clearing:', key, e2);
                }
            }
        },
        clearOld: function() {
            console.warn('Cache quota may be exceeded. Clearing old entries...');
            for (const key in sessionStorage) {
                if (key.startsWith(this._prefix)) {
                    sessionStorage.removeItem(key);
                }
            }
        }
    };

    // SAS URL management
    let sasUrlBase = null;
    let sasUrlMap = {};
    let isInitialized = false;

    /**
     * Initialize the data service
     */
    async function init() {
        if (isInitialized) return true;
        
        try {
            console.log('Initializing MSCC Data Service...');
            await fetchSasExpiry();
            isInitialized = true;
            console.log('MSCC Data Service initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize MSCC Data Service:', error);
            return false;
        }
    }

    // Circuit breaker state for each API endpoint
    const circuitBreakers = new Map();
    
    function getCircuitBreaker(key) {
        if (!circuitBreakers.has(key)) {
            circuitBreakers.set(key, {
                state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
                failureCount: 0,
                lastFailureTime: null,
                timeout: 60000, // 1 minute
                threshold: 3 // failures before opening
            });
        }
        return circuitBreakers.get(key);
    }
    
    function shouldAllowRequest(breaker) {
        if (breaker.state === 'CLOSED') {
            return true;
        }
        
        if (breaker.state === 'OPEN') {
            // Check if timeout has passed
            if (Date.now() - breaker.lastFailureTime > breaker.timeout) {
                breaker.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        
        // HALF_OPEN state - allow single request
        return true;
    }
    
    function recordSuccess(breaker) {
        breaker.failureCount = 0;
        breaker.state = 'CLOSED';
        breaker.lastFailureTime = null;
    }
    
    function recordFailure(breaker) {
        breaker.failureCount++;
        breaker.lastFailureTime = Date.now();
        
        if (breaker.failureCount >= breaker.threshold) {
            breaker.state = 'OPEN';
        } else if (breaker.state === 'HALF_OPEN') {
            breaker.state = 'OPEN';
        }
    }

    /**
     * Load SAS URL for a specific table with circuit breaker protection
     */
    async function loadSasUrl(table, forceRefresh = false) {
        const cacheKey = `sas_url_${table}`;
        const circuitKey = 'sas_endpoint';
        const breaker = getCircuitBreaker(circuitKey);
        
        // Check circuit breaker
        if (!shouldAllowRequest(breaker)) {
            console.warn(`Circuit breaker OPEN for SAS endpoint, using demo data for ${table}`);
            return null;
        }

        try {
            // Check cache first (unless forced refresh)
            if (!forceRefresh) {
                const cachedUrl = sessionStorage.getItem(cacheKey);
                const cacheExpiry = sessionStorage.getItem(`${cacheKey}_expiry`);
                
                if (cachedUrl && cacheExpiry && Date.now() < parseInt(cacheExpiry)) {
                    console.log(`[SAS Cache] HIT for ${table}`);
                    return cachedUrl;
                }
            }

            console.log(`[SAS Cache] MISS for ${table} - fetching new token`);

            const sessionToken = localStorage.getItem('mscc_session_token');
            if (!sessionToken) {
                console.warn('No session token available, using demo mode');
                return null;
            }

            const apiBase = await getApiBase();
            if (!apiBase) {
                console.warn('No API base URL configured, using demo mode');
                return null;
            }

            // Request timeout and abort controller
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
            
            console.log(`Requesting SAS token for table: ${table}`);
            const response = await fetch(`${apiBase}/api/azure/sas-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`,
                    'User-Agent': 'MagenSec-MSCC/1.0'
                },
                body: JSON.stringify({
                    tableName: table,
                    permissions: 'r', // read-only
                    expiryHours: 1
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401) {
                    console.warn('Session token expired, clearing token');
                    localStorage.removeItem('mscc_session_token');
                    // Trigger re-authentication
                    window.location.href = 'index.html';
                    return null;
                } else if (response.status === 403) {
                    console.error('Access denied to SAS token endpoint');
                    throw new Error('Access denied to Azure Tables');
                } else if (response.status === 429) {
                    console.warn('Rate limited on SAS token endpoint');
                    throw new Error('Service temporarily unavailable (rate limited)');
                } else if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }
                
                throw new Error(`SAS token request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Validate response structure
            if (!data || !data.sasUrl || typeof data.sasUrl !== 'string') {
                throw new Error('Invalid SAS token response format');
            }

            // Cache the SAS URL (default 45 minutes expiry)
            const expiryTime = Date.now() + 45 * 60 * 1000;
            sessionStorage.setItem(cacheKey, data.sasUrl);
            sessionStorage.setItem(`${cacheKey}_expiry`, expiryTime.toString());

            console.log(`SAS token cached for ${table} (expires in 45 minutes)`);
            
            // Record success for circuit breaker
            recordSuccess(breaker);
            
            return data.sasUrl;

        } catch (error) {
            console.error(`Error loading SAS URL for ${table}:`, error);
            
            // Record failure for circuit breaker
            recordFailure(breaker);
            
            // Handle specific error types
            if (error.name === 'AbortError') {
                console.error('SAS token request timed out');
            } else if (error.message.includes('fetch')) {
                console.error('Network error while fetching SAS token');
            }
            
            return null; // Fall back to demo mode
        }
    }

    // Error tracking and reporting
    const errorStats = {
        total: 0,
        network: 0,
        auth: 0,
        rateLimit: 0,
        server: 0,
        lastError: null,
        lastErrorTime: null
    };
    
    function reportError(error, category = 'unknown') {
        errorStats.total++;
        errorStats.lastError = error.message;
        errorStats.lastErrorTime = new Date().toISOString();
        
        switch (category) {
            case 'network':
                errorStats.network++;
                break;
            case 'auth':
                errorStats.auth++;
                break;
            case 'rateLimit':
                errorStats.rateLimit++;
                break;
            case 'server':
                errorStats.server++;
                break;
        }
        
        // Show user-friendly error message
        showConnectionStatus(false, error.message, category);
    }
    
    function showConnectionStatus(isConnected, message = '', category = '') {
        // Create or update status indicator
        let statusEl = document.getElementById('connection-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'connection-status';
            statusEl.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                padding: 8px 12px;
                border-radius: 4px;
                z-index: 1000;
                font-size: 12px;
                font-weight: 500;
                transition: all 0.3s ease;
                max-width: 300px;
                word-wrap: break-word;
            `;
            document.body.appendChild(statusEl);
        }
        
        if (isConnected) {
            statusEl.style.backgroundColor = '#d4edda';
            statusEl.style.color = '#155724';
            statusEl.style.border = '1px solid #c3e6cb';
            statusEl.textContent = '✓ Connected to Azure Tables';
        } else {
            statusEl.style.backgroundColor = '#f8d7da';
            statusEl.style.color = '#721c24';
            statusEl.style.border = '1px solid #f5c6cb';
            
            let displayMessage = '⚠ Using demo data';
            if (message) {
                if (category === 'network') {
                    displayMessage += ' (network error)';
                } else if (category === 'auth') {
                    displayMessage += ' (authentication required)';
                } else if (category === 'rateLimit') {
                    displayMessage += ' (service busy)';
                } else if (category === 'server') {
                    displayMessage += ' (server error)';
                }
            }
            statusEl.textContent = displayMessage;
        }
        
        // Auto-hide success messages after 3 seconds
        if (isConnected) {
            setTimeout(() => {
                if (statusEl && statusEl.textContent.includes('Connected')) {
                    statusEl.style.opacity = '0';
                    setTimeout(() => statusEl.remove(), 300);
                }
            }, 3000);
        }
    }
    
    // Health check function
    async function checkConnectionHealth() {
        try {
            const breaker = getCircuitBreaker('sas_endpoint');
            if (breaker.state === 'OPEN') {
                showConnectionStatus(false, 'Service temporarily unavailable', 'server');
                return false;
            }
            
            const apiBase = await getApiBase();
            if (!apiBase) {
                showConnectionStatus(false, 'API not configured', 'network');
                return false;
            }
            
            const sessionToken = localStorage.getItem('mscc_session_token');
            if (!sessionToken) {
                showConnectionStatus(false, 'Authentication required', 'auth');
                return false;
            }
            
            // Try a lightweight health check
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${apiBase}/api/health`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                showConnectionStatus(true);
                return true;
            } else {
                showConnectionStatus(false, `Server responded with ${response.status}`, 'server');
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                showConnectionStatus(false, 'Connection timeout', 'network');
            } else {
                showConnectionStatus(false, 'Network error', 'network');
            }
            return false;
        }
    }

    /**
     * Get API base URL
     */
    async function getApiBase() {
        // Use the configured API base from config.js (stamped during deployment)
        return await window.apiResolver.resolveApiBase();
    }

    /**
     * Fetch data from Azure Tables using OData with comprehensive error handling
     */
    async function fetchOData(table, orgFilter = null, params = {}) {
        const organization = orgFilter || getUserOrganization();
        const key = `${table}:${organization}:${JSON.stringify(params)}`;
        const cachedItem = cache.getItem(key);

        // Check cache first (5 minute expiry)
        if (cachedItem && Date.now() < cachedItem.expiry) {
            console.log(`[Cache] HIT for ${table} data`);
            return cachedItem.data;
        }
        
        console.log(`[Cache] MISS for ${table} data`);

        // Retry configuration
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const url = await loadSasUrl(table);
                if (!url) {
                    // Demo mode - return mock data
                    console.log(`Using demo data for table: ${table}`);
                    return getDemoData(table);
                }

                const urlObj = new URL(url);
                const filterClauses = [];

                // Add organization filter
                if (organization && organization !== 'all') {
                    filterClauses.push(`PartitionKey eq '${organization}'`);
                }

                // Add custom filters from params
                if (params.$filter) {
                    filterClauses.push(params.$filter);
                }

                // Combine filters
                if (filterClauses.length > 0) {
                    urlObj.searchParams.set('$filter', filterClauses.join(' and '));
                }

                // Add other OData parameters
                if (params.$top) urlObj.searchParams.set('$top', params.$top);
                if (params.$orderby) urlObj.searchParams.set('$orderby', params.$orderby);
                if (params.$select) urlObj.searchParams.set('$select', params.$select);

                console.log(`Fetching from Azure Tables: ${table} (attempt ${attempt}/${maxRetries})`);
                
                // Set timeout for the request
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                
                const response = await fetch(urlObj.toString(), {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json;odata=minimalmetadata',
                        'User-Agent': 'MagenSec-MSCC/1.0'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    // Handle specific HTTP status codes
                    if (response.status === 429) {
                        // Rate limiting - wait longer before retry
                        const retryAfter = response.headers.get('Retry-After') || (baseDelay * Math.pow(2, attempt - 1)) / 1000;
                        console.warn(`Rate limited on ${table}, retrying after ${retryAfter}s (attempt ${attempt}/${maxRetries})`);
                        
                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                            continue;
                        } else {
                            reportError(new Error('Service rate limited'), 'rateLimit');
                        }
                    } else if (response.status === 403) {
                        // Authentication/authorization error - don't retry
                        console.error(`Access denied to ${table}. Check SAS token permissions.`);
                        const error = new Error(`Access denied to table ${table}: ${response.statusText}`);
                        reportError(error, 'auth');
                        throw error;
                    } else if (response.status >= 500) {
                        // Server error - retry with exponential backoff
                        if (attempt < maxRetries) {
                            const delay = baseDelay * Math.pow(2, attempt - 1);
                            console.warn(`Server error ${response.status} for ${table}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        } else {
                            reportError(new Error(`Server error: ${response.statusText}`), 'server');
                        }
                    }
                    
                    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                    reportError(error, response.status >= 500 ? 'server' : 'unknown');
                    throw error;
                }

                const data = await response.json();
                
                // Validate response structure
                if (!data || typeof data !== 'object') {
                    throw new Error('Invalid response format from Azure Tables');
                }
                
                const entities = data.value || [];

                // Validate entities array
                if (!Array.isArray(entities)) {
                    console.warn(`Unexpected response structure for ${table}:`, data);
                    throw new Error('Response does not contain valid entities array');
                }

                // Cache the result with 5-minute expiry
                cache.setItem(key, {
                    data: entities,
                    expiry: Date.now() + 5 * 60 * 1000,
                    timestamp: Date.now()
                });

                console.log(`Retrieved ${entities.length} records from ${table}`);
                return entities;

            } catch (error) {
                console.error(`Error fetching from ${table} (attempt ${attempt}/${maxRetries}):`, error);
                
                // Categorize and report errors
                let errorCategory = 'unknown';
                if (error.name === 'AbortError') {
                    errorCategory = 'network';
                } else if (error.name === 'TypeError' || error.message.includes('network') || error.message.includes('fetch')) {
                    errorCategory = 'network';
                } else if (error.message.includes('auth') || error.message.includes('Access denied')) {
                    errorCategory = 'auth';
                } else if (error.message.includes('rate') || error.message.includes('429')) {
                    errorCategory = 'rateLimit';
                } else if (error.message.includes('server') || error.message.includes('5')) {
                    errorCategory = 'server';
                }
                
                // Check if it's a network error and we should retry
                if (attempt < maxRetries && (
                    error.name === 'AbortError' || 
                    error.name === 'TypeError' || 
                    error.message.includes('network') ||
                    error.message.includes('fetch')
                )) {
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    console.log(`Network error, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                // If this is the last attempt, report the error
                if (attempt === maxRetries) {
                    console.warn(`All retry attempts failed for ${table}, falling back to demo data`);
                    reportError(error, errorCategory);
                    return getDemoData(table);
                }
            }
        }
        
        // Fallback - should not reach here
        console.error(`Unexpected end of retry loop for ${table}, returning demo data`);
        return getDemoData(table);
    }

    /**
     * Get user's organization from session
     */
    function getUserOrganization() {
        const user = getCurrentUser();
        return user?.organization?.id || 'demo-org';
    }

    /**
     * Get current user from session
     */
    function getCurrentUser() {
        const token = localStorage.getItem('mscc_session_token');
        if (token && token.startsWith('dev_')) {
            const devSession = localStorage.getItem('mscc_dev_session');
            if (devSession) {
                return JSON.parse(devSession);
            }
        }
        return null;
    }

    /**
     * Check SAS URL expiry
     */
    async function fetchSasExpiry() {
        try {
            const url = await loadSasUrl('PerfTelemetry');
            if (!url) return null;
            
            const urlObj = new URL(url);
            const expiry = urlObj.searchParams.get('se'); // Expiry parameter
            if (expiry) {
                const expiryDate = new Date(expiry);
                console.log(`SAS URL expires: ${expiryDate.toISOString()}`);
                return expiryDate;
            }
        } catch (error) {
            console.warn('Could not determine SAS URL expiry:', error);
        }
        return null;
    }

    /**
     * Get demo/mock data for testing
     */
    function getDemoData(table) {
        console.log(`Returning demo data for table: ${table}`);
        
        switch (table) {
            case 'PerfTelemetry':
                return generateDemoTelemetry();
            case 'SecurityEvents':
                return generateDemoSecurityEvents();
            case 'DeviceInventory':
                return generateDemoDevices();
            case 'ComplianceReports':
                return generateDemoCompliance();
            default:
                return [];
        }
    }

    /**
     * Generate demo telemetry data
     */
    function generateDemoTelemetry() {
        const data = [];
        const now = new Date();
        
        for (let i = 0; i < 50; i++) {
            const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000)); // Last 50 hours
            data.push({
                PartitionKey: 'demo-org',
                RowKey: `telemetry-${i}`,
                Timestamp: timestamp.toISOString(),
                DeviceId: `device-${i % 10}`,
                EventType: ['system-start', 'scan-complete', 'threat-detected', 'update-complete'][i % 4],
                Severity: ['Low', 'Medium', 'High', 'Critical'][i % 4],
                Message: `Demo telemetry event ${i}`,
                Context1: 'demo-org',
                Context2: `device-${i % 10}`,
                NumericValue: Math.random() * 100
            });
        }
        
        return data;
    }

    /**
     * Generate demo security events
     */
    function generateDemoSecurityEvents() {
        const data = [];
        const threats = ['Malware Detected', 'Suspicious Process', 'Network Anomaly', 'Privilege Escalation'];
        
        for (let i = 0; i < 20; i++) {
            const timestamp = new Date(Date.now() - (i * 2 * 60 * 60 * 1000)); // Last 40 hours
            data.push({
                PartitionKey: 'demo-org',
                RowKey: `security-${i}`,
                Timestamp: timestamp.toISOString(),
                DeviceId: `device-${i % 10}`,
                ThreatType: threats[i % threats.length],
                Severity: ['Low', 'Medium', 'High', 'Critical'][i % 4],
                Status: ['Detected', 'Quarantined', 'Resolved'][i % 3],
                Description: `Demo security event: ${threats[i % threats.length]}`
            });
        }
        
        return data;
    }

    /**
     * Generate demo device inventory
     */
    function generateDemoDevices() {
        const data = [];
        const osTypes = ['Windows 11', 'Windows 10', 'Windows Server 2022', 'Windows Server 2019'];
        
        for (let i = 0; i < 10; i++) {
            data.push({
                PartitionKey: 'demo-org',
                RowKey: `device-${i}`,
                DeviceId: `device-${i}`,
                DeviceName: `DESKTOP-${String.fromCharCode(65 + i).repeat(3)}${i}`,
                OperatingSystem: osTypes[i % osTypes.length],
                LastSeen: new Date(Date.now() - (i * 60 * 60 * 1000)).toISOString(),
                Status: ['Online', 'Offline', 'Maintenance'][i % 3],
                AgentVersion: '1.0.0',
                Organization: 'demo-org'
            });
        }
        
        return data;
    }

    /**
     * Generate demo compliance data
     */
    function generateDemoCompliance() {
        return [
            {
                PartitionKey: 'demo-org',
                RowKey: 'compliance-1',
                Framework: 'NIST',
                Score: 85,
                LastAssessment: new Date().toISOString(),
                Status: 'Compliant'
            },
            {
                PartitionKey: 'demo-org',
                RowKey: 'compliance-2',
                Framework: 'ISO 27001',
                Score: 78,
                LastAssessment: new Date().toISOString(),
                Status: 'Minor Issues'
            }
        ];
    }

    // Public API
    return {
        init,
        fetchOData,
        getUserOrganization,
        getCurrentUser,
        getDemoData,
        getDashboardStats,
        getRecentActivity,
        getDeviceData,
        getSecurityEvents,
        getTelemetryData,
        
        // Health and diagnostics
        checkConnectionHealth,
        getErrorStats: () => ({ ...errorStats }),
        getCircuitBreakerStatus: () => {
            const status = {};
            circuitBreakers.forEach((breaker, key) => {
                status[key] = {
                    state: breaker.state,
                    failureCount: breaker.failureCount,
                    lastFailureTime: breaker.lastFailureTime
                };
            });
            return status;
        },
        
        // Cache management
        cache: {
            clear: () => cache.clearOld(),
            get: (key) => cache.getItem(key),
            set: (key, value) => cache.setItem(key, value),
            clearAll: () => {
                cache.clear();
                sessionStorage.removeItem('sasUrlCache');
                console.log('DataService cache cleared');
            },
            getStats: () => ({
                size: cache.size(),
                items: cache.keys()
            })
        },
        
        // Demo mode controls
        enableDemoMode: () => {
            localStorage.removeItem('mscc_session_token');
            sessionStorage.clear();
            console.log('Demo mode enabled');
        },
        
        // Organization management
        setUserOrganization: (org) => {
            if (org && typeof org === 'string') {
                localStorage.setItem('userOrganization', org);
                console.log(`Organization set to: ${org}`);
                // Clear cache when organization changes
                cache.clear();
            }
        }
    };
})();

// Auto-initialize when loaded
document.addEventListener('DOMContentLoaded', () => {
    window.msccDataService.init();
    
    // Initialize health check after 1 second
    setTimeout(() => {
        if (window.msccDataService.checkConnectionHealth) {
            window.msccDataService.checkConnectionHealth();
        }
    }, 1000);
    
    // Periodic health check every 5 minutes
    setInterval(() => {
        if (window.msccDataService.checkConnectionHealth) {
            window.msccDataService.checkConnectionHealth();
        }
    }, 5 * 60 * 1000);
});
