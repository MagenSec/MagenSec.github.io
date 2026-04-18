import { api } from '@api';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useCallback } = window.preactHooks;

// ── Helpers ──────────────────────────────────────────────────────────────────

function gradeFor(pct) {
    if (pct >= 80) return { grade: 'A', color: 'success' };
    if (pct >= 60) return { grade: 'B', color: 'info' };
    if (pct >= 40) return { grade: 'C', color: 'warning' };
    if (pct >= 20) return { grade: 'D', color: 'danger' };
    return { grade: 'F', color: 'danger' };
}

function PercentileBar({ label, value, color = 'primary' }) {
    return html`
        <div class="mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small text-muted">${label}</span>
                <span class="small fw-bold">${value ?? 0}th</span>
            </div>
            <div class="progress progress-sm">
                <div class="progress-bar bg-${color}" style=${'width:' + (value ?? 0) + '%'}></div>
            </div>
        </div>
    `;
}

function DomainBenchmarkRow({ d }) {
    const isAbove = d.orgScore >= d.peerMedian;
    return html`
        <tr>
            <td class="text-muted small">${d.domain}</td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <div class="flex-grow-1" style="min-width:80px;">
                        <div class="progress progress-sm">
                            <div class=${'progress-bar ' + (isAbove ? 'bg-success' : 'bg-warning')}
                                 style=${'width:' + d.orgScore + '%'}></div>
                        </div>
                    </div>
                    <span class="small fw-bold" style="min-width:24px;text-align:right;">${d.orgScore}</span>
                </div>
            </td>
            <td class="text-center small text-muted">${d.peerMedian}</td>
            <td class="text-center small text-muted">${d.peerP75}</td>
            <td class="text-center">
                <span class=${'badge ' + (d.delta >= 0 ? 'bg-success-lt text-success' : 'bg-danger-lt text-danger')}>
                    ${d.delta >= 0 ? '+' : ''}${d.delta}
                </span>
            </td>
        </tr>
    `;
}

function PriorityBadge({ priority }) {
    if (!priority) return null;
    const p = priority.toLowerCase();
    const [bg, label] = p === 'critical' ? ['danger', 'Critical']
        : p === 'high'    ? ['warning', 'High']
        : p === 'medium'  ? ['info',    'Medium']
        :                   ['success', 'Low'];
    return html`<span class="badge bg-${bg} text-white">${label}</span>`;
}

// ── Main content renderer ────────────────────────────────────────────────────

function renderBenchmarkContent(peer) {
    const { grade: allGrade, color: allColor } = gradeFor(peer.allOrgsPercentile ?? 0);

    return html`
        <!-- Headline stat cards -->
        <div class="row g-3 mb-4">
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm text-center">
                    <div class="card-body">
                        <div class="subheader mb-1 text-muted">All-Orgs Percentile</div>
                        <div class="display-6 fw-bold">${peer.allOrgsPercentile ?? 0}<span class="fs-6 text-muted">th</span></div>
                        <span class=${'badge bg-' + allColor + ' text-white mt-1'}>Grade ${allGrade}</span>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm text-center">
                    <div class="card-body">
                        <div class="subheader mb-1 text-muted">Hygiene Score</div>
                        <div class="display-6 fw-bold">${peer.orgScore ?? '—'}</div>
                        <div class="text-muted small">global median ${peer.allOrgsMedianScore ?? '—'}</div>
                    </div>
                </div>
            </div>
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm text-center">
                    <div class="card-body">
                        <div class="subheader mb-1 text-muted">Global Cohort</div>
                        <div class="display-6 fw-bold">${peer.globalCohortSize ?? '—'}</div>
                        <div class="text-muted small">organizations</div>
                    </div>
                </div>
            </div>
            ${peer.hasIndustryCohort ? html`
                <div class="col-sm-6 col-lg-3">
                    <div class="card card-sm text-center" style="border-color:rgba(99,102,241,0.4);">
                        <div class="card-body">
                            <div class="subheader mb-1" style="color:#6366f1;">Industry Percentile</div>
                            <div class="display-6 fw-bold">${peer.industryPercentile ?? 0}<span class="fs-6 text-muted">th</span></div>
                            <div class="text-muted small">${peer.industryBucket} · ${peer.industryCohortSize} orgs</div>
                        </div>
                    </div>
                </div>
            ` : html`
                <div class="col-sm-6 col-lg-3">
                    <div class="card card-sm text-center">
                        <div class="card-body d-flex flex-column align-items-center justify-content-center" style="min-height:90px;">
                            <div class="subheader mb-1 text-muted">Industry Cohort</div>
                            <div class="text-muted small text-center">Not enough data<br/>in your sector yet</div>
                        </div>
                    </div>
                </div>
            `}
        </div>

        <!-- Multi-axis percentile comparison -->
        <div class="row g-3 mb-4">
            <div class=${'col-md-' + (peer.hasIndustryCohort ? '6' : '12')}>
                <div class="card">
                    <div class="card-header"><div class="card-title">Multi-Axis Percentile — All Orgs</div></div>
                    <div class="card-body">
                        <${PercentileBar} label="Security"   value=${peer.allOrgsPercentile ?? 0}           color="blue" />
                        <${PercentileBar} label="Hygiene"    value=${peer.allOrgsHygienePercentile ?? 0}    color="teal" />
                        <${PercentileBar} label="Compliance" value=${peer.allOrgsCompliancePercentile ?? 0} color="purple" />
                    </div>
                </div>
            </div>
            ${peer.hasIndustryCohort ? html`
                <div class="col-md-6">
                    <div class="card" style="border-color:rgba(99,102,241,0.35);">
                        <div class="card-header" style="background:rgba(99,102,241,0.05);">
                            <div class="card-title">Multi-Axis Percentile — ${peer.industryBucket}</div>
                        </div>
                        <div class="card-body">
                            <${PercentileBar} label="Security"   value=${peer.industryPercentile ?? 0}           color="indigo" />
                            <${PercentileBar} label="Hygiene"    value=${peer.industryHygienePercentile ?? 0}    color="teal" />
                            <${PercentileBar} label="Compliance" value=${peer.industryCompliancePercentile ?? 0} color="purple" />
                        </div>
                    </div>
                </div>
            ` : null}
        </div>

        <!-- Domain benchmarks -->
        ${peer.domainBenchmarks?.length > 0 ? html`
            <div class="card mb-4">
                <div class="card-header">
                    <div class="card-title">Domain-Level Benchmarks</div>
                    <div class="card-options text-muted small">Your score / Peer median / P75</div>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm table-vcenter card-table">
                        <thead>
                            <tr>
                                <th>Domain</th>
                                <th>Your Score</th>
                                <th class="text-center">Median</th>
                                <th class="text-center">P75</th>
                                <th class="text-center">Delta</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${peer.domainBenchmarks.map(d => html`<${DomainBenchmarkRow} d=${d} />`)}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : null}

        <!-- Top gap / strength domains -->
        ${(peer.topGapDomains?.length > 0 || peer.topStrengthDomains?.length > 0) ? html`
            <div class="row g-3 mb-4">
                ${peer.topGapDomains?.length > 0 ? html`
                    <div class=${'col-md-' + (peer.topStrengthDomains?.length > 0 ? '6' : '12')}>
                        <div class="card">
                            <div class="card-header">
                                <div class="card-title text-danger">
                                    <i class="ti ti-arrow-down me-1"></i> Top Gap Domains vs Peers
                                </div>
                            </div>
                            <div class="list-group list-group-flush">
                                ${peer.topGapDomains.map(d => html`
                                    <div class="list-group-item">
                                        <i class="ti ti-circle-minus text-danger me-2"></i>${d}
                                    </div>
                                `)}
                            </div>
                        </div>
                    </div>
                ` : null}
                ${peer.topStrengthDomains?.length > 0 ? html`
                    <div class=${'col-md-' + (peer.topGapDomains?.length > 0 ? '6' : '12')}>
                        <div class="card">
                            <div class="card-header">
                                <div class="card-title text-success">
                                    <i class="ti ti-arrow-up me-1"></i> Strength Domains
                                </div>
                            </div>
                            <div class="list-group list-group-flush">
                                ${peer.topStrengthDomains.map(d => html`
                                    <div class="list-group-item">
                                        <i class="ti ti-circle-check text-success me-2"></i>${d}
                                    </div>
                                `)}
                            </div>
                        </div>
                    </div>
                ` : null}
            </div>
        ` : null}

        <!-- Peer patterns: what top-quartile orgs do differently -->
        ${peer.topPeerPatterns?.length > 0 ? html`
            <div class="card mb-4">
                <div class="card-header">
                    <div class="card-title">What Top-Quartile Peers Do Differently</div>
                </div>
                <div class="card-body p-0">
                    <div class="divide-y">
                        ${peer.topPeerPatterns.map((p, i) => html`
                            <div class="row align-items-center g-0 p-3">
                                <div class="col-auto me-3">
                                    <span class="avatar avatar-sm bg-indigo-lt text-indigo fw-bold">${i + 1}</span>
                                </div>
                                <div class="col">
                                    <div class="fw-semibold">${p.title}</div>
                                    ${p.detail ? html`<div class="text-muted small">${p.detail}</div>` : null}
                                </div>
                                ${(p.topQuartileValue || p.allOrgsMedian) ? html`
                                    <div class="col-auto text-end">
                                        <div class="text-muted small">Top quartile</div>
                                        <div class="fw-bold">
                                            ${p.topQuartileValue}
                                            <span class="text-muted fw-normal"> vs ${p.allOrgsMedian}</span>
                                        </div>
                                    </div>
                                ` : null}
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        ` : null}

        <!-- Prioritized actions with percentile lift -->
        ${peer.prioritizedActions?.length > 0 ? html`
            <div class="card mb-4">
                <div class="card-header">
                    <div class="card-title">Recommended Actions — Ranked by Percentile Lift</div>
                </div>
                <div class="list-group list-group-flush">
                    ${peer.prioritizedActions.map((a, i) => html`
                        <div class="list-group-item">
                            <div class="d-flex align-items-start gap-3">
                                <span class="avatar avatar-sm bg-blue-lt text-blue fw-bold flex-shrink-0">${i + 1}</span>
                                <div class="flex-grow-1">
                                    <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
                                        <span class="fw-semibold">${a.title}</span>
                                        <${PriorityBadge} priority=${a.priority} />
                                        ${a.percentileLift > 0 ? html`
                                            <span class="badge bg-success text-white">+${a.percentileLift}th percentile</span>
                                        ` : null}
                                    </div>
                                    <div class="text-muted small">
                                        Risk reduction: ${a.riskReduction}%
                                        · ${a.affectedDevices} device${a.affectedDevices === 1 ? '' : 's'} affected
                                        ${a.projectedPercentile ? html` · Projected: <strong>${a.projectedPercentile}th</strong>` : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        ` : null}

        <!-- 30-day rolling trend sparkline -->
        ${peer.percentileTrend30d?.length > 1 ? html`
            <div class="card mb-4">
                <div class="card-header"><div class="card-title">30-Day Percentile Trend (All Orgs)</div></div>
                <div class="card-body">
                    <div class="d-flex align-items-end gap-1" style="height:60px;">
                        ${peer.percentileTrend30d.map(pt => {
                            const h = Math.max(4, Math.round((pt.percentile / 100) * 56));
                            const color = pt.percentile >= 60 ? '#2fb344' : pt.percentile >= 40 ? '#f59f00' : '#d63939';
                            return html`
                                <div title=${pt.date + ': ' + pt.percentile + 'th percentile'}
                                     style=${'flex:1;min-width:4px;height:' + h + 'px;background:' + color + ';border-radius:2px 2px 0 0;opacity:0.85;'}>
                                </div>
                            `;
                        })}
                    </div>
                    <div class="d-flex justify-content-between mt-1" style="font-size:0.7rem;color:#94a3b8;">
                        <span>${peer.percentileTrend30d.at(0)?.date ?? ''}</span>
                        <span>${peer.percentileTrend30d.at(-1)?.date ?? ''}</span>
                    </div>
                </div>
            </div>
        ` : null}
    `;
}

// ── Page component ───────────────────────────────────────────────────────────

export function PeerBenchmarkPage() {
    const isEnabled        = window.orgContext?.hasPeerBenchmark?.() ?? false;
    const isLicensedForOrg = window.orgContext?.hasAddOnForOrg?.('PeerBenchmark') ?? false;
    const isSiteAdmin      = window.orgContext?.isSiteAdmin?.() ?? false;
    const orgId            = window.orgContext?.getCurrentOrg?.()?.orgId;

    const [loading, setLoading] = useState(true);
    const [data,    setData]    = useState(null);
    const [error,   setError]   = useState(null);

    const load = useCallback(async (date = '') => {
        if (!orgId) return;
        setLoading(true);
        setError(null);
        try {
            const params = date ? `?date=${encodeURIComponent(date)}` : '';
            const path   = `/api/v1/orgs/${encodeURIComponent(orgId)}/add-ons/peer-benchmark${params}`;
            const resp   = await api.get(path);
            if (!resp?.success) throw new Error(resp?.message || 'API error');
            const peer = resp?.data?.peerBenchmark;
            if (!peer) throw new Error('No benchmark data returned');
            setData(peer);
        } catch (ex) {
            logger.error('[PeerBenchmark] load failed', ex);
            setError(ex.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        if (!isEnabled || !orgId) return;
        const rewind = window.rewindContext;
        load(rewind?.isActive?.() ? rewind.getDate?.() : '');
        const unsubscribe = rewind?.onChange?.((date) => load(date || ''));
        return () => unsubscribe?.();
    }, [isEnabled, isLicensedForOrg, orgId]);

    if (!isEnabled && !isSiteAdmin) {
        return html`
            <div class="container-xl">
                <div class="page-header d-print-none mb-3">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Add-ons</div>
                            <h2 class="page-title">Peer Benchmark</h2>
                        </div>
                    </div>
                </div>
                <div style="max-width:640px;margin:48px auto 0;">
                    <div class="card" style="border-top:3px solid var(--tblr-primary);">
                        <div class="card-body text-center pt-5 pb-5 px-4">
                            <div class="mb-4">
                                <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#2563eb);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(99,102,241,0.25);">
                                    <i class="ti ti-chart-dots-3" style="font-size:2.2rem;color:white;"></i>
                                </div>
                            </div>
                            <h2 class="mb-2">Peer Benchmark</h2>
                            <p class="text-muted mb-4" style="max-width:460px;margin-left:auto;margin-right:auto;">
                                See how your organization's security posture compares to global and industry peers.
                            </p>
                            <div class="text-start mb-5" style="max-width:420px;margin-left:auto;margin-right:auto;">
                                ${[
                                    'Percentile ranking against thousands of organizations worldwide',
                                    'Industry-specific cohort comparison for your business sector',
                                    'Domain-level gap analysis with peer median benchmarks',
                                    'Trend tracking to measure improvement over time'
                                ].map(f => html`
                                    <div class="d-flex align-items-start gap-2 mb-3">
                                        <div style="width:20px;height:20px;border-radius:50%;background:rgba(99,102,241,0.12);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
                                            <i class="ti ti-check" style="font-size:0.75rem;color:#6366f1;"></i>
                                        </div>
                                        <span class="text-secondary">${f}</span>
                                    </div>
                                `)}
                            </div>
                            <div class="d-flex gap-2 justify-content-center flex-wrap mb-3">
                                <a href="mailto:MagenSec@Gigabits.co.in?subject=Upgrade%20Inquiry%20%E2%80%94%20Peer%20Benchmark" class="btn btn-primary">
                                    <i class="ti ti-mail me-1"></i> Contact Us to Upgrade
                                </a>
                                <a href="mailto:MagenSec@Gigabits.co.in?subject=Demo%20Request%20%E2%80%94%20Peer%20Benchmark" class="btn btn-outline-secondary">
                                    <i class="ti ti-calendar me-1"></i> Book a Demo
                                </a>
                            </div>
                            <p class="text-muted small mt-2 mb-0">
                                Available on <strong>Business Ultimate</strong> plan.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    const isTimewarp = window.rewindContext?.isActive?.() ?? false;

    return html`
        <div class="container-xl">
            <!-- Page header -->
            <div class="page-header d-print-none mb-3">
                <div class="row align-items-center">
                    <div class="col">
                        <div class="page-pretitle">Add-ons</div>
                        <h2 class="page-title">
                            Peer Benchmark
                            ${isTimewarp && data?.snapshotDate ? html`
                                <span class="badge bg-purple text-white ms-2" style="font-size:0.7rem;vertical-align:middle;">
                                    <i class="ti ti-history me-1"></i> ${data.snapshotDate}
                                </span>
                            ` : null}
                        </h2>
                    </div>
                    <div class="col-auto ms-auto">
                        <button class="btn btn-sm btn-outline-secondary"
                                onClick=${() => load(isTimewarp ? window.rewindContext?.getDate?.() : '')}
                                disabled=${loading}>
                            <i class="ti ti-refresh me-1"></i> Refresh
                        </button>
                    </div>
                </div>
            </div>

            <!-- Content -->
            ${error ? html`
                <div class="alert alert-danger d-flex align-items-center">
                    <i class="ti ti-alert-triangle me-2"></i> ${error}
                    <button class="btn btn-sm btn-outline-danger ms-auto" onClick=${() => load()}>Retry</button>
                </div>
            ` : loading ? html`
                <div class="d-flex justify-content-center align-items-center" style="min-height:200px;">
                    <div class="spinner-border text-primary" role="status"></div>
                </div>
            ` : data ? renderBenchmarkContent(data) : html`
                <div class="empty mt-4">
                    <p class="empty-title">No benchmark data yet</p>
                    <p class="empty-subtitle text-muted">Data will appear after the next scheduled cron cycle.</p>
                    <div class="empty-action">
                        <button class="btn btn-primary" onClick=${() => load()}>
                            <i class="ti ti-refresh me-1"></i> Try again
                        </button>
                    </div>
                </div>
            `}
        </div>
    `;
}

