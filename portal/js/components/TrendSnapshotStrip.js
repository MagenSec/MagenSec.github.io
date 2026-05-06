import { rewindContext } from '@rewindContext';

const { html } = window;

const CONTEXT_METRICS = {
    dashboard: [
        { key: 'riskScore', label: 'Security score', suffix: '/100', higherBetter: true, icon: 'ti-shield-check' },
        { key: 'criticalCves', label: 'Critical CVEs', suffix: '', higherBetter: false, icon: 'ti-alert-triangle' },
        { key: 'activeCves', label: 'Open CVEs', suffix: '', higherBetter: false, icon: 'ti-bug' },
        { key: 'onlineDevices', label: 'Online devices', suffix: '', higherBetter: true, icon: 'ti-devices' },
    ],
    security: [
        { key: 'riskScore', label: 'Security score', suffix: '/100', higherBetter: true, icon: 'ti-shield-check' },
        { key: 'criticalCves', label: 'Critical CVEs', suffix: '', higherBetter: false, icon: 'ti-alert-triangle' },
        { key: 'highCves', label: 'High CVEs', suffix: '', higherBetter: false, icon: 'ti-flame' },
        { key: 'deviceCount', label: 'Managed devices', suffix: '', higherBetter: true, icon: 'ti-devices' },
    ],
    compliance: [
        { key: 'complianceScore', label: 'Compliance score', suffix: '%', higherBetter: true, icon: 'ti-clipboard-check' },
        { key: 'remediationVelocity', label: 'Fix velocity', suffix: '%', higherBetter: true, icon: 'ti-run' },
        { key: 'atRiskDevices', label: 'At-risk devices', suffix: '', higherBetter: false, icon: 'ti-device-desktop-exclamation' },
        { key: 'avgFixTime', label: 'Avg fix time', suffix: 'd', higherBetter: false, decimals: 1, icon: 'ti-clock' },
    ],
    audit: [
        { key: 'riskScore', label: 'Security score', suffix: '/100', higherBetter: true, icon: 'ti-shield-check' },
        { key: 'complianceScore', label: 'Compliance score', suffix: '%', higherBetter: true, icon: 'ti-clipboard-check' },
        { key: 'criticalCves', label: 'Critical CVEs', suffix: '', higherBetter: false, icon: 'ti-alert-triangle' },
        { key: 'deviceCount', label: 'Evidence devices', suffix: '', higherBetter: true, icon: 'ti-devices' },
    ],
    posture: [
        { key: 'riskScore', label: 'Security score', suffix: '/100', higherBetter: true, icon: 'ti-shield-check' },
        { key: 'activeCves', label: 'Open CVEs', suffix: '', higherBetter: false, icon: 'ti-bug' },
        { key: 'complianceScore', label: 'Compliance score', suffix: '%', higherBetter: true, icon: 'ti-clipboard-check' },
        { key: 'remediationVelocity', label: 'Fix velocity', suffix: '%', higherBetter: true, icon: 'ti-run' },
    ],
};

function finiteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

const FIELD_ALIASES = {
    riskScore: ['riskScore', 'RiskScore', 'securityScore', 'SecurityScore'],
    deviceCount: ['deviceCount', 'DeviceCount', 'activeDevices', 'ActiveDevices', 'fleetDevices', 'FleetDevices'],
    onlineDevices: ['onlineDevices', 'OnlineDevices'],
    staleDevices: ['staleDevices', 'StaleDevices'],
    offlineDevices: ['offlineDevices', 'OfflineDevices'],
    atRiskDevices: ['atRiskDevices', 'AtRiskDevices'],
    complianceScore: ['complianceScore', 'ComplianceScore'],
    remediationVelocity: ['remediationVelocity', 'RemediationVelocity', 'patchRate', 'PatchRate'],
    avgFixTime: ['avgFixTime', 'AvgFixTime', 'medianVulnAgeDays', 'MedianVulnAgeDays'],
    activeCves: ['activeCves', 'ActiveCves', 'openCount', 'OpenCount', 'totalFindings', 'TotalFindings'],
    criticalCves: ['criticalCves', 'CriticalCves', 'criticalCount', 'CriticalCount'],
    highCves: ['highCves', 'HighCves', 'highCount', 'HighCount'],
};

function readField(source, key, fallback = 0) {
    const aliases = FIELD_ALIASES[key] || [key, key.charAt(0).toUpperCase() + key.slice(1)];
    for (const alias of aliases) {
        if (source?.[alias] !== undefined && source?.[alias] !== null) {
            return source[alias];
        }
    }
    return fallback;
}

function parseTrendDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (/^\d{8}$/.test(text)) {
        const d = new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
        return Number.isFinite(d.getTime()) ? d : null;
    }
    const d = new Date(text);
    return Number.isFinite(d.getTime()) ? d : null;
}

function formatInputDate(date) {
    return date.toISOString().slice(0, 10);
}

export function getTrendDateRange(days = 30) {
    const activeDate = rewindContext?.getDate?.() || null;
    const parsedActive = parseTrendDate(activeDate);
    const end = parsedActive || new Date();
    const start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - Math.max(1, days));
    return { from: formatInputDate(start), to: formatInputDate(end) };
}

export function normalizeTrendSnapshots(trends = []) {
    return (Array.isArray(trends) ? trends : [])
        .map((point) => ({ point, date: parseTrendDate(point?.date || point?.Date) }))
        .filter((item) => item.date)
        .sort((a, b) => a.date - b.date)
        .map((item) => item.point);
}

export function coerceTrendSnapshots(trends = []) {
    return normalizeTrendSnapshots(trends).map((point) => {
        const snapshot = point?.snapshot || point?.Snapshot;
        if (snapshot) return point;

        const date = point?.date || point?.Date || '';
        return {
            ...point,
            date,
            snapshot: {
                riskScore: finiteNumber(readField(point, 'riskScore')),
                deviceCount: finiteNumber(readField(point, 'deviceCount')),
                onlineDevices: finiteNumber(readField(point, 'onlineDevices')),
                staleDevices: finiteNumber(readField(point, 'staleDevices')),
                offlineDevices: finiteNumber(readField(point, 'offlineDevices')),
                atRiskDevices: finiteNumber(readField(point, 'atRiskDevices')),
                complianceScore: finiteNumber(readField(point, 'complianceScore')),
                remediationVelocity: finiteNumber(readField(point, 'remediationVelocity')),
                avgFixTime: finiteNumber(readField(point, 'avgFixTime')),
                activeCves: finiteNumber(readField(point, 'activeCves')),
                criticalCves: finiteNumber(readField(point, 'criticalCves')),
                highCves: finiteNumber(readField(point, 'highCves')),
            },
            ml: point?.ml || point?.Ml || point?.mlInsight || point?.MlInsight || null,
        };
    });
}

function metricValue(point, key) {
    const snapshot = point?.snapshot || point?.Snapshot || point || {};
    return finiteNumber(readField(snapshot, key));
}

function formatValue(value, metric) {
    const decimals = metric.decimals ?? 0;
    const rendered = finiteNumber(value).toLocaleString(undefined, {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
    });
    return `${rendered}${metric.suffix || ''}`;
}

function metricTone(delta, higherBetter) {
    if (Math.abs(delta) < 0.01) return 'secondary';
    const good = higherBetter ? delta > 0 : delta < 0;
    return good ? 'success' : 'danger';
}

function deltaLabel(delta, metric) {
    if (Math.abs(delta) < 0.01) return 'flat';
    const abs = Math.abs(delta);
    const decimals = metric.decimals ?? 0;
    return `${delta > 0 ? '+' : '-'}${abs.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${metric.suffix || ''}`;
}

function labelForDate(value) {
    const date = parseTrendDate(value);
    if (!date) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function buildSparkline(points, key) {
    const values = points.map((point) => metricValue(point, key));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const width = 420;
    const height = 120;
    const pad = 14;
    const xStep = (width - pad * 2) / Math.max(1, values.length - 1);
    const coords = values.map((value, index) => {
        const x = pad + index * xStep;
        const y = height - pad - ((value - min) / span) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { coords: coords.join(' '), width, height };
}

export function TrendSnapshotStrip({ trends = [], title = 'Dossier Trends', subtitle = '30-day evidence trend', context = 'dashboard', className = '' }) {
    const points = coerceTrendSnapshots(trends).slice(-30);
    if (points.length < 2) return null;

    const metrics = CONTEXT_METRICS[context] || CONTEXT_METRICS.dashboard;
    const first = points[0];
    const latest = points[points.length - 1];
    const primary = metrics[0];
    const primaryDelta = metricValue(latest, primary.key) - metricValue(first, primary.key);
    const primaryTone = metricTone(primaryDelta, primary.higherBetter);
    const spark = buildSparkline(points, primary.key);
    const fromLabel = labelForDate(first.date || first.Date);
    const toLabel = labelForDate(latest.date || latest.Date);

    return html`
        <div class="card border-0 shadow-sm mb-4 ${className}">
            <div class="card-header d-flex align-items-center justify-content-between gap-3 flex-wrap">
                <div>
                    <h3 class="card-title mb-1"><i class="ti ti-chart-line me-2"></i>${title}</h3>
                    <div class="text-muted small">${subtitle} · ${fromLabel} to ${toLabel}</div>
                </div>
                <span class="badge bg-${primaryTone}-lt text-${primaryTone}">${deltaLabel(primaryDelta, primary)}</span>
            </div>
            <div class="card-body">
                <div class="row g-3 align-items-stretch">
                    <div class="col-lg-7">
                        <svg viewBox="0 0 ${spark.width} ${spark.height}" role="img" aria-label=${title} style="width:100%;height:140px;display:block;">
                            <polyline points=${spark.coords} fill="none" stroke="var(--tblr-${primaryTone})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
                            <polyline points=${`${spark.coords} ${spark.width - 14},${spark.height - 8} 14,${spark.height - 8}`} fill="var(--tblr-${primaryTone}-lt)" opacity="0.28"></polyline>
                        </svg>
                    </div>
                    <div class="col-lg-5">
                        <div class="row g-2 h-100">
                            ${metrics.map((metric) => {
                                const firstValue = metricValue(first, metric.key);
                                const latestValue = metricValue(latest, metric.key);
                                const delta = latestValue - firstValue;
                                const tone = metricTone(delta, metric.higherBetter);
                                return html`
                                    <div class="col-6">
                                        <div class="border rounded p-2 h-100" style="min-height:82px;">
                                            <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
                                                <span class="text-muted small text-uppercase fw-semibold">${metric.label}</span>
                                                <i class="ti ${metric.icon} text-${tone}"></i>
                                            </div>
                                            <div class="h3 mb-1">${formatValue(latestValue, metric)}</div>
                                            <span class="badge bg-${tone}-lt text-${tone}">${deltaLabel(delta, metric)}</span>
                                        </div>
                                    </div>
                                `;
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export default TrendSnapshotStrip;