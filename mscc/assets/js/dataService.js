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

    /**
     * Load SAS URL for a specific table
     */
    async function loadSasUrl(table) {
        if (sasUrlMap[table]) return sasUrlMap[table];
        
        if (!sasUrlBase) {
            try {
                // Try to load from the Cloud API first
                const apiBase = await getApiBase();
                const response = await fetch(`${apiBase}/api/azure/sas-token?table=${table}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('mscc_session_token')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    sasUrlBase = data.sasUrl;
                } else {
                    throw new Error(`Failed to get SAS token: ${response.status}`);
                }
            } catch (error) {
                console.warn('Failed to get SAS URL from API, using demo mode:', error);
                // Fallback to demo mode
                return null;
            }
        }
        
        // Replace table name in SAS URL
        let tableUrl = sasUrlBase.replace(/PerfTelemetry\(\)/, table + '()');
        sasUrlMap[table] = tableUrl;
        return tableUrl;
    }

    /**
     * Get API base URL
     */
    async function getApiBase() {
        // Use the configured API base from config.js (stamped during deployment)
        return await window.apiResolver.resolveApiBase();
    }

    /**
     * Fetch data from Azure Tables using OData
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

            console.log(`Fetching from Azure Tables: ${table}`);
            const response = await fetch(urlObj.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json;odata=minimalmetadata',
                    'User-Agent': 'MagenSec-MSCC/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const entities = data.value || [];

            // Cache the result with 5-minute expiry
            cache.setItem(key, {
                data: entities,
                expiry: Date.now() + 5 * 60 * 1000
            });

            console.log(`Retrieved ${entities.length} records from ${table}`);
            return entities;

        } catch (error) {
            console.error(`Error fetching from ${table}:`, error);
            // Return demo data on error
            return getDemoData(table);
        }
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
        cache: {
            clear: () => cache.clearOld(),
            get: (key) => cache.getItem(key),
            set: (key, value) => cache.setItem(key, value)
        }
    };
})();

// Auto-initialize when loaded
document.addEventListener('DOMContentLoaded', () => {
    window.msccDataService.init();
});
