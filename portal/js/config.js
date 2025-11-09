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
    // API Configuration - Always use short.gy URL (never hardcode direct Azure Container Apps URL)
    // This allows zero-downtime deployments by updating short.gy redirect target
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
    DEBUG: DEBUG_ENABLED,
    
    // Client installers - Update these when new versions are released
    INSTALLERS: {
        X64: {
            VERSION: '25.116.53993',
            FILE_SIZE_MB: 65.7,
            DOWNLOAD_URL: 'https://github.com/MagenSec/MagenSec.github.io/releases/download/v25.116.53993/MagenSecBundle-25.116.53993-x64.exe',
            DISPLAY_NAME: 'MagenSec Bundle (x64)',
            DESCRIPTION: 'Complete installer package for 64-bit Windows systems (Engine + Hub)',
            ARCHITECTURE: 'x64',
            WARNING: 'Files are not digitally signed yet and may be flagged by Windows SmartScreen. Click "More info" then "Run anyway" to proceed with installation.'
        },
        ARM64: {
            VERSION: '25.116.53993',
            FILE_SIZE_MB: 65.7,
            DOWNLOAD_URL: 'https://github.com/MagenSec/MagenSec.github.io/releases/download/v25.116.53993/MagenSecBundle-25.116.53993-arm64.exe',
            DISPLAY_NAME: 'MagenSec Bundle (ARM64)',
            DESCRIPTION: 'Complete installer package for ARM64 Windows systems (Engine + Hub)',
            ARCHITECTURE: 'ARM64',
            WARNING: 'Files are not digitally signed yet and may be flagged by Windows SmartScreen. Click "More info" then "Run anyway" to proceed with installation.'
        },
        // Legacy reference for version comparison
        ENGINE: {
            VERSION: '25.116.53993'
        }
    }
};

// Log environment
logger.info('[Config] Environment:', config.IS_LOCAL ? 'LOCAL' : config.IS_GITHUB_PAGES ? 'GITHUB_PAGES' : config.IS_PRODUCTION ? 'PRODUCTION' : 'UNKNOWN');
logger.info('[Config] API Base:', config.API_BASE);
if (DEBUG_ENABLED) {
    logger.info('[Config] 🐛 Debug mode ENABLED - Add ?debug=false to URL to disable');
}
