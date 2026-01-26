/**
 * General formatting utilities
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

export function formatNetworkSpeed(mbps) {
    const val = Number(mbps || 0);
    if (!val || isNaN(val)) return '';
    if (val >= 1000) {
        const gbps = Math.round((val / 1000) * 10) / 10;
        return `@ ${gbps.toFixed(1)} Gbps`;
    }
    return `@ ${Math.round(val)} Mbps`;
}

export function formatBytesHuman(bytes) {
    const n = Number(bytes) || 0;
    const abs = Math.abs(n);
    if (abs >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (abs >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
    if (abs >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${Math.round(n)} B`;
}

export function formatIPAddresses(ipArray, mode = 'primary') {
    if (!ipArray || !Array.isArray(ipArray) || ipArray.length === 0) {
        return mode === 'primary' ? 'No IP' : [];
    }
    
    if (mode === 'primary') {
        // Primary IP only; "Show all" control reveals the full list
        return ipArray[0];
    }
    
    // Full list mode
    return ipArray;
}
