// Configuration for the MagenSec Portal
// API base will be updated by buildDeployContainer.ps1 for production deployments

window.MagenSecConfig = {
    // API Configuration
    api: {
        // Development: localhost:8080, Production: set by build script
        base: 'https://ms-central-api.braveisland-ad151ae6.eastus.azurecontainerapps.io', // Replaced by buildDeployContainer.ps1
        endpoints: {
            // Authentication
            auth: '/api/v1/auth',
            oauth: '/api/oauth',
            
            // Dashboard & Analytics
            dashboard: '/portal/api/dashboard',
            stats: '/portal/api/stats',
            
            // Device Management
            devices: '/api/v1/devices',
            deviceBatch: '/api/v1/batch/devices',
            
            // Organization Management
            organizations: '/api/v1/organizations',
            
            // Threat Management
            threats: '/portal/api/threats',
            
            // Compliance
            compliance: '/portal/api/compliance',
            
            // Activities & Audit
            activities: '/portal/api/activities',
            
            // Reports
            reports: '/api/reports',
            
            // Admin
            admin: '/api/v1/admin',
            
            // Health & Status
            health: '/healthz'
        },
        timeout: 30000, // 30 seconds
        retryAttempts: 3
    },
    
    // Authentication Configuration
    auth: {
        tokenKey: 'magensec_token',
        refreshKey: 'magensec_refresh',
        userKey: 'magensec_user',
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        refreshThreshold: 5 * 60 * 1000, // Refresh when 5 minutes left
        autoLogoutWarning: 2 * 60 * 1000, // Warn 2 minutes before logout
    },

    // OAuth Configuration - Always retrieved from API endpoint
    // This ensures consistency between portal and API configurations
    
    // Portal-specific settings
    portal: {
        name: 'MagenSec Security Portal',
        version: '1.0.0',
        dashboardUrl: '/portal/#/dashboard'
    },
    
    // UI Configuration
    ui: {
        theme: 'modern',
        animation: true,
        pageSize: 25,
        maxPageSize: 100,
        refreshInterval: 30000, // 30 seconds for real-time updates
        debounceTime: 300, // ms for search
        toastDuration: 5000 // 5 seconds
    },
    
    // Security Settings
    security: {
        csrfProtection: true,
        contentSecurityPolicy: true,
        maxFileUploadSize: 10 * 1024 * 1024, // 10MB
        allowedFileTypes: ['.json', '.csv', '.txt', '.log']
    },
    
    // Feature Flags
    features: {
        realTimeUpdates: true,
        advancedReports: true,
        bulkOperations: true,
        mobileSupport: true,
        darkMode: false, // Coming soon
        aiInsights: true,
        complianceCenter: true,
        threatIntelligence: true
    },
    
    // Pricing & Plans
    pricing: {
        perDeviceMonthly: 30,
        currency: 'USD',
        freeTrial: 14, // days
        maxFreeDevices: 5
    },
    
    // Application Metadata
    app: {
        name: 'MagenSec Hub',
        version: '2.0.0',
        description: 'Enterprise Security Management Platform',
        vendor: 'MagenSec',
        supportEmail: 'support@magensec.com',
        documentationUrl: 'https://docs.magensec.com',
        statusPageUrl: 'https://status.magensec.com'
    },
    
    // Development & Debug
    development: {
        debug: window.location.hostname === 'localhost' || window.location.hostname.includes('dev'),
        mockData: false, // Use real API data
        superAdminEmail: 'talktomagensec@gmail.com', // Cannot be deleted, recreated if missing
        consoleLogging: true,
        performanceMonitoring: true
    }
};

// Environment-specific overrides
// API base is determined by the config above and will be updated by buildDeployContainer.ps1

// Simple API resolver that returns the configured API base
window.apiResolver = {
    async resolveApiBase() {
        return window.MagenSecConfig.api.base;
    }
};

// Freeze configuration to prevent tampering
Object.freeze(window.MagenSecConfig);
