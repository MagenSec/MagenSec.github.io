/**
 * Array sorting utilities for CVEs, devices, and other data
 */

export function sortBySeverity(a, b) {
    const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
    const aSev = (a.severity || '').toUpperCase();
    const bSev = (b.severity || '').toUpperCase();
    return (severityOrder[bSev] || 0) - (severityOrder[aSev] || 0);
}

export function sortByDate(a, b, field = 'lastSeen') {
    const aDate = new Date(a[field] || 0).getTime();
    const bDate = new Date(b[field] || 0).getTime();
    return bDate - aDate; // Descending (newest first)
}

export function sortByEpss(a, b) {
    const aEpss = Number(a.epssScore || 0);
    const bEpss = Number(b.epssScore || 0);
    return bEpss - aEpss; // Descending (highest risk first)
}

export function sortByName(a, b, field = 'name') {
    const aName = (a[field] || '').toLowerCase();
    const bName = (b[field] || '').toLowerCase();
    return aName.localeCompare(bName);
}

export function sortByRiskScore(a, b) {
    const aScore = Number(a.riskScore || 0);
    const bScore = Number(b.riskScore || 0);
    return bScore - aScore; // Descending (highest risk first)
}
