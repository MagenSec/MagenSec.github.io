// MagenSec Hub Configuration
window.MagenSecConfig = {
    // API Configuration
    api: {
        base: 'https://ms-central-api.braveisland-ad151ae6.eastus.azurecontainerapps.io',
        endpoints: {
            // Authentication
            auth: '/api/v1/auth',
            oauth: '/oauth',
            
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
            reports: '/portal/api/reports',
            
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
        googleClientId: '530204671754-ev6q9q91d61cpiepvrfetk72m3og7s0k.apps.googleusercontent.com' // Shared with MSCC
    },

    // OAuth Configuration (following MSCC pattern)
    oauth: {
        // Google OAuth Web Client ID (shared with MSCC)
        clientId: '530204671754-ev6q9q91d61cpiepvrfetk72m3og7s0k.apps.googleusercontent.com',
        
        // Dynamic redirect URI based on current location
        get redirectUri() {
            const hostname = window.location.hostname;
            const port = window.location.port;
            const protocol = window.location.protocol;
            
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                const portSuffix = port ? `:${port}` : '';
                return `${protocol}//${hostname}${portSuffix}/portal/`;
            } else if (hostname.includes('github.io')) {
                return `${protocol}//${hostname}/portal/`;
            } else {
                return 'https://magensec.gigabits.co.in/portal/';
            }
        },
        
        // OAuth flow configuration
        responseType: 'code',
        scopes: ['openid', 'email', 'profile'],
        accessType: 'online'
    },
    
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
        mockData: false, // Always use real data
        consoleLogging: true,
        performanceMonitoring: true
    }
};

// Environment-specific overrides
if (window.location.hostname.includes('dev') || window.location.hostname === 'localhost') {
    // Development environment
    window.MagenSecConfig.api.base = 'https://ms-central-api.braveisland-ad151ae6.eastus.azurecontainerapps.io';
    window.MagenSecConfig.development.debug = true;
} else if (window.location.hostname.includes('staging')) {
    // Staging environment
    window.MagenSecConfig.api.base = 'https://ms-central-api-staging.braveisland-ad151ae6.eastus.azurecontainerapps.io';
} else {
    // Production environment
    window.MagenSecConfig.development.debug = false;
    window.MagenSecConfig.development.consoleLogging = false;
}

// Freeze configuration to prevent tampering
Object.freeze(window.MagenSecConfig);
