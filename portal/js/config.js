/**
 * Portal Configuration
 * This file is updated during deployment
 */

// ---------------------------------------------------------------------------
// Developer workbench — switch HERE when moving between cloud and local work.
// ---------------------------------------------------------------------------
const DEV_WORKBENCH = {
    PROFILE: 'cloud', // 'cloud' | 'local'
    LOCAL_API_BASE: 'http://127.0.0.1:18082'
};

const urlParams = new URLSearchParams(window.location.search);
const hashParams = (() => {
    if (!window.location.hash) return new URLSearchParams();
    const hashParts = window.location.hash.split('?');
    return hashParts.length > 1 ? new URLSearchParams(hashParts[1]) : new URLSearchParams();
})();

const getRuntimeParam = (key) => urlParams.get(key) ?? hashParams.get(key);
const IS_LOOPBACK_HOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Debug mode detection (URL param or localStorage)
let debugParam = getRuntimeParam('debug');
if (debugParam === 'true') {
    localStorage.setItem('debug', 'true');
    console.log('[Config] Debug mode ENABLED');
} else if (debugParam === 'false') {
    localStorage.removeItem('debug');
    console.log('[Config] Debug mode DISABLED');
}

const REQUESTED_PROFILE = String(DEV_WORKBENCH.PROFILE || 'cloud').toLowerCase() === 'local' ? 'local' : 'cloud';
const ACTIVE_DEV_PROFILE = (REQUESTED_PROFILE === 'local' && IS_LOOPBACK_HOST) ? 'local' : 'cloud';
const DEBUG_ENABLED = ACTIVE_DEV_PROFILE === 'local' || localStorage.getItem('debug') === 'true';

// Check if we're in production
const IS_PRODUCTION_ENV = window.location.hostname === 'magensec.gigabits.co.in';

// Debug logger utility
// Note: In production, logging is disabled UNLESS debug flag is explicitly set
// Set debug mode: Add ?debug=true to URL or set localStorage.debug='true'
export const logger = {
    debug: (...args) => {
        // Only show debug logs when explicitly enabled
        if (DEBUG_ENABLED) {
            console.log(...args);
        }
    },
    info: (...args) => {
        // Show info logs in dev OR when debug enabled in production
        if (!IS_PRODUCTION_ENV || DEBUG_ENABLED) {
            console.log(...args);
        }
    },
    warn: (...args) => {
        // Show warnings in dev OR when debug enabled in production
        if (!IS_PRODUCTION_ENV || DEBUG_ENABLED) {
            console.warn(...args);
        }
    },
    error: (...args) => {
        // Always show errors, but with different detail levels
        if (!IS_PRODUCTION_ENV || DEBUG_ENABLED) {
            // Full error details in dev or when debug enabled
            console.error(...args);
        } else {
            // Sanitized error in production without debug
            console.error('[Error] An error occurred. Enable debug mode for details.');
            // TODO: Send detailed error to monitoring service (Sentry, Application Insights, etc.)
        }
    }
};

// Resolved URLs (updated by buildDeployContainer.ps1 and Build-Installers.ps1)
const RESOLVED_API_BASE = 'https://ms-central-api.wonderfulflower-8852e801.eastus.azurecontainerapps.io';
const LOCAL_API_BASE = DEV_WORKBENCH.LOCAL_API_BASE;
const RESOLVED_MANIFEST_URL = 'https://msinstallers6w2f9s.blob.core.windows.net/latest/manifest.json?se=2026-12-26T09%3A20%3A24Z&sp=r&spr=https&sv=2022-11-02&sr=b&sig=gPib7xgDbC%2BiGBO6fO3LeOBambQ0A79JNlxhZNvHF%2Bk%3D';

// Safety rail: do not allow persisted runtime overrides to silently redirect auth/API traffic.
localStorage.removeItem('portalDevProfile');
localStorage.removeItem('apiBaseOverride');

// Import constants (will be available after module loading)
// Note: Can't use import here due to load order, constants defined inline below

export const config = {
    // API Configuration
    // - Use direct Azure Container Apps URL for all environments (CORS compatible)
    // - API_BASE updated by buildDeployContainer.ps1 during deployment
    // - MANIFEST_URL updated by Build-Installers.ps1 when publishing packages
    API_BASE: ACTIVE_DEV_PROFILE === 'local' ? LOCAL_API_BASE : RESOLVED_API_BASE,
    MANIFEST_URL: RESOLVED_MANIFEST_URL,
    
    // Portal settings
    PORTAL_NAME: 'MagenSec Portal',
    PORTAL_VERSION: '2.0.0',
    
    // Storage keys (also defined in constants.js for reference)
    STORAGE_KEY: 'magensec_session',
    
    // Environment detection
    IS_LOCAL: IS_LOOPBACK_HOST,
    IS_GITHUB_PAGES: window.location.hostname === 'magensec.github.io',
    IS_PRODUCTION: window.location.hostname === 'magensec.gigabits.co.in',
    
    // Debug mode
    DEBUG: DEBUG_ENABLED,
    DEV_PROFILE: ACTIVE_DEV_PROFILE,
    
    // Client installers - Update these when new versions are released
    INSTALLERS: {
        X64: {
            VERSION: '26.52.49193',
            FILE_SIZE_MB: 65.7,
            DOWNLOAD_URL: 'https://github.com/MagenSec/MagenSec.github.io/releases/download/v26.52.49193/MagenSecBundle-26.52.49193-x64.exe',
            DISPLAY_NAME: 'MagenSec Bundle (x64)',
            DESCRIPTION: 'Complete installer package for 64-bit Windows systems (Engine + Hub)',
            ARCHITECTURE: 'x64',
            WARNING: 'Files are not digitally signed yet and may be flagged by Windows SmartScreen. Click "More info" then "Run anyway" to proceed with installation.'
        },
        ARM64: {
            VERSION: '26.52.49193',
            FILE_SIZE_MB: 65.7,
            DOWNLOAD_URL: 'https://github.com/MagenSec/MagenSec.github.io/releases/download/v26.52.49193/MagenSecBundle-26.52.49193-arm64.exe',
            DISPLAY_NAME: 'MagenSec Bundle (ARM64)',
            DESCRIPTION: 'Complete installer package for ARM64 Windows systems (Engine + Hub)',
            ARCHITECTURE: 'ARM64',
            WARNING: 'Files are not digitally signed yet and may be flagged by Windows SmartScreen. Click "More info" then "Run anyway" to proceed with installation.'
        },
        // Legacy reference for version comparison
        ENGINE: {
            VERSION: '26.52.49193'
        }
    }
};

// Log environment
logger.info('[Config] Environment:', config.IS_LOCAL ? 'LOCAL' : config.IS_GITHUB_PAGES ? 'GITHUB_PAGES' : config.IS_PRODUCTION ? 'PRODUCTION' : 'UNKNOWN');
logger.info('[Config] Dev profile:', config.DEV_PROFILE);
logger.info('[Config] API Base:', config.API_BASE);
if (DEBUG_ENABLED) {
    logger.info('[Config] 🐛 Debug mode ENABLED - Add ?debug=false to URL to disable');
}
