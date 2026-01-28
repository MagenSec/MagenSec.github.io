/**
 * AccountService - User account management operations
 * Extracted from SiteAdmin.js
 */

/**
 * Load all user accounts
 */
export async function loadAccounts(api) {
    try {
        const accountsRes = await api.adminListAccounts();
        if (accountsRes.success && accountsRes.data) {
            const accountsData = accountsRes.data.accounts ?? accountsRes.data ?? [];
            return Array.isArray(accountsData) ? accountsData : [];
        }
    } catch (err) {
        console.debug('[AccountService] Accounts endpoint not available', err);
    }
    return [];
}

/**
 * Change user type (Individual <-> SiteAdmin)
 */
export async function changeUserType(api, userId, newUserType) {
    return await api.put(`/api/v1/admin/users/${userId}/change-type`, {
        newUserType
    });
}

/**
 * Get user type badge class
 */
export function getUserTypeBadgeClass(userType) {
    switch (userType) {
        case 'SiteAdmin':
            return 'bg-danger';
        case 'EndUser':
            return 'bg-success';
        default:
            return 'bg-secondary';
    }
}

/**
 * Get available user types for conversion
 */
export function getAvailableUserTypes(currentType) {
    // Only allow EndUser <-> SiteAdmin conversions
    return ['EndUser', 'SiteAdmin'];
}

/**
 * Format user creation date
 */
export function formatCreatedDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
}
