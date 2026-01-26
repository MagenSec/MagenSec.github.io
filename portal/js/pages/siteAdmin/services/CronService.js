/**
 * CronService - Cron job management and admin operations
 * Extracted from SiteAdmin.js
 */

/**
 * Load cron job status
 */
export async function loadCronStatus(api) {
    return await api.get('/api/v1/admin/cron/status');
}

/**
 * Trigger a cron job manually
 */
export async function triggerCron(api, taskId) {
    return await api.adminTriggerCron(taskId);
}

/**
 * Reset remediation status for an organization
 */
export async function resetRemediation(api, orgId, resetCves = true, resetApps = true) {
    return await api.adminResetRemediation(orgId, resetCves, resetApps);
}

/**
 * Get cron task display name
 */
export function getCronTaskName(taskId) {
    const taskNames = {
        'generate-posture-reports': 'Generate Posture Reports',
        'send-email-reports': 'Send Email Reports',
        'cleanup-stale-devices': 'Cleanup Stale Devices',
        'update-cve-database': 'Update CVE Database',
        'archive-old-telemetry': 'Archive Old Telemetry'
    };
    return taskNames[taskId] || taskId;
}

/**
 * Get cron task status color
 */
export function getCronTaskStatusColor(status) {
    switch (status?.toLowerCase()) {
        case 'running':
            return 'bg-info';
        case 'success':
            return 'bg-success';
        case 'failed':
        case 'error':
            return 'bg-danger';
        case 'pending':
            return 'bg-warning';
        default:
            return 'bg-secondary';
    }
}

/**
 * Format cron schedule for display
 */
export function formatCronSchedule(schedule) {
    // Basic cron schedule formatter
    // Returns human-readable format
    const patterns = {
        '0 0 * * *': 'Daily at midnight',
        '0 0 * * 0': 'Weekly on Sunday',
        '0 */6 * * *': 'Every 6 hours',
        '*/15 * * * *': 'Every 15 minutes',
        '0 8 * * 1': 'Weekly on Monday at 8 AM'
    };
    
    return patterns[schedule] || schedule;
}
