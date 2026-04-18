/**
 * Device Helper Utilities
 * Shared helpers for device state, version, formatting, etc.
 */

/**
 * Normalize device state to uppercase
 */
export function normalizeState(state) {
    if (!state) return 'UNKNOWN';
    return String(state).toUpperCase();
}

/**
 * Get badge CSS class for device state
 */
export function getStateBadgeClass(state) {
    const s = normalizeState(state);
    switch (s) {
        case 'ACTIVE':
            return 'bg-success';
        case 'DISABLED':
            return 'bg-warning';
        case 'ENABLED':
        case 'INACTIVE':
            return 'bg-primary';
        case 'BLOCKED':
            return 'bg-danger';
        case 'DELETED':
            return 'bg-secondary';
        default:
            return 'bg-secondary';
    }
}

/**
 * Get display text for device state
 */
export function getStateDisplay(state) {
    const s = normalizeState(state);
    switch (s) {
        case 'ACTIVE':
            return 'Active';
        case 'ENABLED':
            return 'Enabled';
        case 'INACTIVE':
            return 'Inactive';
        case 'DISABLED':
            return 'Disabled';
        case 'BLOCKED':
            return 'Blocked';
        case 'DELETED':
            return 'Deleted';
        case 'UNKNOWN':
            return 'Unknown';
        default:
            return s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Unknown';
    }
}

/**
 * Compare device client version against latest version
 */
export function isVersionOutdated(deviceVersion, latestVersion) {
    if (!deviceVersion) return false;
    const parse = (v) => {
        const parts = String(v).split('.').map(Number);
        return { major: parts[0] || 0, minor: parts[1] || 0, build: parts[2] || 0 };
    };
    const a = parse(deviceVersion);
    const b = parse(latestVersion);
    if (a.major < b.major) return true;
    if (a.major === b.major && a.minor < b.minor) return true;
    if (a.major === b.major && a.minor === b.minor && a.build < b.build) return true;
    return false;
}

/**
 * Format network speed in human-readable format
 */
export function formatNetworkSpeed(mbps) {
    const val = Number(mbps || 0);
    if (!val || isNaN(val)) return '';
    if (val >= 1000) {
        return `@ ${(val / 1000).toFixed(1)} Gbps`;
    }
    return `@ ${Math.round(val)} Mbps`;
}

/**
 * Format bytes in human-readable format
 */
export function formatBytesHuman(bytes) {
    const n = Number(bytes) || 0;
    const abs = Math.abs(n);
    if (abs >= 1024 ** 3) return `${(n / (1024 ** 3)).toFixed(2)} GB`;
    if (abs >= 1024 ** 2) return `${(n / (1024 ** 2)).toFixed(2)} MB`;
    if (abs >= 1024) return `${(n / 1024).toFixed(2)} KB`;
    return `${Math.round(n)} B`;
}

/**
 * Format IP addresses (primary or full list)
 */
export function formatIPAddresses(ipArray, mode = 'primary') {
    if (!ipArray || !Array.isArray(ipArray) || ipArray.length === 0) {
        return mode === 'primary' ? 'No IP' : [];
    }
    
    if (mode === 'primary') {
        return ipArray[0] || 'No IP';
    }
    
    // Full list mode
    return ipArray;
}

/**
 * Check if IP is private
 */
export function isPrivateIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // APIPA
    return false;
}

/**
 * Format date in MMM-DD, YYYY format
 */
export function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
}

/**
 * Escape HTML for safe rendering
 */
export function escapeHtml(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Normalize app name by removing architecture suffix
 * Examples:
 * - "Microsoft .NET AppHost Pack - 9.0.11 (x64)" → "Microsoft .NET AppHost Pack - 9.0.11"
 * - "Some App (x64_arm64)" → "Some App"
 */
export function normalizeAppName(appName) {
    if (!appName || typeof appName !== 'string') return '';
    return appName.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().trim();
}

/**
 * Get version sessions from summary (try multiple field names)
 */
export function getVersionSessions(summary) {
    if (!summary) return [];
    const candidates = [
        summary.monitoringSessions,
        summary.MonitoringSessions,
        summary.VersionSessions,
        summary.versionSessions,
        summary.Sessions,
        summary.sessions,
        summary.clientVersionSessions,
        summary.ClientVersionSessions
    ];
    const picked = candidates.find((c) => Array.isArray(c) && c.length > 0);
    return Array.isArray(picked) ? picked : [];
}

/**
 * Get monitoring sessions from summary
 */
export function getMonitoringSessions(summary) {
    if (!summary) return [];
    const candidates = [summary.monitoringSessions, summary.MonitoringSessions];
    const picked = candidates.find((c) => Array.isArray(c) && c.length > 0);
    return Array.isArray(picked) ? picked : [];
}

/**
 * Get PID sessions from summary
 */
export function getPidSessions(summary) {
    if (!summary) return [];
    const candidates = [summary.pidSessions, summary.PidSessions, summary.sessionsPid, summary.SessionsPid];
    const picked = candidates.find((c) => Array.isArray(c) && c.length > 0);
    return Array.isArray(picked) ? picked : [];
}

/**
 * Format monitoring label from session segment
 */
export function formatMonitoringLabel(seg) {
    const clientVersion = seg?.clientVersion || seg?.ClientVersion;
    return clientVersion ? `v${clientVersion}` : 'Monitoring';
}
