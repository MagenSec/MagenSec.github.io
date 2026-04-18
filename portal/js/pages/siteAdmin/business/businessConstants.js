/**
 * Business Dashboard Constants
 * Exchange rates, currency helpers, thresholds, and label mappings.
 */

// ── Currency ────────────────────────────────────────────────────────
export const EXCHANGE_RATES = { USD: 1, INR: 83.5, EUR: 0.92, GBP: 0.79 };

export const CURRENCY_SYMBOLS = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };

export function getCurrencySymbol(code) {
    return CURRENCY_SYMBOLS[(code || 'USD').toUpperCase()] || '$';
}

export function getNumberLocale(code) {
    return (code || 'USD').toUpperCase() === 'USD' ? 'en-US' : 'en-IN';
}

export function formatNumberByCurrency(value, currencyCode = 'USD', decimals = 0) {
    const n = Number(value || 0);
    return n.toLocaleString(getNumberLocale(currencyCode), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

export function convertCurrency(value, fromCode, toCode) {
    const from = (fromCode || 'USD').toUpperCase();
    const to = (toCode || 'USD').toUpperCase();
    if (from === to) return Number(value || 0);
    const inUsd = Number(value || 0) / (EXCHANGE_RATES[from] || 1);
    return inUsd * (EXCHANGE_RATES[to] || 1);
}

// ── Number / Currency Formatters ────────────────────────────────────
export function formatCurrency(value, symbol = '$', decimals = 2, currencyCode = 'USD') {
    const n = Number(value || 0);
    return `${symbol}${formatNumberByCurrency(n, currencyCode, decimals)}`;
}

export function formatCompact(value) {
    const n = Number(value || 0);
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export function formatPercent(value, decimals = 1) {
    return `${Number(value || 0).toFixed(decimals)}%`;
}

// ── Margin & Health ─────────────────────────────────────────────────
export const MARGIN_THRESHOLDS = [
    { min: 80, label: 'Excellent', badge: 'bg-success text-white', color: '#2fb344' },
    { min: 60, label: 'Healthy',   badge: 'bg-green-lt text-green', color: '#74b816' },
    { min: 40, label: 'Warning',   badge: 'bg-warning text-white', color: '#f59f00' },
    { min: 20, label: 'At Risk',   badge: 'bg-orange text-white', color: '#f76707' },
    { min: -Infinity, label: 'Critical', badge: 'bg-danger text-white', color: '#d63939' },
];

export function getMarginInfo(marginPercent) {
    const m = Number(marginPercent || 0);
    return MARGIN_THRESHOLDS.find(t => m >= t.min) || MARGIN_THRESHOLDS[MARGIN_THRESHOLDS.length - 1];
}

export function getHealthGrade(margin) {
    const m = Number(margin || 0);
    if (m >= 85) return { grade: 'A+', badge: 'bg-success text-white' };
    if (m >= 75) return { grade: 'A',  badge: 'bg-success text-white' };
    if (m >= 60) return { grade: 'B',  badge: 'bg-green-lt text-green' };
    if (m >= 40) return { grade: 'C',  badge: 'bg-warning text-white' };
    if (m >= 20) return { grade: 'D',  badge: 'bg-orange text-white' };
    return { grade: 'F', badge: 'bg-danger text-white' };
}

// ── Telemetry Type Labels ───────────────────────────────────────────
export const TELEMETRY_LABELS = {
    Heartbeat: 'Heartbeat',
    Inventory: 'Inventory',
    Alerts: 'Alerts',
    Performance: 'Performance',
    Signals: 'Signals',
    // Legacy names mapped to current business wording
    MachineEvents: 'Signals',
    AppTelemetry: 'Inventory',
    CveTelemetry: 'Alerts',
    PerfTelemetry: 'Performance',
    MachineTelemetry: 'Signals',
};

export const TELEMETRY_COLORS = {
    Heartbeat:      '#0054a6',
    Inventory:      '#2fb344',
    Alerts:         '#d63939',
    Performance:    '#f59f00',
    Signals:        '#ae3ec9',
    // Legacy
    MachineEvents:  '#f76707',
    AppTelemetry:   '#74b816',
    CveTelemetry:   '#e8590c',
    PerfTelemetry:  '#f59f00',
    MachineTelemetry:'#0ca678',
};

// ── Trend Helpers ───────────────────────────────────────────────────
export function calcTrendPercent(current, previous) {
    if (!previous || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

export function trendArrow(pct) {
    if (pct == null) return '';
    return pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
}

export function trendBadgeClass(pct, higherIsBetter = true) {
    if (pct == null) return 'bg-secondary text-white';
    const positive = higherIsBetter ? pct > 0 : pct < 0;
    const negative = higherIsBetter ? pct < 0 : pct > 0;
    if (positive) return 'bg-success text-white';
    if (negative) return 'bg-danger text-white';
    return 'bg-secondary text-white';
}

// ── Region Labels ───────────────────────────────────────────────────
export const KNOWN_REGION_ORDER = ['eastus', 'westus', 'westeurope', 'centralindia', 'australiaeast'];

export const REGION_LABELS = {
    us: 'US East',
    useast: 'US East',
    useast2: 'US East 2',
    eastus: 'US East',
    eastus2: 'US East 2',
    uswest: 'US West',
    westus: 'US West',
    westus2: 'US West 2',
    centralus: 'US Central',
    eu: 'EU West',
    euwest: 'EU West',
    westeurope: 'EU West',
    eunorth: 'EU North',
    northeurope: 'EU North',
    india: 'Central India',
    in: 'Central India',
    incentral: 'Central India',
    indiacentral: 'Central India',
    centralindia: 'Central India',
    southindia: 'South India',
    australia: 'Australia East',
    aueast: 'Australia East',
    australiaeast: 'Australia East',
    intercontinental: 'Intercontinental',
    unassigned: 'Unassigned',
    unknown: 'Unknown',
};

export function getRegionLabel(code) {
    const raw = (code || '').toString().trim();
    if (!raw) return 'Unknown';

    const normalized = raw.toLowerCase().replace(/[\s\-_/()]+/g, '');
    return REGION_LABELS[normalized] || raw;
}
