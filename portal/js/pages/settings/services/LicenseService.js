/**
 * LicenseService - License management operations
 * Extracted from Settings.js
 */

/**
 * Valid license types
 */
export const LICENSE_TYPES = ['Personal', 'Education', 'Business', 'Demo'];

/**
 * Validate license key format
 */
export function validateLicenseKey(key) {
    if (!key || typeof key !== 'string') {
        return { valid: false, error: 'License key is required' };
    }

    // License format: XXXX-XXXX-XXXX (uppercase alphanumeric)
    const licensePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    
    if (licensePattern.test(key)) {
        return { valid: true };
    }

    return { valid: false, error: 'Invalid license key format. Expected: XXXX-XXXX-XXXX' };
}

/**
 * Get license type badge class
 */
export function getLicenseTypeBadgeClass(licenseType) {
    switch (licenseType) {
        case 'Personal': return 'bg-info-lt text-info';
        case 'Education': return 'bg-success-lt text-success';
        case 'Demo': return 'bg-warning-lt text-warning';
        default: return 'bg-primary-lt text-primary'; // Business
    }
}

/**
 * Get license status badge class
 */
export function getLicenseStatusBadgeClass(license) {
    if (!license) return 'bg-secondary';
    
    const isDisabled = license.isDisabled || license.disabled;
    const hasCredits = (license.remainingCredits ?? license.creditsRemaining ?? 0) > 0;
    
    if (isDisabled) return 'bg-danger';
    if (!hasCredits) return 'bg-warning';
    return 'bg-success';
}

/**
 * Get license status text
 */
export function getLicenseStatusText(license) {
    if (!license) return 'Unknown';
    
    const isDisabled = license.isDisabled || license.disabled;
    const hasCredits = (license.remainingCredits ?? license.creditsRemaining ?? 0) > 0;
    
    if (isDisabled) return 'Disabled';
    if (!hasCredits) return 'Expired';
    return 'Active';
}

/**
 * Format license for display
 */
export function formatLicenseDisplay(license) {
    if (!license) return null;
    
    return {
        id: license.licenseId || license.id,
        key: license.licenseKey || license.key,
        type: license.licenseType || license.type || 'Business',
        seats: license.seats || license.seatCount || 0,
        remainingCredits: license.remainingCredits ?? license.creditsRemaining ?? 0,
        totalCredits: license.totalCredits ?? license.creditsTotal ?? 0,
        isDisabled: license.isDisabled || license.disabled || false,
        isDemo: (license.licenseType || license.type) === 'Demo',
        createdAt: license.createdAt || license.created,
        lastRotated: license.lastRotated || license.rotatedAt,
        status: getLicenseStatusText(license),
        badgeClass: getLicenseStatusBadgeClass(license),
        typeBadgeClass: getLicenseTypeBadgeClass(license.licenseType || license.type)
    };
}

/**
 * Calculate license utilization percentage
 */
export function calculateLicenseUtilization(license) {
    if (!license || !license.totalCredits || license.totalCredits <= 0) {
        return 0;
    }
    
    const remaining = license.remainingCredits ?? 0;
    const total = license.totalCredits;
    const used = total - remaining;
    
    return Math.round((used / total) * 100);
}

/**
 * Check if a license type generates revenue
 * Demo licenses consume credits but generate $0 revenue
 */
export function isRevenueGenerating(licenseType) {
    return licenseType !== 'Demo';
}
