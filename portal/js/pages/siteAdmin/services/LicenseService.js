/**
 * LicenseService - License management operations
 * Extracted from SiteAdmin.js
 */

/**
 * Create a new license for an organization
 */
export async function createLicense(api, orgId, seats, durationDays) {
    return await api.post('/api/v1/licenses', {
        orgId,
        seats: parseInt(seats),
        durationDays: parseInt(durationDays)
    });
}

/**
 * Toggle license enabled/disabled status
 */
export async function toggleLicenseStatus(api, licenseId, isCurrentlyDisabled) {
    const endpoint = isCurrentlyDisabled ? 'enable' : 'disable';
    return await api.put(`/api/v1/licenses/${licenseId}/${endpoint}`);
}

/**
 * Delete a license
 */
export async function deleteLicense(api, licenseId) {
    return await api.delete(`/api/v1/licenses/${licenseId}`);
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
