/**
 * PerfTab - Org-level performance telemetry viewer for Site Admin.
 * Uses the globally-selected org from the top dropdown (orgContext).
 * Renders 4 ApexCharts: CPU, Memory, Disk/DB Footprint, Network.
 */

import { api } from '@api';
import { orgContext } from '@orgContext';

const { html } = window;
const { useState, useEffect, useRef, useCallback } = window.preactHooks;

const BUCKET_OPTIONS = [
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '1d', label: '1 Day' }
];

const RANGE_OPTIONS = [
    { value: 1, label: '24h' },
    { value: 3, label: '3 Days' },
    { value: 7, label: '7 Days' },
    { value: 14, label: '14 Days' },
    { value: 30, label: '30 Days' }
];

const BUCKET_DESCRIPTIONS = {
    '1h': '1-hour',
    '6h': '6-hour',
    '1d': '1-day'
};

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
}

function getChartTheme(theme) {
    const isDark = theme === 'dark';
    return {
        isDark,
        text: isDark ? '#cbd5e1' : '#334155',
        muted: isDark ? '#94a3b8' : '#64748b',
        grid: isDark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(100, 116, 139, 0.2)',
        axis: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.24)',
        tooltipTheme: isDark ? 'dark' : 'light',
        annotationLabelBg: isDark ? '#0f172a' : '#ffffff',
        annotationLabelText: isDark ? '#e2e8f0' : '#0f172a'
    };
}

function calculatePercentiles(values) {
    const nums = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const pick = (p) => nums[Math.max(0, Math.min(nums.length - 1, Math.floor(p * (nums.length - 1))))];
    return { p50: pick(0.5), p90: pick(0.9), p95: pick(0.95) };
}

function buildAnnotations(percentiles, formatter, theme) {
    if (!percentiles) return [];
    const lines = [];
    const addLine = (value, label, color) => {
        if (!Number.isFinite(value)) return;
        lines.push({
            y: value, borderColor: color, strokeDashArray: 4,
            label: {
                borderColor: color,
                style: {
                    color: theme.annotationLabelText,
                    background: theme.annotationLabelBg
                },
                text: `${label} ${formatter(value)}`
            }
        });
    };
    addLine(percentiles.p50, 'P50', '#868e96');
    addLine(percentiles.p90, 'P90', '#fab005');
    addLine(percentiles.p95, 'P95', '#d63939');
    return lines;
}

function bytesToMegabytes(bytes) {
    const value = Number(bytes);
    return Number.isFinite(value) ? value / 1_000_000 : 0;
}

function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0%';
    if (Math.abs(number) < 1) return `${number.toFixed(2)}%`;
    if (Math.abs(number) < 10) return `${number.toFixed(1)}%`;
    return `${Math.round(number)}%`;
}

function formatMegabytes(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0 MB';
    if (number === 0) return '0 MB';
    if (Math.abs(number) < 1) return `${number.toFixed(2)} MB`;
    if (Math.abs(number) < 10) return `${number.toFixed(1)} MB`;
    return `${Math.round(number)} MB`;
}

function formatCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(number));
}

function buildPercentAxis(values, title, theme) {
    const nums = (values || []).map(Number).filter(Number.isFinite);
    const maxValue = nums.length ? Math.max(...nums) : 0;
    const axisMax = maxValue <= 1 ? 1
        : maxValue <= 5 ? 5
        : maxValue <= 10 ? 10
        : maxValue <= 25 ? 25
        : maxValue <= 50 ? 50
        : 100;

    const formatter = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return '0%';
        if (axisMax <= 1) return `${num.toFixed(2)}%`;
        if (axisMax <= 10) return `${num.toFixed(1)}%`;
        return `${Math.round(num)}%`;
    };

    return {
        min: 0,
        max: axisMax,
        tickAmount: axisMax <= 10 ? 5 : undefined,
        forceNiceScale: true,
        labels: { formatter, style: { colors: theme.text } },
        title: { text: title, style: { color: theme.text } }
    };
}

export function PerfTab() {
    const [bucket, setBucket] = useState('6h');
    const [rangeDays, setRangeDays] = useState(7);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [perfData, setPerfData] = useState(null);
    const [orgId, setOrgId] = useState(orgContext.getCurrentOrg()?.orgId || '');
    const [theme, setTheme] = useState(getCurrentTheme());
    const chartsRef = useRef({});
    const cpuEl = useRef(null);
    const memEl = useRef(null);
    const diskEl = useRef(null);
    const netEl = useRef(null);

    // Listen for org changes
    useEffect(() => {
        const handler = () => {
            const newOrgId = orgContext.getCurrentOrg()?.orgId || '';
            setOrgId(newOrgId);
        };
        window.addEventListener('orgChanged', handler);
        return () => window.removeEventListener('orgChanged', handler);
    }, []);

    useEffect(() => {
        const handler = (event) => {
            setTheme(event?.detail?.theme === 'dark' ? 'dark' : getCurrentTheme());
        };
        window.addEventListener('theme-changed', handler);
        return () => window.removeEventListener('theme-changed', handler);
    }, []);

    // Load on mount and when org/bucket/range changes
    useEffect(() => {
        if (orgId) loadPerf();
    }, [orgId, bucket, rangeDays]);

    // Render charts when data changes
    useEffect(() => {
        if (perfData) renderCharts();
        return () => destroyCharts();
    }, [perfData, theme]);

    const loadPerf = useCallback(async () => {
        if (!orgId) { setError('Select an organization from the top dropdown'); return; }
        setLoading(true);
        setError(null);
        try {
            const endUtc = new Date();
            const startUtc = new Date(endUtc.getTime() - rangeDays * 86400000);
            const resp = await api.get(`/api/v1/orgs/${orgId}/perf`, {
                bucket,
                startUtc: startUtc.toISOString(),
                endUtc: endUtc.toISOString()
            });
            if (resp.success && resp.data) {
                setPerfData(normalizePerf(resp.data));
            } else {
                setError(resp.message || resp.error || 'Failed to load performance data');
                setPerfData(null);
            }
        } catch (err) {
            setError(err.message || 'Failed to load performance data');
            setPerfData(null);
        } finally {
            setLoading(false);
        }
    }, [orgId, bucket, rangeDays]);

    function normalizePerf(raw) {
        const toNum = (v, fb = null) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
        const rawPts = Array.isArray(raw?.points) ? raw.points : Array.isArray(raw?.Points) ? raw.Points : [];
        const points = rawPts.map(p => {
            const ts = new Date(p.bucketStartUtc ?? p.BucketStartUtc ?? p.timestamp).getTime();
            if (!Number.isFinite(ts)) return null;
            const netSentBytes = toNum(p.networkBytesSent ?? p.NetworkBytesSent, 0);
            const netRecvBytes = toNum(p.networkBytesReceived ?? p.NetworkBytesReceived, 0);
            const deviceCount = toNum(p.deviceCount ?? p.DeviceCount, 0);
            const netTotalMb = bytesToMegabytes(netSentBytes + netRecvBytes);
            return {
                ts,
                cpu: Math.max(0, Math.min(100, toNum(p.cpuAvg ?? p.CpuAvg, 0))),
                memPct: Math.max(0, Math.min(100, toNum(p.memoryAvg ?? p.MemoryAvg, 0))),
                memMb: toNum(p.memoryAvgMb ?? p.MemoryAvgMb, 0),
                diskTotal: toNum(p.diskTotalMbAvg ?? p.DiskTotalMbAvg ?? p.diskAvg, 0),
                diskApp: toNum(p.diskAppMbAvg ?? p.DiskAppMbAvg, 0),
                diskIntel: toNum(p.diskIntelMbAvg ?? p.DiskIntelMbAvg, 0),
                netMbps: toNum(p.networkMbpsAvg ?? p.NetworkMbpsAvg ?? p.networkAvg, 0),
                netSentBytes,
                netRecvBytes,
                netUploadMb: bytesToMegabytes(netSentBytes),
                netDownloadMb: bytesToMegabytes(netRecvBytes),
                netTotalMb,
                deviceCount,
                netMbPerDevice: deviceCount > 0 ? netTotalMb / deviceCount : netTotalMb,
                netRequests: toNum(p.networkRequests ?? p.NetworkRequests, 0),
                netFailures: toNum(p.networkFailures ?? p.NetworkFailures, 0),
                samples: toNum(p.samples ?? p.Samples, 0)
            };
        }).filter(Boolean).sort((a, b) => a.ts - b.ts);

        return {
            sampleCount: toNum(raw?.sampleCount ?? raw?.SampleCount, 0),
            bucketMinutes: toNum(raw?.bucketMinutes ?? raw?.BucketMinutes, 360),
            fromCache: Boolean(raw?.fromCache ?? raw?.FromCache),
            points
        };
    }

    function destroyCharts() {
        Object.values(chartsRef.current || {}).forEach((chart) => {
            if (chart?.destroy) {
                chart.destroy();
            }
        });
        chartsRef.current = {};
    }

    function renderCharts() {
        if (!window.ApexCharts || !perfData?.points?.length) return;
        destroyCharts();

        const pts = perfData.points;
        const chartTheme = getChartTheme(theme);

        const chartHeight = 250;
        const baseOpts = {
            chart: {
                height: chartHeight,
                toolbar: { show: false },
                animations: { enabled: true },
                foreColor: chartTheme.text
            },
            theme: { mode: chartTheme.tooltipTheme },
            stroke: { curve: 'straight', width: 2 },
            fill: { type: 'gradient', gradient: { shadeIntensity: 0.6, opacityFrom: 0.35, opacityTo: 0.05 } },
            dataLabels: { enabled: false },
            legend: { show: true, labels: { colors: chartTheme.text } },
            grid: { borderColor: chartTheme.grid },
            xaxis: {
                type: 'datetime',
                labels: { datetimeUTC: false, style: { colors: chartTheme.text } },
                axisBorder: { color: chartTheme.axis },
                axisTicks: { color: chartTheme.axis },
                min: pts[0]?.ts, max: pts[pts.length - 1]?.ts
            },
            tooltip: { shared: false, theme: chartTheme.tooltipTheme, x: { format: 'MMM dd, HH:mm' } }
        };

        const configs = [
            {
                key: 'cpu', el: cpuEl.current,
                series: [{ name: 'CPU %', data: pts.map(p => [p.ts, p.cpu]) }],
                colors: ['#206bc4'],
                yaxis: [buildPercentAxis(pts.map(p => p.cpu), 'Client CPU (%)', chartTheme)],
                tooltipY: { formatter: v => formatPercent(v) },
                annotations: buildAnnotations(calculatePercentiles(pts.map(p => p.cpu)), v => formatPercent(v), chartTheme)
            },
            {
                key: 'mem', el: memEl.current,
                series: [
                    { name: 'Memory %', data: pts.map(p => [p.ts, p.memPct]) },
                    { name: 'Memory MB', data: pts.map(p => [p.ts, p.memMb]) }
                ],
                colors: ['#0ca678', '#15aabf'],
                yaxis: [
                    buildPercentAxis(pts.map(p => p.memPct), 'Memory (%)', chartTheme),
                    { opposite: true, labels: { formatter: v => `${Math.round(v)} MB`, style: { colors: chartTheme.text } }, title: { text: 'Working Set (MB)', style: { color: chartTheme.text } } }
                ],
                tooltipY: { formatter: (v, o) => o.seriesIndex === 0 ? formatPercent(v) : `${Math.round(v)} MB` },
                annotations: buildAnnotations(calculatePercentiles(pts.map(p => p.memPct)), v => formatPercent(v), chartTheme)
            },
            {
                key: 'disk', el: diskEl.current,
                series: [
                    { name: 'Total MB', data: pts.map(p => [p.ts, p.diskTotal]) },
                    { name: 'App DB MB', data: pts.map(p => [p.ts, p.diskApp]) },
                    { name: 'Intel DB MB', data: pts.map(p => [p.ts, p.diskIntel]) }
                ],
                colors: ['#fab005', '#ffa94d', '#ffd43b'],
                yaxis: [{ min: 0, labels: { formatter: v => `${Math.round(v)} MB`, style: { colors: chartTheme.text } }, title: { text: 'DB Size (MB)', style: { color: chartTheme.text } } }],
                tooltipY: { formatter: v => `${Math.round(v)} MB` },
                annotations: buildAnnotations(calculatePercentiles(pts.map(p => p.diskTotal)), v => `${Math.round(v)} MB`, chartTheme),
                stacked: true
            },
            {
                key: 'net', el: netEl.current,
                series: [
                    { name: 'Avg MB / device', type: 'area', data: pts.map(p => [p.ts, p.netMbPerDevice]) },
                    { name: 'Requests', type: 'column', data: pts.map(p => [p.ts, p.netRequests]) },
                    { name: 'Failures', type: 'column', data: pts.map(p => [p.ts, p.netFailures]) }
                ],
                colors: ['#15aabf', '#2fb344', '#d63939'],
                yaxis: [
                    { min: 0, labels: { formatter: v => formatMegabytes(v), style: { colors: chartTheme.text } }, title: { text: `Avg data transfer per device (MB per ${bucketDescription} bucket)`, style: { color: chartTheme.text } } },
                    { opposite: true, labels: { formatter: v => formatCount(v), style: { colors: chartTheme.text } }, title: { text: 'Requests / Failures', style: { color: chartTheme.text } } }
                ],
                tooltipY: {
                    formatter: (v, o) => {
                        if (o.seriesIndex === 0) {
                            const point = pts[o.dataPointIndex] || {};
                            const deviceCountText = point.deviceCount > 0 ? `${formatCount(point.deviceCount)} devices` : 'device count unavailable';
                            return `${formatMegabytes(v)} per device • ${formatMegabytes(point.netTotalMb)} fleet total • ${formatMegabytes(point.netUploadMb)} up • ${formatMegabytes(point.netDownloadMb)} down • ${deviceCountText}`;
                        }
                        return formatCount(v);
                    }
                },
                annotations: buildAnnotations(calculatePercentiles(pts.map(p => p.netMbPerDevice)), v => formatMegabytes(v), chartTheme)
            }
        ];

        configs.forEach(cfg => {
            if (!cfg.el) return;
            const seriesData = cfg.series.map(s => ({
                name: s.name, type: s.type || 'area',
                data: s.data.filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
            })).filter(s => s.data.length > 0);
            if (seriesData.length === 0) return;

            const opts = {
                ...baseOpts,
                chart: { ...baseOpts.chart, stacked: cfg.stacked || false },
                colors: cfg.colors,
                yaxis: cfg.yaxis,
                tooltip: { ...baseOpts.tooltip, y: cfg.tooltipY },
                annotations: { yaxis: cfg.annotations },
                series: seriesData
            };

            const chart = new window.ApexCharts(cfg.el, opts);
            chart.render();
            chartsRef.current[cfg.key] = chart;
        });
    }

    const orgName = orgContext.getCurrentOrg()?.name || orgId || 'None';
    const sampleCount = perfData?.sampleCount ?? perfData?.points?.length ?? 0;
    const bucketDescription = BUCKET_DESCRIPTIONS[bucket] || 'selected';

    return html`
        <div>
            <!-- Controls row -->
            <div class="card mb-3">
                <div class="card-body py-2">
                    <div class="row g-2 align-items-center">
                        <div class="col-auto">
                            <span class="text-muted small">Org:</span>
                            <span class="fw-bold ms-1">${orgName}</span>
                        </div>
                        <div class="col-auto">
                            <select class="form-select form-select-sm" style="width:auto"
                                value=${bucket} onChange=${e => setBucket(e.target.value)}>
                                ${BUCKET_OPTIONS.map(o => html`<option value=${o.value}>${o.label}</option>`)}
                            </select>
                        </div>
                        <div class="col-auto">
                            <select class="form-select form-select-sm" style="width:auto"
                                value=${rangeDays} onChange=${e => setRangeDays(Number(e.target.value))}>
                                ${RANGE_OPTIONS.map(o => html`<option value=${o.value}>${o.label}</option>`)}
                            </select>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-sm btn-outline-primary" onClick=${() => loadPerf()} disabled=${loading}>
                                <i class="ti ti-refresh me-1"></i>${loading ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>
                        ${perfData && html`
                            <div class="col-auto ms-auto">
                                <span class="badge bg-blue-lt text-blue">${sampleCount} samples</span>
                                ${perfData.fromCache && html`<span class="badge bg-yellow-lt text-yellow ms-1">cached</span>`}
                            </div>
                        `}
                    </div>
                </div>
            </div>

            ${!orgId && html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-building-community" style="font-size:3rem;opacity:.4;"></i></div>
                    <p class="empty-title">No organization selected</p>
                    <p class="empty-subtitle text-muted">Select an organization from the top dropdown to view performance data.</p>
                </div>
            `}

            ${error && html`
                <div class="alert alert-warning">${error}</div>
            `}

            ${loading && html`
                <div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>
            `}

            ${!loading && !error && orgId && perfData?.points?.length === 0 && html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-chart-line" style="font-size:3rem;opacity:.4;"></i></div>
                    <p class="empty-title">No performance data</p>
                    <p class="empty-subtitle text-muted">No performance telemetry found for this org in the selected time range.</p>
                </div>
            `}

            ${!loading && perfData?.points?.length > 0 && html`
                <div class="row row-cards">
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header"><h3 class="card-title"><i class="ti ti-cpu me-2"></i>Client CPU</h3></div>
                            <div class="card-body p-2">
                                <div ref=${cpuEl}></div>
                                <div class="text-muted small px-2 pb-1">Average CPU consumed by the client in each selected bucket. Low values are expected for lightweight background monitoring.</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header"><h3 class="card-title"><i class="ti ti-cloud-data-connection me-2"></i>Network Usage</h3></div>
                            <div class="card-body p-2">
                                <div ref=${netEl}></div>
                                <div class="text-muted small px-2 pb-1">Shows average client data transfer per contributing device in each ${bucketDescription} bucket. Hover for fleet total, upload and download breakdown, and active-device count.</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header"><h3 class="card-title"><i class="ti ti-server me-2"></i>Memory</h3></div>
                            <div class="card-body p-2" ref=${memEl}></div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header"><h3 class="card-title"><i class="ti ti-database me-2"></i>Disk / DB Footprint</h3></div>
                            <div class="card-body p-2" ref=${diskEl}></div>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
