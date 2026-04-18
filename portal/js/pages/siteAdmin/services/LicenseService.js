/**
 * LicenseService - License management operations
 * Extracted from SiteAdmin.js
 */

/**
 * Valid license types aligned with org types
 */
export const LICENSE_TYPES = ['Personal', 'Education', 'Business', 'Demo'];

/**
 * Create a new license for an organization
 */
export async function createLicense(api, orgId, seats, durationDays, licenseType) {
    return await api.post('/api/v1/licenses/action', {
        operation: 'create-new',
        orgId,
        seats: parseInt(seats),
        durationDays: parseInt(durationDays),
        ...(licenseType ? { licenseType } : {})
    });
}

/**
 * Toggle license enabled/disabled status
 */
export async function toggleLicenseStatus(api, licenseId, orgId, isCurrentlyDisabled) {
    return await api.post('/api/v1/licenses/action', {
        operation: 'state',
        licenseId,
        orgId,
        active: isCurrentlyDisabled
    });
}

/**
 * Delete a license
 */
export async function deleteLicense(api, licenseId, orgId) {
    return await api.post('/api/v1/licenses/action', {
        operation: 'delete',
        licenseId,
        orgId
    });
}

/**
 * Get license status badge class
 */
export function getLicenseStatusClass(license) {
    if (license.isDisabled) return 'bg-danger';
    if (license.remainingCredits <= 0) return 'bg-warning';
    return 'bg-success';
}

/**
 * Get license status text
 */
export function getLicenseStatusText(license) {
    if (license.isDisabled) return 'Disabled';
    if (license.remainingCredits <= 0) return 'Expired';
    return 'Active';
}

/**
 * Get license type badge class for display
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
 * Format license duration for display
 */
export function formatDuration(days) {
    if (days >= 365) {
        const years = Math.floor(days / 365);
        return years === 1 ? '1 year' : `${years} years`;
    }
    if (days >= 30) {
        const months = Math.floor(days / 30);
        return months === 1 ? '1 month' : `${months} months`;
    }
    return `${days} days`;
}

/**
 * Calculate credit utilization percentage
 */
export function getCreditUtilization(remainingCredits, totalCredits) {
    if (totalCredits === 0) return 0;
    return Math.round((remainingCredits / totalCredits) * 100);
}

/**
 * Check if a license type generates revenue
 * Demo licenses consume credits but generate $0 revenue
 */
export function isRevenueGenerating(licenseType) {
    return licenseType !== 'Demo';
}
