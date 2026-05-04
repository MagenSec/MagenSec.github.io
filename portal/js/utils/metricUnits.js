export const METRIC_UNITS = Object.freeze({
    uniqueCves: {
        singular: 'Unique CVE',
        plural: 'Unique CVEs',
        help: 'Distinct CVE identifiers, counted once even when the same CVE appears on multiple devices.'
    },
    cveExposures: {
        singular: 'CVE exposure',
        plural: 'CVE exposures',
        help: 'One affected device/application/version instance. The same CVE on multiple devices creates multiple exposures.'
    },
    vulnerableApps: {
        singular: 'Vulnerable app',
        plural: 'Vulnerable apps',
        help: 'Applications with confirmed vulnerable versions currently in scope.'
    },
    affectedDevices: {
        singular: 'Affected device',
        plural: 'Affected devices',
        help: 'Managed devices connected to the finding or evidence row.'
    },
    openAlertInstances: {
        singular: 'Open alert instance',
        plural: 'Open alert instances',
        help: 'Individual open alert rows. One distinct issue can create multiple instances across devices.'
    },
    distinctIssues: {
        singular: 'Distinct issue',
        plural: 'Distinct issues',
        help: 'Unique issue/control groups that an operator needs to triage.'
    },
    needsReview: {
        singular: 'Needs review item',
        plural: 'Needs review items',
        help: 'Unconfirmed detections that require review before they count as confirmed CVEs.'
    }
});

export function metricTitle(key) {
    return METRIC_UNITS[key]?.plural || key;
}

export function metricUnit(key, count = 2) {
    const unit = METRIC_UNITS[key];
    if (!unit) return key;
    return Number(count) === 1 ? unit.singular : unit.plural;
}

export function metricPhrase(key, count, options = {}) {
    const numeric = Number(count) || 0;
    const value = options.format === false ? String(numeric) : numeric.toLocaleString();
    return `${value} ${metricUnit(key, numeric)}`;
}

export function metricHelp(key) {
    return METRIC_UNITS[key]?.help || '';
}
