/**
 * OrgService - Organization management operations
 * Extracted from SiteAdmin.js
 */

/**
 * Create a new organization with license and email configuration
 */
export async function createOrganization(api, payload) {
    return await api.post('/api/v1/admin/orgs', payload);
}

/**
 * Update organization details and email configuration
 */
export async function updateOrganization(api, orgId, payload) {
    return await api.put(`/api/v1/admin/orgs/${orgId}`, payload);
}

/**
 * Load organization details with licenses and email config
 */
export async function loadOrgDetails(api, orgId) {
    const result = {
        licenses: [],
        emailConfig: null
    };

    // Load licenses
    try {
        const res = await api.get(`/api/v1/licenses/org/${orgId}`);
        if (res.success) {
            result.licenses = res.data || [];
        }
    } catch (error) {
        console.error('[OrgService] Error loading licenses:', error);
    }

    // Load email configuration
    try {
        const configRes = await api.get(`/api/v1/admin/email/${orgId}/config`);
        if (configRes.success && configRes.data) {
            result.emailConfig = configRes.data;
        }
    } catch (error) {
        console.warn('[OrgService] Could not load report config:', error);
        // Provide defaults
        result.emailConfig = {
            reportEnabled: true,
            weeklyEnabled: true,
            dailySnapshotEnabled: false,
            sendToAllTeamMembers: true,
            reportTier: 'Professional'
        };
    }

    return result;
}

/**
 * Toggle organization enabled/disabled status
 */
export async function toggleOrgStatus(api, orgId, isCurrentlyDisabled) {
    const endpoint = isCurrentlyDisabled ? 'enable' : 'disable';
    return await api.put(`/api/v1/admin/orgs/${orgId}/${endpoint}`);
}

/**
 * Delete organization and all associated data
 */
export async function deleteOrganization(api, orgId) {
    return await api.delete(`/api/v1/admin/orgs/${orgId}`);
}

/**
 * Transfer organization ownership to a new owner
 */
export async function transferOwnership(api, orgId, newOwnerEmail) {
    return await api.post(`/api/v1/admin/orgs/${orgId}/transfer`, {
        newOwnerEmail
    });
}

/**
 * Validate organization creation payload
 */
export function validateOrgCreation(orgName, ownerEmail) {
    const errors = [];
    
    if (!orgName || !orgName.trim()) {
        errors.push('Organization name is required');
    } else if (orgName.trim().length < 4) {
        errors.push('Organization name must be at least 4 characters long');
    }
    
    if (!ownerEmail || !ownerEmail.trim()) {
        errors.push('Owner email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
        errors.push('Owner email must be valid');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Build organization creation payload
 */
export function buildOrgPayload(formData) {
    return {
        orgName: formData.orgName,
        ownerEmail: formData.ownerEmail,
        seats: parseInt(formData.seats, 10),
        days: parseInt(formData.duration, 10),
        reportEnabled: formData.reportEnabled,
        weeklyEnabled: formData.weeklyEnabled,
        dailySnapshotEnabled: formData.dailySnapshotEnabled,
        sendToAllTeamMembers: formData.sendToAllMembers,
        reportTier: formData.businessTier
    };
}
