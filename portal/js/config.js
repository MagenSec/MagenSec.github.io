/**
 * Portal Configuration
 * This file is updated by buildDeployContainer.ps1 during deployment
 */

// Debug mode detection (URL param or localStorage)
// Support both regular query params and hash-bang params (#!/dashboard?debug=true)
let debugParam = null;

// Check regular query params first
const urlParams = new URLSearchParams(window.location.search);
debugParam = urlParams.get('debug');

// Check hash-bang query params if not found
if (!debugParam && window.location.hash) {
    const hashParts = window.location.hash.split('?');
    if (hashParts.length > 1) {
        const hashParams = new URLSearchParams(hashParts[1]);
        debugParam = hashParams.get('debug');
    }
}

if (debugParam === 'true') {
    localStorage.setItem('debug', 'true');
    console.log('[Config] Debug mode ENABLED');
} else if (debugParam === 'false') {
    localStorage.removeItem('debug');
    console.log('[Config] Debug mode DISABLED');
}
const DEBUG_ENABLED = localStorage.getItem('debug') === 'true';

// Debug logger utility
export const logger = {
    debug: (...args) => {
        if (DEBUG_ENABLED) {
            console.log(...args);
        }
    },
    info: (...args) => {
        console.log(...args); // Always log important info
    },
    warn: (...args) => {
        console.warn(...args); // Always log warnings
    },
    error: (...args) => {
        console.error(...args); // Always log errors
    }
};

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
    IS_PRODUCTION: window.location.hostname === 'magensec.gigabits.co.in',
    
    // Debug mode
    DEBUG: DEBUG_ENABLED
};

// Log environment
logger.info('[Config] Environment:', config.IS_LOCAL ? 'LOCAL' : config.IS_GITHUB_PAGES ? 'GITHUB_PAGES' : config.IS_PRODUCTION ? 'PRODUCTION' : 'UNKNOWN');
logger.info('[Config] API Base:', config.API_BASE);
if (DEBUG_ENABLED) {
    logger.info('[Config] 🐛 Debug mode ENABLED - Add ?debug=false to URL to disable');
}
