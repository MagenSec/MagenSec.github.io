/**
 * Profitability — per-org bundle revenue vs COGS dashboard.
 * Data source: /api/v1/admin/profitability (Wave 3.4 endpoint)
 */

import { api } from '@api';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

const PACKAGES = ['All', 'Business', 'BusinessPlus', 'BusinessUltimate'];
const TIERS    = ['All', 'Team', 'Department', 'Division', 'Custom', 'Unknown'];
const PKG_KEYS  = ['Business', 'BusinessPlus', 'BusinessUltimate'];
const TIER_KEYS = ['Team', 'Department', 'Division', 'Custom'];
const PKG_COLORS = { Business: '#0054a6', BusinessPlus: '#0ca678', BusinessUltimate: '#7c3aed' };

function formatUsd(val) {
    if (val === null || val === undefined) return '—';
    return '$' + Number(val).toFixed(4);
}

function formatPct(val) {
    if (val === null || val === undefined) return '—';
    return (Number(val) * 100).toFixed(1) + '%';
}

function marginBadge(margin) {
    const pct = Number(margin) * 100;
    if (pct >= 70) return html`<span class="badge bg-success text-white">${pct.toFixed(1)}%</span>`;
    if (pct >= 40) return html`<span class="badge bg-warning text-white">${pct.toFixed(1)}%</span>`;
    if (pct >= 0)  return html`<span class="badge bg-danger text-white">${pct.toFixed(1)}%</span>`;
    return html`<span class="badge bg-dark text-white">${pct.toFixed(1)}%</span>`;
}

function packageBadge(pkg) {
    if (!pkg) return html`<span class="badge bg-secondary text-white">—</span>`;
    if (pkg === 'BusinessUltimate') return html`<span class="badge bg-purple text-white" style="background:#7c3aed">${pkg}</span>`;
    if (pkg === 'BusinessPlus')     return html`<span class="badge bg-info text-white">${pkg}</span>`;
    return html`<span class="badge bg-secondary text-white">${pkg}</span>`;
}

/**
 * Builds a Package×Tier matrix of avg margin values from the orgs array.
 * Returns: { [pkgKey]: { [tierKey]: { avgMargin, count } } }
 */
function buildMatrix(orgs) {
    const matrix = {};
    for (const pkg of PKG_KEYS) {
        matrix[pkg] = {};
        for (const tier of TIER_KEYS) matrix[pkg][tier] = { sum: 0, count: 0 };
    }
    for (const o of orgs) {
        const pkg  = o.package  || null;
        const tier = o.seatTier || null;
        if (pkg && matrix[pkg] && tier && matrix[pkg][tier]) {
            matrix[pkg][tier].sum += (o.estimatedMargin || 0);
            matrix[pkg][tier].count++;
        }
    }
    return matrix;
}

function matrixCellColor(margin) {
    if (margin === null) return '#f8fafc';
    const pct = margin * 100;
    if (pct >= 70) return '#d1fae5';
    if (pct >= 40) return '#fef3c7';
    if (pct >= 0)  return '#fee2e2';
    return '#f1f5f9';
}

export function ProfitabilityPage() {
    const [loading, setLoading]         = useState(true);
    const [data, setData]               = useState(null);
    const [error, setError]             = useState(null);
    const [pkgFilter, setPkgFilter]     = useState('All');
    const [tierFilter, setTierFilter]   = useState('All');
    const [sortField, setSortField]     = useState('estimatedMargin');
    const [sortDir, setSortDir]         = useState('asc');   // low-margin first → problems surface first
    const [search, setSearch]           = useState('');

    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);

    useEffect(() => { loadProfitability(); }, []);

    const loadProfitability = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (pkgFilter  !== 'All') params.package  = pkgFilter;
            if (tierFilter !== 'All') params.seatTier = tierFilter;
            const resp = await api.get('/api/v1/admin/profitability/', params);
            if (!resp?.success) throw new Error(resp?.message || 'API error');
            setData(resp.data);
        } catch (ex) {
            logger.error('[Profitability] load failed', ex);
            setError(ex.message || 'Failed to load profitability data');
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when filters change
    useEffect(() => { loadProfitability(); }, [pkgFilter, tierFilter]);

    // Render / update the margin-by-package bar chart whenever data changes
    useEffect(() => {
        if (!chartRef.current || !data?.orgs) return;
        const orgs = data.orgs;

        // Compute avg margin per package across all orgs
        const pkgGroups = {};
        for (const pkg of PKG_KEYS) pkgGroups[pkg] = { sum: 0, count: 0 };
        for (const o of orgs) {
            const p = o.package;
            if (p && pkgGroups[p]) {
                pkgGroups[p].sum += (o.estimatedMargin || 0);
                pkgGroups[p].count++;
            }
        }
        const labels = PKG_KEYS.map(p => p.replace('Business', 'Business\n'));
        const values = PKG_KEYS.map(p => pkgGroups[p].count ? +(pkgGroups[p].sum / pkgGroups[p].count * 100).toFixed(1) : null);

        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
        }

        const Chart = window.Chart;
        if (!Chart) return;

        chartInstanceRef.current = new Chart(chartRef.current, {
            type: 'bar',
            data: {
                labels: PKG_KEYS,
                datasets: [{
                    label: 'Avg Gross Margin (%)',
                    data: values,
                    backgroundColor: PKG_KEYS.map(p => PKG_COLORS[p] + 'cc'),
                    borderColor: PKG_KEYS.map(p => PKG_COLORS[p]),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.raw !== null ? `${ctx.raw}%` : 'No data'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });

        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, [data]);

    const orgs = (data?.orgs || []).filter(o => {
        if (!search) return true;
        return (o.orgId || '').toLowerCase().includes(search.toLowerCase());
    });

    // Client-side sort
    const sorted = [...orgs].sort((a, b) => {
        const av = a[sortField] ?? 0;
        const bv = b[sortField] ?? 0;
        return sortDir === 'asc' ? av - bv : bv - av;
    });

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const sortIcon = (field) => {
        if (sortField !== field) return html`<i class="ti ti-arrows-sort text-muted ms-1" style="font-size:.75rem"></i>`;
        return html`<i class="ti ${sortDir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} text-primary ms-1" style="font-size:.75rem"></i>`;
    };

    if (error) {
        return html`
            <div class="alert alert-danger d-flex align-items-center mt-3">
                <i class="ti ti-alert-triangle me-2"></i>
                ${error}
                <button class="btn btn-sm btn-outline-danger ms-auto" onClick=${loadProfitability}>Retry</button>
            </div>
        `;
    }

    return html`
        <div class="profitability-page">

            <!-- KPI row -->
            <div class="row g-3 mb-4">
                ${loading ? html`
                    ${[0,1,2].map(() => html`
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body placeholder-glow">
                                    <span class="placeholder col-6 mb-2"></span>
                                    <span class="placeholder col-4 d-block" style="height:2rem"></span>
                                </div>
                            </div>
                        </div>
                    `)}
                ` : html`
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="subheader">Total Daily Revenue</div>
                                <div class="h1 mb-0">${formatUsd(data?.totalDailyRevenue)}</div>
                                <div class="text-muted small">${data?.totalOrgs ?? 0} orgs tracked</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="subheader">Total Daily COGS</div>
                                <div class="h1 mb-0">${formatUsd(data?.totalDailyCost)}</div>
                                <div class="text-muted small">Compute + AI + add-on estimate</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="subheader">Overall Gross Margin</div>
                                <div class="h1 mb-0">${formatPct(data?.overallMargin)}</div>
                                <div class="text-muted small">Average across filtered orgs</div>
                            </div>
                        </div>
                    </div>
                `}
            </div>

            <!-- Charts row -->
            ${!loading && data?.orgs?.length > 0 && (() => {
                const matrix = buildMatrix(data.orgs);
                return html`
                    <div class="row g-3 mb-4">
                        <!-- Package×Tier matrix -->
                        <div class="col-md-7">
                            <div class="card h-100">
                                <div class="card-header">
                                    <div class="card-title">Margin by Package × Tier</div>
                                    <div class="card-options text-muted small">Average gross margin %</div>
                                </div>
                                <div class="card-body p-2">
                                    <div class="table-responsive">
                                        <table class="table table-sm table-bordered text-center mb-0" style="font-size:.8rem">
                                            <thead class="table-light">
                                                <tr>
                                                    <th class="text-start">Package</th>
                                                    ${TIER_KEYS.map(t => html`<th>${t}</th>`)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${PKG_KEYS.map(pkg => html`
                                                    <tr>
                                                        <td class="text-start fw-semibold">${pkg.replace('Business', 'Biz')}</td>
                                                        ${TIER_KEYS.map(tier => {
                                                            const cell = matrix[pkg]?.[tier];
                                                            const avg = cell?.count ? cell.sum / cell.count : null;
                                                            return html`
                                                                <td style="background:${matrixCellColor(avg)}">
                                                                    ${avg !== null
                                                                        ? html`<span class="fw-bold">${(avg * 100).toFixed(0)}%</span><br/><span class="text-muted" style="font-size:.7rem">${cell.count} org${cell.count !== 1 ? 's' : ''}</span>`
                                                                        : html`<span class="text-muted">—</span>`}
                                                                </td>
                                                            `;
                                                        })}
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div class="d-flex gap-3 mt-2 px-1" style="font-size:.72rem">
                                        <span><span class="d-inline-block me-1 rounded" style="width:12px;height:12px;background:#d1fae5;border:1px solid #6ee7b7"></span>≥70%</span>
                                        <span><span class="d-inline-block me-1 rounded" style="width:12px;height:12px;background:#fef3c7;border:1px solid #fcd34d"></span>40–69%</span>
                                        <span><span class="d-inline-block me-1 rounded" style="width:12px;height:12px;background:#fee2e2;border:1px solid #fca5a5"></span>&lt;40%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Margin by package bar chart -->
                        <div class="col-md-5">
                            <div class="card h-100">
                                <div class="card-header">
                                    <div class="card-title">Avg Margin by Package</div>
                                </div>
                                <div class="card-body">
                                    <div style="position:relative;height:180px">
                                        <canvas ref=${chartRef}></canvas>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            })()}

            <!-- Filters -->
            <div class="card mb-3">
                <div class="card-body py-2">
                    <div class="row g-2 align-items-center">
                        <div class="col-auto">
                            <label class="form-label mb-0 me-2 text-muted small">Package</label>
                            <div class="btn-group btn-group-sm">
                                ${PACKAGES.map(p => html`
                                    <button
                                        class="btn ${pkgFilter === p ? 'btn-primary' : 'btn-outline-secondary'}"
                                        onClick=${() => setPkgFilter(p)}>
                                        ${p === 'All' ? 'All Packages' : p}
                                    </button>
                                `)}
                            </div>
                        </div>
                        <div class="col-auto">
                            <label class="form-label mb-0 me-2 text-muted small">Tier</label>
                            <div class="btn-group btn-group-sm">
                                ${TIERS.map(t => html`
                                    <button
                                        class="btn ${tierFilter === t ? 'btn-info' : 'btn-outline-secondary'}"
                                        onClick=${() => setTierFilter(t)}>
                                        ${t}
                                    </button>
                                `)}
                            </div>
                        </div>
                        <div class="col">
                            <input
                                type="text"
                                class="form-control form-control-sm"
                                placeholder="Search org ID…"
                                value=${search}
                                onInput=${e => setSearch(e.target.value)}
                            />
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-sm btn-outline-secondary" onClick=${loadProfitability} disabled=${loading}>
                                <i class="ti ti-refresh me-1"></i> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Table -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title">
                        Org Profitability
                        ${!loading && html`<span class="badge bg-secondary-lt text-secondary ms-2">${sorted.length}</span>`}
                    </div>
                    <div class="card-options text-muted small">
                        Sorted by ${sortField} ${sortDir} &bull; Click column header to re-sort
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-vcenter card-table table-hover table-sm">
                        <thead>
                            <tr>
                                <th>Org ID</th>
                                <th>Package</th>
                                <th>Tier</th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('activeDevices')}>
                                    Devices ${sortIcon('activeDevices')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('seenDevices')}>
                                    Seen ${sortIcon('seenDevices')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('telemetryVolume')}>
                                    Telemetry ${sortIcon('telemetryVolume')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('dailyRevenueUsd')}>
                                    Daily Rev ${sortIcon('dailyRevenueUsd')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('dailyCostUsd')}>
                                    Daily COGS ${sortIcon('dailyCostUsd')}
                                </th>
                                <th class="text-end" style="cursor:pointer" onClick=${() => toggleSort('estimatedMargin')}>
                                    Margin ${sortIcon('estimatedMargin')}
                                </th>
                                <th class="text-end">Add-ons</th>
                                <th class="text-end">Computed</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${loading ? html`
                                ${Array.from({ length: 6 }).map(() => html`
                                    <tr class="placeholder-glow">
                                        ${Array.from({ length: 11 }).map(() => html`
                                            <td><span class="placeholder col-8"></span></td>
                                        `)}
                                    </tr>
                                `)}
                            ` : sorted.length === 0 ? html`
                                <tr>
                                    <td colspan="11" class="text-center text-muted py-4">
                                        No profitability data yet. Rows are computed by the nightly cron task.
                                    </td>
                                </tr>
                            ` : sorted.map(o => html`
                                <tr>
                                    <td>
                                        <code class="text-reset" style="font-size:.8rem">${o.orgId}</code>
                                    </td>
                                    <td>${packageBadge(o.package)}</td>
                                    <td><span class="text-muted small">${o.seatTier || '—'}</span></td>
                                    <td class="text-end">${o.activeDevices ?? '—'}</td>
                                    <td class="text-end">${o.seenDevices > 0 ? o.seenDevices : html`<span class="text-muted">—</span>`}</td>
                                    <td class="text-end font-monospace small">${o.telemetryVolume > 0 ? Number(o.telemetryVolume).toLocaleString() : html`<span class="text-muted">—</span>`}</td>
                                    <td class="text-end font-monospace small">${formatUsd(o.dailyRevenueUsd)}</td>
                                    <td class="text-end font-monospace small">${formatUsd(o.dailyCostUsd)}</td>
                                    <td class="text-end">${marginBadge(o.estimatedMargin)}</td>
                                    <td class="text-end">
                                        ${o.enabledAddOnsCount > 0
                                            ? html`<span class="badge bg-purple-lt text-purple" style="--tblr-purple:#7c3aed">${o.enabledAddOnsCount}</span>`
                                            : html`<span class="text-muted">—</span>`}
                                    </td>
                                    <td class="text-end text-muted small">
                                        ${o.computedAt ? new Date(o.computedAt).toLocaleString() : '—'}
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
                ${data?.generatedAt && html`
                    <div class="card-footer text-muted small text-end">
                        Fetched ${new Date(data.generatedAt).toLocaleString()}
                    </div>
                `}
            </div>
        </div>
    `;
}
