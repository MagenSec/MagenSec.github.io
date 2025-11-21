/**
 * Application Constants
 * Centralized configuration values and magic numbers
 */

export const CONSTANTS = {
    // API and Network
    API_TIMEOUT_MS: 30000, // 30 seconds
    CACHE_TIMEOUT_MS: 60000, // 1 minute
    
    // Polling
    POLL_INTERVAL_MS: 5000, // 5 seconds
    MAX_POLL_ATTEMPTS: 60, // 5 minutes total (60 * 5000ms)
    
    // Input Validation
    MAX_PROMPT_LENGTH: 5000,
    MAX_COMMENT_LENGTH: 1000,
    
    // Display Limits
    MAX_TOP_RISK_FACTORS: 3,
    MAX_RECOMMENDATIONS: 4,
    MAX_DEVICES_AT_RISK: 5,
    
    // Cache Keys
    STORAGE_KEY_SESSION: 'magensec_session',
    STORAGE_KEY_SELECTED_ORG: 'selectedOrgId',
    STORAGE_KEY_DEBUG: 'debug',
    STORAGE_KEY_THEME: 'theme',
    
    // Device Status
    DEVICE_ACTIVE_THRESHOLD_MINUTES: 15,
    DEVICE_WARNING_THRESHOLD_MINUTES: 60,
    
    // Chart Colors
    CHART_COLORS: {
        primary: '#206bc4',
        success: '#2fb344',
        warning: '#f76707',
        danger: '#d63939',
        info: '#4299e1',
        purple: '#ae3ec9'
    }
};
