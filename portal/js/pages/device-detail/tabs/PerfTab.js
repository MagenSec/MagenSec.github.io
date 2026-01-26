/**
 * Performance Tab - Time-series metrics with configurable bucketing
 * 
 * Renders performance metrics with bucketed time-series data:
 * - 4 chart panels: CPU, Memory, DB Footprint, Network
 * - Bucket selector (1h, 6h, 1d) and range selector (1-30 days)
 * - Percentile badges (P50, P90, P95) for each metric
 * - Can be rendered standalone or embedded
 */
import { formatBytesHuman } from '../utils/FormattingUtils.js';

export function renderPerfTab(component, embedded = false) {
    const { html } = window;
    const perf = component.state.perfData;
    const { perfBucket, perfRangeDays, perfLoading } = component.state;

    if (component.state.perfError) {
        return html`<div class="alert alert-warning">${component.state.perfError}</div>`;
    }

    if (perfLoading && !perf) {
        return html`<div class="text-muted">Loading performance timeline…</div>`;
    }

    if (!perf) {
        return html`<div class="text-muted">No performance data loaded yet.</div>`;
    }

    const points = perf.points || [];
    if (points.length === 0) {
        return html`<div class="alert alert-info">No performance telemetry available for this window.</div>`;
    }

    const fmtRange = (val) => val ? new Date(val).toLocaleString() : 'N/A';
    const latestPoint = points[points.length - 1];
    const pct = (v) => Number.isFinite(Number(v)) ? `${Math.round(Number(v))}%` : 'N/A';
    const mb = (v) => Number.isFinite(Number(v)) ? `${Math.round(Number(v))} MB` : 'N/A';
    const mbps = (v) => Number.isFinite(Number(v)) ? `${Math.round(Number(v))} Mbps` : 'N/A';

    const cpuPercentiles = component.calculatePercentiles(points.map(p => p.cpuAvg ?? p.CpuAvg));
    const memPercentiles = component.calculatePercentiles(points.map(p => p.memoryAvg ?? p.MemoryAvg));
    const memMbPercentiles = component.calculatePercentiles(points.map(p => p.memoryAvgMb ?? p.MemoryAvgMb));
    const diskPercentiles = component.calculatePercentiles(points.map(p => p.diskTotalMbAvg ?? p.diskAvg ?? p.DiskAvg));
    const netPercentiles = component.calculatePercentiles(points.map(p => p.networkMbpsAvg ?? p.networkAvg ?? p.NetworkAvg));

    const bucketOptions = [
        { label: '1h buckets', value: '1h' },
        { label: '6h buckets', value: '6h' },
        { label: '1d buckets', value: '1d' }
    ];

    const rangeOptions = [
        { label: '24h', value: 1 },
        { label: '3 days', value: 3 },
        { label: '7 days', value: 7 },
        { label: '14 days', value: 14 },
        { label: '30 days', value: 30 }
    ];

    const onBucketChange = (e) => {
        const value = e.target.value;
        component.setState({ perfBucket: value }, () => component.loadPerfData(value, component.state.perfRangeDays));
    };

    const onRangeChange = (e) => {
        const value = Number(e.target.value) || 7;
        component.setState({ perfRangeDays: value }, () => component.loadPerfData(component.state.perfBucket, value));
    };

    const percentileBadge = (label, val, formatter) => html`
        <span class="badge bg-light text-body fw-normal border">${label}: ${val !== null && val !== undefined ? formatter(val) : '—'}</span>
    `;

    const headerContent = html`
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
            <div>
                <div class="fw-bold">Performance (bucketed)</div>
                <div class="text-muted small">
                    Window: ${fmtRange(perf.startUtc)} – ${fmtRange(perf.endUtc)} • Bucket ${perf.bucketMinutes}m • Computed ${fmtRange(perf.computedUtc)}
                </div>
                <div class="text-muted small">${points.length} points • ${perf.sampleCount || 0} samples${perf.fromCache ? ' • cached' : ''}${perf.isFresh ? ' • fresh' : ''}</div>
            </div>
            <div class="d-flex flex-wrap gap-2 align-items-center">
                <label class="form-label m-0 text-muted small">Bucket</label>
                <select class="form-select form-select-sm" value=${perfBucket} onchange=${onBucketChange} disabled=${perfLoading}>
                    ${bucketOptions.map(opt => html`<option value=${opt.value} selected=${perfBucket === opt.value}>${opt.label}</option>`)}
                </select>
                <label class="form-label m-0 text-muted small">Range</label>
                <select class="form-select form-select-sm" value=${perfRangeDays} onchange=${onRangeChange} disabled=${perfLoading}>
                    ${rangeOptions.map(opt => html`<option value=${opt.value} selected=${Number(perfRangeDays) === Number(opt.value)}>${opt.label}</option>`)}
                </select>
                ${perfLoading ? html`<div class="spinner-border spinner-border-sm text-primary" role="status"></div>` : ''}
            </div>
        </div>
    `;

    const chartGrid = html`
        <div class="row g-3">
            <div class="col-12 col-lg-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="fw-bold">CPU</div>
                            <div class="d-flex gap-1 flex-wrap">
                                ${percentileBadge('P50', cpuPercentiles?.p50, pct)}
                                ${percentileBadge('P90', cpuPercentiles?.p90, pct)}
                                ${percentileBadge('P95', cpuPercentiles?.p95, pct)}
                            </div>
                        </div>
                        <div ref=${(el) => { component.perfCpuEl = el; }} style="min-height: 220px;"></div>
                        <div class="text-muted small mt-2">Latest: ${pct(latestPoint?.cpuAvg)}</div>
                    </div>
                </div>
            </div>
            <div class="col-12 col-lg-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="fw-bold">Memory</div>
                            <div class="d-flex gap-1 flex-wrap">
                                ${percentileBadge('P50', memPercentiles?.p50, pct)}
                                ${percentileBadge('P90', memPercentiles?.p90, pct)}
                                ${percentileBadge('P95', memPercentiles?.p95, pct)}
                            </div>
                        </div>
                        <div ref=${(el) => { component.perfMemEl = el; }} style="min-height: 220px;"></div>
                        <div class="text-muted small mt-2">Latest: ${pct(latestPoint?.memoryAvg)} (${mb(latestPoint?.memoryAvgMb)} used)</div>
                        <div class="text-muted small">RAM percent is relative to reported device RAM; MB line shows working set.</div>
                    </div>
                </div>
            </div>
            <div class="col-12 col-lg-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="fw-bold">DB Footprint</div>
                            <div class="d-flex gap-1 flex-wrap">
                                ${percentileBadge('P50', diskPercentiles?.p50, mb)}
                                ${percentileBadge('P90', diskPercentiles?.p90, mb)}
                                ${percentileBadge('P95', diskPercentiles?.p95, mb)}
                            </div>
                        </div>
                        <div ref=${(el) => { component.perfDiskEl = el; }} style="min-height: 220px;"></div>
                        <div class="text-muted small mt-2">Latest total: ${mb(latestPoint?.diskTotalMbAvg)} (App ${mb(latestPoint?.diskAppMbAvg)}, Intel ${mb(latestPoint?.diskIntelMbAvg)})</div>
                    </div>
                </div>
            </div>
            <div class="col-12 col-lg-6">
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div class="fw-bold">Network</div>
                            <div class="d-flex gap-1 flex-wrap">
                                ${percentileBadge('P50', netPercentiles?.p50, mbps)}
                                ${percentileBadge('P90', netPercentiles?.p90, mbps)}
                                ${percentileBadge('P95', netPercentiles?.p95, mbps)}
                            </div>
                        </div>
                        <div ref=${(el) => { component.perfNetEl = el; }} style="min-height: 220px;"></div>
                        <div class="text-muted small mt-2">Latest: ${mbps(latestPoint?.networkMbpsAvg)} • Sent ${formatBytesHuman(latestPoint?.networkBytesSent)} • Recv ${formatBytesHuman(latestPoint?.networkBytesReceived)} • Requests ${Math.round(latestPoint?.networkRequests || 0)} • Failures ${Math.round(latestPoint?.networkFailures || 0)}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (embedded) {
        return html`
            <div class="d-flex flex-column gap-3">
                ${headerContent}
                ${chartGrid}
            </div>
        `;
    }

    return html`
        <div class="row row-cards">
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        ${headerContent}
                    </div>
                    <div class="card-body">
                        ${chartGrid}
                    </div>
                </div>
            </div>
        </div>
    `;
}
