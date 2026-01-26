/**
 * Data formatting and transformation utilities
 * Shared across dashboard, devices, and posture pages
 */

/**
 * Format timestamp to human-readable string
 */
export function formatTimestamp(value) {
    if (!value) return 'Never';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(value) {
    if (!value) return 'Never';
    const now = Date.now();
    const time = new Date(value).getTime();
    const diffMs = now - time;
    
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return formatTimestamp(value);
}

/**
 * Format large numbers with K/M suffixes
 */
export function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

/**
 * Format percentage with optional decimal places
 */
export function formatPercent(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return '0%';
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals) + '%';
}

/**
 * Round percentage to nearest integer
 */
export function roundPercent(value) {
    if (value === null || value === undefined || isNaN(value)) return 0;
    return Math.round(value);
}

/**
 * Safe number extraction with fallback
 */
export function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return isNaN(num) || !isFinite(num) ? fallback : num;
}

/**
 * Format device list for display
 * Returns first N devices + "...X more" text
 */
export function formatDeviceList(devices, maxDisplay = 3) {
    if (!devices || devices.length === 0) {
        return { text: '', links: [], hasMore: false, remaining: 0 };
    }

    const displayDevices = devices.slice(0, maxDisplay);
    const remaining = devices.length - maxDisplay;
    const hasMore = devices.length > maxDisplay;

    const links = displayDevices.map(d => ({
        name: d.deviceName || d.deviceId || d.name || d.id,
        href: d.deviceId ? `#!/devices/${d.deviceId}` : (d.id ? `#!/devices/${d.id}` : null)
    }));

    return {
        text: displayDevices.map(d => d.deviceName || d.deviceId || d.name || d.id).join(', '),
        links,
        hasMore,
        remaining
    };
}

/**
 * Group array by property
 */
export function groupBy(array, key) {
    return array.reduce((result, item) => {
        const group = item[key];
        if (!result[group]) {
            result[group] = [];
        }
        result[group].push(item);
        return result;
    }, {});
}

/**
 * Sort array by multiple fields
 */
export function sortBy(array, ...fields) {
    return array.slice().sort((a, b) => {
        for (const field of fields) {
            const desc = field.startsWith('-');
            const key = desc ? field.slice(1) : field;
            const aVal = a[key];
            const bVal = b[key];
            
            if (aVal < bVal) return desc ? 1 : -1;
            if (aVal > bVal) return desc ? -1 : 1;
        }
        return 0;
    });
}

/**
 * Deduplicate array by property
 */
export function uniqueBy(array, key) {
    const seen = new Set();
    return array.filter(item => {
        const val = item[key];
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
    });
}

/**
 * Calculate percentage safely
 */
export function calculatePercent(part, total) {
    if (!total || total === 0) return 0;
    return (part / total) * 100;
}

/**
 * Validate and sanitize input
 */
export function sanitizeInput(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[<>]/g, '');
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce function calls
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function calls
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
