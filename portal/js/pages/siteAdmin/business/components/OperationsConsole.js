/**
 * OperationsConsole — Fleet health, telemetry volume, diagnostics, region breakdown.
 * Replaces Diagnostics.js. Receives snapshot + history as props from BusinessPage.
 *
 * Props:
 *   snapshot      — PlatformDailySnapshot
 *   history       — BusinessHistoryPoint[]
 *   convert       — currency conversion helper
 *   ccySymbol     — display currency symbol
 */
import { api } from '@api';
import { orgContext } from '@orgContext';
import { KpiCard } from './KpiCard.js';
import {
    formatCompact, formatPercent, formatCurrency,
    TELEMETRY_LABELS, TELEMETRY_COLORS, getRegionLabel,
} from '../businessConstants.js';
import {
    destroyChart, stackedBarConfig, themeColors, CHART_PALETTE,
} from '../businessChartTheme.js';

const { html } = window;
const { useState, useRef, useEffect } = window.preactHooks;

const CRON_ATTRIBUTION_WINDOW_DAYS = 7;

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function formatCronDuration(durationMs) {
    const ms = toNumber(durationMs);
    if (ms <= 0) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function getBudgetField(budget, camelName, pascalName) {
    return toNumber(budget?.[camelName] ?? budget?.[pascalName]);
}

function getCronOperationBudget(event) {
    const meta = event?.metadata || {};
    const budget = meta.operationBudget || meta.OperationBudget || {};
    return {
        rowsRead: getBudgetField(budget, 'rowsRead', 'RowsRead') + toNumber(meta.totalRowsRead),
        rowsWritten: getBudgetField(budget, 'rowsWritten', 'RowsWritten') + toNumber(meta.totalRowsWritten),
        rowsDeleted: getBudgetField(budget, 'rowsDeleted', 'RowsDeleted') + toNumber(meta.totalRowsDeleted),
    };
}

function getCronDurationMs(event) {
    const meta = event?.metadata || {};
    if (meta.durationSeconds !== undefined) return Math.round(toNumber(meta.durationSeconds) * 1000);
    if (meta.DurationMs !== undefined) return toNumber(meta.DurationMs);
    if (meta.durationMs !== undefined) return toNumber(meta.durationMs);
    if (meta.operationBudget?.durationMs !== undefined) return toNumber(meta.operationBudget.durationMs);
    if (meta.OperationBudget?.DurationMs !== undefined) return toNumber(meta.OperationBudget.DurationMs);
    return 0;
}

function getCronTaskId(event) {
    const meta = event?.metadata || {};
    const explicitTaskId = meta.taskId || meta.TaskId || meta.taskName || meta.TaskName;
    if (explicitTaskId) return String(explicitTaskId);

    const targetType = String(event?.targetType || '').trim();
    if (targetType && !['All', 'CronLane', 'System', 'Scheduled', 'Manual'].includes(targetType)) return targetType;
    return null;
}

function formatLaneLabel(laneId) {
    const labels = {
        'hot-detect': 'Hot Detect',
        'intel': 'Intel',
        'sealed-org-data': 'Sealed Org Data',
        'business-ops': 'Business Ops',
        'low-priority': 'Low Priority',
        'manual': 'Manual',
        'unassigned': 'Unassigned',
    };
    const normalized = String(laneId || 'unassigned').trim().toLowerCase();
    return labels[normalized] || normalized.split('-').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function summarizeCronAttribution(events, taskLaneLookup = new Map()) {
    const byTask = new Map();
    const byLane = new Map();
    const totals = { durationMs: 0, rows: 0, items: 0, timedRuns: 0 };

    for (const event of events || []) {
        if (String(event?.eventType || '').toUpperCase() !== 'CRONRUN') continue;
        const meta = event?.metadata || {};
        const taskId = getCronTaskId(event);
        if (!taskId) continue;

        const laneId = String(meta.laneId || meta.LaneId || (taskId ? taskLaneLookup.get(taskId) : null) || 'unassigned').trim().toLowerCase() || 'unassigned';
        const durationMs = getCronDurationMs(event);
        const budget = getCronOperationBudget(event);
        const rowOps = budget.rowsRead + budget.rowsWritten + budget.rowsDeleted;
        const items = toNumber(meta.itemsProcessed ?? meta.entriesRefreshed);

        if (durationMs > 0) totals.timedRuns += 1;
        totals.durationMs += durationMs;
        totals.rows += rowOps;
        totals.items += items;

        if (taskId) {
            const task = byTask.get(taskId) || { taskId, durationMs: 0, rows: 0, items: 0, runs: 0 };
            task.durationMs += durationMs;
            task.rows += rowOps;
            task.items += items;
            task.runs += durationMs > 0 ? 1 : 0;
            byTask.set(taskId, task);
        }

        const lane = byLane.get(laneId) || { laneId, durationMs: 0, rows: 0, items: 0, runs: 0 };
        lane.durationMs += durationMs;
        lane.rows += rowOps;
        lane.items += items;
        lane.runs += durationMs > 0 ? 1 : 0;
        byLane.set(laneId, lane);
    }

    const topTasks = Array.from(byTask.values()).sort((a, b) => b.durationMs - a.durationMs).slice(0, 4);
    const lanes = Array.from(byLane.values()).filter(item => item.durationMs > 0 || item.rows > 0 || item.items > 0).sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
    return { ...totals, topTasks, lanes, taskCount: byTask.size, laneCount: byLane.size };
}

export function OperationsConsole({ snapshot, history, convert, ccySymbol }) {
    if (!snapshot) return null;

    const s = snapshot;
    const [telemetryDays, setTelemetryDays] = useState(30);
    const [orgWindow, setOrgWindow] = useState(30);
    const [expandedDiag, setExpandedDiag] = useState(null); // which diagnostic accordion is open
    const [diagData, setDiagData] = useState({}); // lazy-loaded diagnostic details
    const [cronAttribution, setCronAttribution] = useState({ loading: true, events: [], tasks: [], error: null });

    // Chart ref
    const telemetryBarRef = useRef(null);

    // ── Fleet KPIs ──────────────────────────────────────────────────
    const dailyTelemetrySnapshots = (s.costDetail?.dailySnapshots || [])
        .filter(snap => snap?.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const totalDevices = Number(s.totalDevices || 0);
    const totalOrgs = Number(s.totalOrgs || 0);
    const latestSeenFromSnapshots = dailyTelemetrySnapshots.length > 0
        ? Number((dailyTelemetrySnapshots[dailyTelemetrySnapshots.length - 1].topTelemetryOrgs || [])
            .reduce((sum, org) => sum + Number(org.activeDevices || 0), 0))
        : 0;
    const avgSeenFromSnapshots = dailyTelemetrySnapshots.length > 0
        ? (() => {
            const perDay = dailyTelemetrySnapshots.slice(-7)
                .map(snap => (snap.topTelemetryOrgs || []).reduce((sum, org) => sum + Number(org.activeDevices || 0), 0))
                .filter(v => v > 0);
            return perDay.length > 0 ? (perDay.reduce((sum, v) => sum + v, 0) / perDay.length) : 0;
        })()
        : 0;
    const activeDevices = Number(s.totalSeenDevices || latestSeenFromSnapshots || s.activeDevices || 0);
    const coverageCount = Number(s.foundOrgCount || s.orgsWithBusinessSignal || 0);
    const fleetUtil = totalDevices > 0 && activeDevices > 0 ? ((activeDevices / totalDevices) * 100) : 0;
    const orgDataCoverage = Number(s.coveragePercent || (totalOrgs > 0 ? ((coverageCount / totalOrgs) * 100) : 0));
    const avgOnline = Number(s.avgDailyOnlinePercent || (totalDevices > 0 && avgSeenFromSnapshots > 0 ? ((avgSeenFromSnapshots / totalDevices) * 100) : 0));

    // ── Telemetry by type (from costDetail or snapshot) ─────────────
    const telemetryByType = s.telemetryRowsByType || s.telemetryDetail?.byType || {};

    // ── Noisy devices ───────────────────────────────────────────────
    const noisyDevices = ((s.topNoisyDevices && s.topNoisyDevices.length > 0) ? s.topNoisyDevices : (s.noisyDevices || [])).slice(0, 10);

    // ── Top telemetry orgs ──────────────────────────────────────────
    const telemetryAggs = (s.costDetail?.topOrgTelemetryAggregates || []).slice(0, 10);
    const topCostOrgMap = new Map((s.topCostOrgs || []).map(org => [org.orgId, org]));
    const rowsPerDeviceField = orgWindow === 7 ? 'avg7dRowsPerDevice' : orgWindow === 90 ? 'avg90dRowsPerDevice' : 'avg30dRowsPerDevice';

    // ── Region breakdown ────────────────────────────────────────────
    const regionBreakdown = s.regionBreakdown || [];

    function formatDiagTime(value) {
        if (!value) return '—';
        const dt = new Date(value);
        return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
    }

    function freshnessBadge(state) {
        const normalized = String(state || 'missing').toLowerCase();
        if (normalized === 'fresh') return html`<span class="badge bg-success text-white">Fresh</span>`;
        if (normalized === 'stale') return html`<span class="badge bg-warning text-white">Stale</span>`;
        return html`<span class="badge bg-secondary text-white">Missing</span>`;
    }

    function formatOrgImpact(org) {
        if (org?.estimatedRevenueImpact) return org.estimatedRevenueImpact;
        const raw = String(org?.issueCategory || '').trim();
        if (!raw) return 'Monitoring only';
        const map = {
            seatOverages: 'Seat overage detected',
            highErrorRate: 'Many devices stale or failing delivery',
            licenseExpired: 'License expired',
            licenseDisabled: 'License disabled',
        };
        return raw.split(',').filter(Boolean).map(part => map[part] || part).join(' · ');
    }

    function normalizeTelemetryType(type) {
        const key = String(type || '').toLowerCase();
        if (key.includes('heartbeat')) return 'Heartbeat';
        if (key.includes('signal') || key.includes('machine')) return 'Signals';
        if (key.includes('perf')) return 'Performance';
        if (key.includes('inventory') || key.includes('app')) return 'Inventory';
        if (key.includes('alert') || key.includes('cve')) return 'Alerts';
        return type || 'Other';
    }

    function normalizeTelemetryBreakdown(byType = {}) {
        return Object.entries(byType || {}).reduce((acc, [type, value]) => {
            const normalized = normalizeTelemetryType(type);
            acc[normalized] = (acc[normalized] || 0) + Number(value || 0);
            return acc;
        }, {});
    }

    const normalizedTelemetryByType = normalizeTelemetryBreakdown(telemetryByType);
    const processingInputRows = Number(normalizedTelemetryByType.Heartbeat || 0)
        + Number(normalizedTelemetryByType.Signals || 0)
        + Number(normalizedTelemetryByType.Performance || 0);
    const materializedEvidenceRows = Number(normalizedTelemetryByType.Inventory || 0)
        + Number(normalizedTelemetryByType.Alerts || 0);
    const cachePerformance = s.cachePerformance || s.costDetail?.cachePerformance || {};
    const apiRequestRows = Number(cachePerformance.totalRequests || 0);
    const apiHitRate = Number(cachePerformance.hitRate || 0);
    const cronTaskLaneLookup = new Map((cronAttribution.tasks || []).map(task => [String(task.taskId || task.displayName || ''), task.laneId]));
    const cronSummary = summarizeCronAttribution(cronAttribution.events, cronTaskLaneLookup);
    const maxCronLaneRuntime = Math.max(1, ...cronSummary.lanes.map(item => item.durationMs));
    const maxCronTaskRuntime = Math.max(1, ...cronSummary.topTasks.map(item => item.durationMs));

    // ── Telemetry stacked bar from live daily snapshots/history ─────────────
    useEffect(() => {
        renderTelemetryBar();
    }, [telemetryDays, history, snapshot]);

    useEffect(() => {
        let cancelled = false;

        async function loadCronAttribution() {
            try {
                const query = new URLSearchParams({
                    cronActivity: 'true',
                    pageSize: '100',
                    days: String(CRON_ATTRIBUTION_WINDOW_DAYS)
                });
                const [response, statusResponse] = await Promise.all([
                    api.get(`/api/v1/admin/audit?${query.toString()}`),
                    api.adminGetCronStatus().catch(() => null)
                ]);
                if (cancelled) return;
                if (response.success && response.data) {
                    setCronAttribution({
                        loading: false,
                        events: response.data.events || [],
                        tasks: statusResponse?.success && statusResponse.data ? (statusResponse.data.tasks || []) : [],
                        error: null
                    });
                } else {
                    setCronAttribution({ loading: false, events: [], tasks: [], error: response.message || 'Cron attribution unavailable' });
                }
            } catch (err) {
                if (!cancelled) {
                    setCronAttribution({ loading: false, events: [], tasks: [], error: err?.message || 'Cron attribution unavailable' });
                }
            }
        }

        loadCronAttribution();
        return () => { cancelled = true; };
    }, []);

    function renderTelemetryBar() {
        if (!telemetryBarRef.current || !window.Chart) return;
        destroyChart(telemetryBarRef);

        const source = dailyTelemetrySnapshots.length > 0
            ? dailyTelemetrySnapshots.slice(-telemetryDays).map(snap => ({
                date: snap.date,
                telemetryByType: normalizeTelemetryBreakdown(snap.telemetryRowsByType || {})
            }))
            : (history || []).slice(-telemetryDays).map(h => ({
                date: h.date,
                telemetryByType: normalizeTelemetryBreakdown(h.telemetryByType || {})
            }));

        if (source.length < 2) return;

        const labels = source.map(h => {
            const d = new Date(h.date);
            return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        });

        const preferredOrder = ['Heartbeat', 'Signals', 'Performance', 'Inventory', 'Alerts'];
        const types = preferredOrder.filter(type => source.some(entry => Number(entry.telemetryByType?.[type] || 0) > 0));
        if (types.length === 0) return;

        const datasets = types.map((type, i) => ({
            label: TELEMETRY_LABELS[type] || type,
            data: source.map(h => Number(h.telemetryByType?.[type] || 0)),
            backgroundColor: TELEMETRY_COLORS[type] || CHART_PALETTE[i % CHART_PALETTE.length],
        }));

        new window.Chart(telemetryBarRef.current.getContext('2d'), stackedBarConfig(labels, datasets, {
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, font: { size: 10 } } },
            },
        }));
    }

    // ── Diagnostics accordion ───────────────────────────────────────
    const diagCategories = [
        { key: 'problem-devices', icon: 'ti-device-desktop-exclamation', label: 'Problem Devices', badge: 'bg-danger' },
        { key: 'problem-orgs', icon: 'ti-building-community', label: 'Problem Orgs', badge: 'bg-warning' },
        { key: 'revenue-leaks', icon: 'ti-currency-dollar-off', label: 'Revenue Leaks', badge: 'bg-orange' },
        { key: 'system-health', icon: 'ti-heart-rate-monitor', label: 'System Health', badge: 'bg-info' },
    ];

    async function toggleDiag(key) {
        if (expandedDiag === key) { setExpandedDiag(null); return; }
        setExpandedDiag(key);
        if (!diagData[key]) {
            try {
                const resp = await api.get(`/api/v1/admin/diagnostics?category=${key}`);
                if (resp.success) {
                    setDiagData(prev => ({ ...prev, [key]: resp.data }));
                }
            } catch (err) {
                // silently fail — accordion stays open but empty
            }
        }
    }

    function renderDiagContent(key) {
        const data = diagData[key];
        if (!data) return html`<div class="p-3 text-muted small">Loading...</div>`;

        if (key === 'problem-devices') {
            const devices = data.problemDevices || data.devices || [];
            if (devices.length === 0) return html`<div class="p-3 text-muted small">No problem devices found.</div>`;
            return html`
                <div class="p-3 border-bottom bg-light-subtle small text-muted">
                    Devices are flagged when heartbeat is stale, recent telemetry is stale/missing, or repeated delivery failures are observed. This is not driven by deprecated App/CVE telemetry counters.
                </div>
                <div class="table-responsive">
                    <table class="table table-sm table-vcenter card-table">
                        <thead><tr><th>Device</th><th>Organization</th><th>Observed condition</th><th>Heartbeat</th><th>Telemetry</th></tr></thead>
                        <tbody>
                            ${devices.slice(0, 15).map(d => html`
                                <tr>
                                    <td>
                                        <div class="fw-medium">${d.deviceName || d.deviceId || '-'}</div>
                                        ${(d.deviceName && d.deviceId && d.deviceName !== d.deviceId) ? html`<div class="text-muted small font-monospace">${d.deviceId}</div>` : null}
                                        ${d.deviceState ? html`<div class="text-muted small">State: ${d.deviceState}</div>` : null}
                                    </td>
                                    <td>
                                        <div class="fw-medium">${d.orgName || d.orgId || '-'}</div>
                                        ${(d.orgName && d.orgId && d.orgName !== d.orgId) ? html`<div class="text-muted small font-monospace">${d.orgId}</div>` : null}
                                    </td>
                                    <td>
                                        <span class="badge ${String(d.issueType || '').toLowerCase().includes('moderate') ? 'bg-warning' : 'bg-danger'} text-white">${d.issueType || d.issue || 'Unknown'}</span>
                                        ${d.telemetryErrors ? html`<div class="text-muted small mt-1">${d.telemetryErrors}</div>` : null}
                                    </td>
                                    <td>
                                        ${freshnessBadge(d.heartbeatState)}
                                        <div class="text-muted small mt-1">${formatDiagTime(d.lastHeartbeat)}</div>
                                    </td>
                                    <td>
                                        ${freshnessBadge(d.telemetryState)}
                                        <div class="text-muted small mt-1">${formatDiagTime(d.lastTelemetry)}</div>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (key === 'problem-orgs') {
            const orgs = data.problemOrgs || data.orgs || [];
            if (orgs.length === 0) return html`<div class="p-3 text-muted small">No problem orgs found.</div>`;
            return html`
                <div class="p-3 border-bottom bg-light-subtle small text-muted">
                    Organization attention rate = share of devices currently stale or repeatedly failing delivery checks in the new telemetry model.
                </div>
                <div class="table-responsive">
                    <table class="table table-sm table-vcenter card-table">
                        <thead><tr><th>Organization</th><th>Attention Rate</th><th>Devices</th><th>License</th><th>Impact</th></tr></thead>
                        <tbody>
                            ${orgs.slice(0, 15).map(o => html`
                                <tr>
                                    <td>
                                        <div class="fw-medium">${o.orgName || o.orgId}</div>
                                        ${(o.orgName && o.orgId && o.orgName !== o.orgId) ? html`<div class="text-muted small font-monospace">${o.orgId}</div>` : null}
                                    </td>
                                    <td>
                                        <span class="badge ${(o.attentionRate || o.errorRate || 0) > 70 ? 'bg-danger' : 'bg-warning'} text-white">${(o.attentionRate || o.errorRate || 0).toFixed(0)}%</span>
                                        <div class="text-muted small mt-1">${o.devicesInError || 0} / ${o.deviceCount || 0} devices</div>
                                    </td>
                                    <td>${o.deviceCount || 0}</td>
                                    <td><span class="badge ${o.licenseStatus === 'ACTIVE' ? 'bg-success' : o.licenseStatus === 'EXPIRED' ? 'bg-danger' : 'bg-secondary'} text-white">${o.licenseStatus || '-'}</span></td>
                                    <td class="text-muted small">${formatOrgImpact(o)}</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (key === 'revenue-leaks') {
            const leaks = data.revenueLeaks || data.leaks || [];
            const totalMonthlyLeakage = Number(data.totalMonthlyLeakage || 0);
            if (leaks.length === 0) return html`<div class="p-3 text-muted small">No revenue leakage is currently being measured.</div>`;
            return html`
                <div class="p-3 border-bottom bg-light-subtle small">
                    <span class="text-muted">Estimated monthly leakage / opportunity:</span>
                    <span class="fw-semibold text-danger ms-2">${ccySymbol}${convert(totalMonthlyLeakage).toFixed(2)}</span>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm table-vcenter card-table">
                        <thead><tr><th>Organization</th><th>Issue</th><th>Affected</th><th>Monthly Loss</th><th>Action</th></tr></thead>
                        <tbody>
                            ${leaks.slice(0, 15).map(l => html`
                                <tr>
                                    <td>
                                        <div class="fw-medium">${l.orgName || l.orgId}</div>
                                        ${(l.orgName && l.orgId && l.orgName !== l.orgId) ? html`<div class="text-muted small font-monospace">${l.orgId}</div>` : null}
                                    </td>
                                    <td><span class="badge ${l.isProspect ? 'bg-info' : 'bg-orange'} text-white">${l.issueType || l.type || '-'}</span></td>
                                    <td>${l.overage || l.deviceCount || 0}</td>
                                    <td class="text-danger fw-semibold">${ccySymbol}${convert(l.monthlyLoss || 0).toFixed(2)}</td>
                                    <td class="text-muted small">${l.recommendedAction || l.details || '-'}</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (key === 'system-health') {
            const deviceHealth = Number(data.deviceHealthScore || data.deviceHealth || 0);
            const telemetrySuccess = Number(data.telemetrySuccessRate || 0);
            const licenseUtilization = Number(data.licenseUtilization || 0);
            const totalDevices = Number(data.totalDevices || 0);
            const healthyDevices = Number(data.healthyDevices || 0);
            const alerts = data.alerts || [];
            return html`
                <div class="p-3">
                    <div class="alert alert-info py-2 px-3 small mb-3">
                        ${data.healthBasis || 'System health is based on heartbeat recency and current telemetry delivery checks, not deprecated legacy telemetry types.'}
                    </div>
                    <div class="row g-3">
                        ${[
                            { label: 'Device Health Score', value: deviceHealth, color: deviceHealth >= 80 ? 'success' : deviceHealth >= 60 ? 'warning' : 'danger' },
                            { label: 'Telemetry Success', value: telemetrySuccess, color: telemetrySuccess >= 90 ? 'success' : telemetrySuccess >= 75 ? 'warning' : 'danger' },
                            { label: 'License Utilization', value: licenseUtilization, color: 'info' },
                        ].map(h => html`
                            <div class="col-md-4">
                                <div class="small text-muted mb-1">${h.label}</div>
                                <div class="h3 mb-1">${h.value.toFixed(1)}%</div>
                                <div class="progress progress-sm"><div class="progress-bar bg-${h.color}" style="width:${Math.min(100, h.value)}%"></div></div>
                            </div>
                        `)}
                    </div>
                    <div class="mt-3 small text-muted">
                        Healthy devices: <strong>${healthyDevices}</strong> / ${totalDevices}
                        · Telemetry checks: <strong>${data.successfulTelemetryChecks || 0}</strong> / ${data.totalTelemetryChecks || 0}
                        · Zombie rate: <strong>${Number(data.zombieDeviceRate || 0).toFixed(1)}%</strong>
                    </div>
                    ${alerts.length > 0 && html`
                        <div class="mt-3 d-flex flex-column gap-2">
                            ${alerts.map(alert => html`
                                <div class="alert ${alert.severity === 'critical' ? 'alert-danger' : 'alert-warning'} py-2 mb-0 small">
                                    <strong>${alert.metric}</strong>: ${alert.message} (${Number(alert.current || 0).toFixed(1)} vs ${Number(alert.threshold || 0).toFixed(1)} target)
                                </div>
                            `)}
                        </div>
                    `}
                </div>
            `;
        }

        return html`<div class="p-3 text-muted">No data</div>`;
    }

    // ── Render ───────────────────────────────────────────────────────
    return html`
        <div class="operations-console">
            <!-- Row 1: Fleet Health KPIs -->
            <div class="row g-3 mb-3">
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard} icon="device-desktop" label="Fleet Size" color="primary"
                        value=${formatCompact(totalDevices)}
                        subtitle="${formatCompact(activeDevices)} active"
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard} icon="chart-arrows" label="Seen Devices" color="success"
                        value=${formatCompact(activeDevices)}
                        subtitle="seen at least once / day"
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard} icon="activity" label="Org Data Coverage" color="info"
                        value=${formatPercent(orgDataCoverage)}
                        subtitle="orgs with daily business signal"
                    />
                </div>
                <div class="col-sm-6 col-lg-3 d-flex">
                    <${KpiCard} icon="wifi" label="Avg Daily Seen (7d)" color="cyan"
                        value=${avgOnline > 0 ? formatPercent(avgOnline) : '—'}
                        subtitle=${avgSeenFromSnapshots > 0 ? `${formatCompact(Math.round(avgSeenFromSnapshots))} seen/day` : 'trend data building'}
                    />
                </div>
            </div>

            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title"><i class="ti ti-route-square me-2"></i>Signal Economics Path</h3>
                    <span class="badge bg-blue-lt text-blue ms-auto">Latest daily report</span>
                </div>
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <div class="border rounded p-3 h-100">
                                <div class="subheader mb-1">Processing inputs</div>
                                <div class="h2 mb-1">${formatCompact(processingInputRows)}</div>
                                <div class="text-muted small">Heartbeat + Signals + Performance rows drive ingestion and compute pressure.</div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="border rounded p-3 h-100">
                                <div class="subheader mb-1">Materialized evidence</div>
                                <div class="h2 mb-1">${formatCompact(materializedEvidenceRows)}</div>
                                <div class="text-muted small">Inventory and Alerts are durable evidence rows used by portal, reports, and snapshots.</div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="border rounded p-3 h-100">
                                <div class="subheader mb-1">Serving pressure</div>
                                <div class="h2 mb-1">${apiRequestRows > 0 ? formatCompact(apiRequestRows) : '—'}</div>
                                <div class="text-muted small">ApiLogs cache tracking${apiHitRate > 0 ? ` · ${apiHitRate.toFixed(1)}% cache hit rate` : ' will appear when available'}.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mb-3">
                <div class="card-header">
                    <div>
                        <h3 class="card-title mb-0"><i class="ti ti-clock-dollar me-2"></i>Cron Attribution Preview</h3>
                        <div class="card-subtitle text-muted">${CRON_ATTRIBUTION_WINDOW_DAYS}d audit sample for compute and storage pressure</div>
                    </div>
                    <span class="badge bg-primary text-white ms-auto">runtime proxy</span>
                </div>
                <div class="card-body">
                    ${cronAttribution.loading ? html`
                        <div class="text-muted small py-2"><span class="spinner-border spinner-border-sm me-2"></span>Loading cron attribution sample...</div>
                    ` : cronSummary.timedRuns === 0 ? html`
                        <div class="empty py-3">
                            <div class="empty-icon"><i class="ti ti-chart-bar-off"></i></div>
                            <p class="empty-title">No timed cron runs in the sample</p>
                            ${cronAttribution.error && html`<p class="empty-subtitle text-muted">${cronAttribution.error}</p>`}
                        </div>
                    ` : html`
                        <div class="row g-3 mb-3">
                            <div class="col-sm-6 col-lg-3">
                                <div class="border rounded p-3 h-100">
                                    <div class="subheader mb-1">Compute proxy</div>
                                    <div class="h3 mb-0 text-primary">${formatCronDuration(cronSummary.durationMs)}</div>
                                    <div class="text-muted small">${cronSummary.timedRuns} timed runs</div>
                                </div>
                            </div>
                            <div class="col-sm-6 col-lg-3">
                                <div class="border rounded p-3 h-100">
                                    <div class="subheader mb-1">Storage ops</div>
                                    <div class="h3 mb-0 text-warning">${formatCompact(cronSummary.rows)}</div>
                                    <div class="text-muted small">read/write/delete pressure</div>
                                </div>
                            </div>
                            <div class="col-sm-6 col-lg-3">
                                <div class="border rounded p-3 h-100">
                                    <div class="subheader mb-1">Workload items</div>
                                    <div class="h3 mb-0 text-success">${formatCompact(cronSummary.items)}</div>
                                    <div class="text-muted small">processed by cron jobs</div>
                                </div>
                            </div>
                            <div class="col-sm-6 col-lg-3">
                                <div class="border rounded p-3 h-100">
                                    <div class="subheader mb-1">Coverage</div>
                                    <div class="h3 mb-0">${cronSummary.taskCount}</div>
                                    <div class="text-muted small">tasks across ${cronSummary.laneCount} lanes</div>
                                </div>
                            </div>
                        </div>
                        <div class="row g-3">
                            <div class="col-lg-6">
                                <div class="subheader mb-2">Lane Weight</div>
                                <div class="cron-business-list">
                                    ${cronSummary.lanes.map(lane => {
                                        const percent = Math.max(3, Math.round((lane.durationMs / maxCronLaneRuntime) * 100));
                                        return html`
                                            <div class="cron-business-row">
                                                <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
                                                    <span class="fw-semibold text-truncate">${formatLaneLabel(lane.laneId)}</span>
                                                    <span class="text-muted small">${formatCronDuration(lane.durationMs)}</span>
                                                </div>
                                                <div class="progress progress-sm"><div class="progress-bar bg-primary" style=${`width:${percent}%`}></div></div>
                                                <div class="d-flex flex-wrap gap-1 mt-1">
                                                    <span class="badge bg-secondary text-white">${lane.runs} runs</span>
                                                    <span class="badge bg-warning text-white">${formatCompact(lane.rows)} ops</span>
                                                    ${lane.items > 0 && html`<span class="badge bg-success text-white">${formatCompact(lane.items)} work</span>`}
                                                </div>
                                            </div>
                                        `;
                                    })}
                                </div>
                            </div>
                            <div class="col-lg-6">
                                <div class="subheader mb-2">Task Weight</div>
                                <div class="cron-business-list">
                                    ${cronSummary.topTasks.map(task => {
                                        const percent = Math.max(3, Math.round((task.durationMs / maxCronTaskRuntime) * 100));
                                        return html`
                                            <div class="cron-business-row">
                                                <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
                                                    <span class="fw-semibold text-truncate" title=${task.taskId}>${task.taskId}</span>
                                                    <span class="text-muted small">${formatCronDuration(task.durationMs)}</span>
                                                </div>
                                                <div class="progress progress-sm"><div class="progress-bar bg-info" style=${`width:${percent}%`}></div></div>
                                                <div class="d-flex flex-wrap gap-1 mt-1">
                                                    <span class="badge bg-secondary text-white">${task.runs} runs</span>
                                                    <span class="badge bg-warning text-white">${formatCompact(task.rows)} ops</span>
                                                    ${task.items > 0 && html`<span class="badge bg-success text-white">${formatCompact(task.items)} work</span>`}
                                                </div>
                                            </div>
                                        `;
                                    })}
                                </div>
                            </div>
                        </div>
                    `}
                </div>
            </div>

            <!-- Row 2: Telemetry Volume Stacked Bar -->
            ${(history || []).length >= 2 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title"><i class="ti ti-chart-bar me-2"></i>Operational Signal Volume</h3>
                        <div class="card-actions">
                            <select class="form-select form-select-sm w-auto" value=${String(telemetryDays)} onChange=${(e) => setTelemetryDays(Number(e.target.value) || 30)}>
                                ${[7, 15, 30, 60, 90].map(d => html`<option value=${String(d)}>${d} days</option>`)}
                            </select>
                        </div>
                    </div>
                    <div class="card-body" style="height:260px">
                        <canvas ref=${telemetryBarRef}></canvas>
                    </div>
                </div>
            `}

            <!-- Row 3: Top Orgs + Noisy Devices (50/50) -->
            <div class="row g-3 mb-3">
                <div class="col-md-6 d-flex">
                    <div class="card h-100 w-100">
                        <div class="card-header d-flex align-items-center">
                            <h3 class="card-title"><i class="ti ti-building me-2"></i>Top Org Telemetry Economics</h3>
                            <div class="ms-auto">
                                <select class="form-select form-select-sm w-auto" value=${String(orgWindow)} onChange=${(e) => setOrgWindow(Number(e.target.value) || 30)}>
                                    ${[7, 30, 90].map(days => html`<option value=${String(days)}>${days} days</option>`)}
                                </select>
                            </div>
                        </div>
                        <div class="card-body p-0">
                            ${telemetryAggs.length > 0 ? html`
                                <div class="table-responsive">
                                    <table class="table table-sm table-vcenter card-table">
                                        <thead><tr><th>Organization</th><th class="text-end">Active days</th><th class="text-end">Signals/day</th><th class="text-end">Signals/device</th><th class="text-end">Est. cost/day</th></tr></thead>
                                        <tbody>
                                            ${telemetryAggs.slice(0, 5).map(o => {
                                                const avgCostPerDay = Number(o.avgCostPerDay || ((Number(o.totalAttributedCost || 0) / Math.max(1, Number(o.activeDays || 1)))));
                                                const avgRowsPerDay = Number(o.avgRowsPerDay || 0);
                                                const fallbackOrg = topCostOrgMap.get(o.orgId || '');
                                                const deviceCount = Number(o.avgActiveDevices || o.activeDevices || o.deviceCount || fallbackOrg?.activeDevices || 0);
                                                const rowsPerDevice = Number(o[rowsPerDeviceField] || o.avgRowsPerDevice || (deviceCount > 0 ? (avgRowsPerDay / deviceCount) : 0));
                                                const orgLabel = o.orgName || o.orgId || '-';
                                                const orgSubLabel = o.orgId && o.orgId !== orgLabel ? o.orgId : null;
                                                return html`
                                                    <tr>
                                                        <td>
                                                            <div class="fw-medium">${orgLabel}</div>
                                                            ${orgSubLabel && html`<div class="text-muted small font-monospace">${orgSubLabel}</div>`}
                                                        </td>
                                                        <td class="text-end">${o.activeDays || 0}</td>
                                                        <td class="text-end">${formatCompact(Math.round(avgRowsPerDay))}</td>
                                                        <td class="text-end">${formatCompact(Math.round(rowsPerDevice))}</td>
                                                        <td class="text-end">${ccySymbol}${convert(avgCostPerDay).toFixed(2)}</td>
                                                    </tr>
                                                `;
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ` : html`<div class="empty py-4"><p class="empty-title">No telemetry economics yet</p></div>`}
                        </div>
                    </div>
                </div>
                <div class="col-md-6 d-flex">
                    <div class="card h-100 w-100">
                        <div class="card-header d-flex align-items-center justify-content-between"><h3 class="card-title"><i class="ti ti-volume me-2"></i>Top 10 High-Activity Devices</h3><span class="badge bg-warning text-dark">Most recent completed day</span></div>
                        <div class="card-body p-0">
                            ${noisyDevices.length > 0 ? html`
                                <div class="table-responsive">
                                    <table class="table table-sm table-vcenter card-table">
                                        <thead><tr><th>Device</th><th>Org</th><th class="text-end">Signals</th><th class="text-end">Est. cost</th></tr></thead>
                                        <tbody>
                                            ${noisyDevices.map(d => {
                                                const deviceId = d.deviceId || '-';
                                                const orgLabel = d.orgName || d.orgId || '';
                                                const rawDeviceLabel = d.deviceName || '';
                                                const normalizedDeviceLabel = String(rawDeviceLabel).trim().toLowerCase();
                                                const normalizedOrgLabel = String(orgLabel).trim().toLowerCase();
                                                const useFriendlyName = rawDeviceLabel
                                                    && normalizedDeviceLabel !== normalizedOrgLabel
                                                    && normalizedDeviceLabel !== String(d.orgId || '').trim().toLowerCase()
                                                    && normalizedDeviceLabel !== deviceId.toLowerCase();
                                                const primaryDeviceLabel = useFriendlyName ? rawDeviceLabel : deviceId;
                                                const showDeviceIdSubline = useFriendlyName;
                                                const rowVolume = d.totalRows || d.telemetryRowsToday || d.telemetryVolume || 0;
                                                return html`
                                                    <tr>
                                                        <td>
                                                            <a
                                                                href=${`#!/devices/${deviceId}`}
                                                                class="text-reset fw-medium"
                                                                onClick=${() => { if (d.orgId) orgContext.selectOrg(d.orgId); }}
                                                            >${primaryDeviceLabel}</a>
                                                            ${showDeviceIdSubline && html`<div class="text-muted small font-monospace">${deviceId}</div>`}
                                                        </td>
                                                        <td class="small">${orgLabel || '-'}</td>
                                                        <td class="text-end">${formatCompact(rowVolume)}</td>
                                                        <td class="text-end">${ccySymbol}${convert(d.estimatedDailyCost || 0).toFixed(2)}</td>
                                                    </tr>
                                                `;
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ` : html`<div class="empty py-4"><p class="empty-title">No high-activity devices</p></div>`}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Row 4: Diagnostics Accordion -->
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title"><i class="ti ti-stethoscope me-2"></i>Diagnostics</h3>
                </div>
                <div class="card-body p-0">
                    <div class="p-3 border-bottom bg-light-subtle small text-muted">
                        These diagnostics indicate stale heartbeat, stale telemetry, delivery failures, or license pressure in the new telemetry model.
                    </div>
                    ${diagCategories.map(cat => html`
                        <div class="border-bottom">
                            <div class="p-3 d-flex align-items-center cursor-pointer"
                                 style="cursor:pointer"
                                 onClick=${() => toggleDiag(cat.key)}>
                                <i class="ti ${cat.icon} me-2"></i>
                                <span class="fw-medium">${cat.label}</span>
                                <i class="ti ${expandedDiag === cat.key ? 'ti-chevron-up' : 'ti-chevron-down'} ms-auto"></i>
                            </div>
                            ${expandedDiag === cat.key && html`
                                <div class="border-top">
                                    ${renderDiagContent(cat.key)}
                                </div>
                            `}
                        </div>
                    `)}
                </div>
            </div>

            <!-- Row 5: Region Breakdown -->
            ${regionBreakdown.length > 0 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title"><i class="ti ti-world me-2"></i>Region Breakdown</h3>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-vcenter card-table">
                                <thead><tr><th>Region</th><th>Orgs</th><th>Devices</th><th>Telemetry</th><th>Cost</th><th>Top Org</th></tr></thead>
                                <tbody>
                                    ${regionBreakdown.map(r => html`
                                        <tr>
                                            <td><span class="badge bg-primary-lt text-primary">${getRegionLabel(r.region)}</span></td>
                                            <td>${r.orgCount || 0}</td>
                                            <td>${formatCompact(r.deviceCount || 0)}</td>
                                            <td>${formatCompact(r.telemetryRows || 0)}</td>
                                            <td>${ccySymbol}${convert(r.cost || 0).toFixed(2)}</td>
                                            <td class="font-monospace small">${r.topOrg || '-'}</td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}
