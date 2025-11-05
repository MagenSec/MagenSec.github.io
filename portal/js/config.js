/**
 * Portal Configuration
 * This file is updated by buildDeployContainer.ps1 during deployment
 */

export const config = {
    // API Configuration - Updated by deployment script
    API_BASE: 'https://ms-central-api.proudsand-cb69619a.eastus.azurecontainerapps.io',
    
    // Portal settings
    PORTAL_NAME: 'MagenSec Portal',
    PORTAL_VERSION: '2.0.0',
    
    // Storage keys
    STORAGE_KEY: 'magensec_session',
    
    // Environment detection
    IS_LOCAL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    IS_GITHUB_PAGES: window.location.hostname === 'magensec.github.io',
    IS_PRODUCTION: window.location.hostname === 'magensec.gigabits.co.in'
};

// Log environment
console.log('[Config] Environment:', config.IS_LOCAL ? 'LOCAL' : config.IS_GITHUB_PAGES ? 'GITHUB_PAGES' : config.IS_PRODUCTION ? 'PRODUCTION' : 'UNKNOWN');
console.log('[Config] API Base:', config.API_BASE);
