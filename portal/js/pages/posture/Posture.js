import { api } from '@api';
import { logger } from '@config';
import { orgContext } from '@orgContext';

const { html, Component } = window;

/**
 * Posture Snapshot (PostureEngine) - deterministic, on-demand posture view.
 * Fetches the latest snapshot for the selected org; if missing, generates one immediately.
 * 
 * Note: If PostureEngine endpoint is not available (404), this page will redirect to
 * the legacy Security Dashboard page.
 */
export class PosturePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            refreshing: false,
            error: null,
            snapshot: null,
            triggeredGeneration: false,
            period: 'daily',
            isRefreshingInBackground: false
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadSnapshot());
        this.loadSnapshot();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
    }

    getCachedSnapshot(key, ttlMinutes = 30) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const TTL_MS = ttlMinutes * 60 * 1000;
            const isStale = ageMs >= TTL_MS;

            if (isStale) {
                console.log(`[Posture] 📦 Cache HIT (STALE): ${key} (age: ${Math.round(ageMs / 1000)}s, ttl: ${ttlMinutes}m)`);
            } else {
                console.log(`[Posture] 📦 Cache HIT (FRESH): ${key} (age: ${Math.round(ageMs / 1000)}s)`);
            }
            return { data, isStale };
        } catch (err) {
            console.warn('[Posture] Cache read error:', err);
        }
        return null;
    }

    setCachedSnapshot(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
            console.log(`[Posture] 💾 Cache SAVE: ${key}`);
        } catch (err) {
            console.warn('[Posture] Cache write error:', err);
        }
    }

    async loadSnapshot(force = false) {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ error: 'No organization selected', loading: false, refreshing: false });
            return;
        }

        const period = this.state?.period || 'daily';
        const cacheKey = `posture_${currentOrg.orgId}_${period}`;

        // Step 1: Try cache first (even if stale)
        if (!force) {
            const cached = this.getCachedSnapshot(cacheKey, 30);
            if (cached) {
                console.log('[Posture] ⚡ Loading from cache immediately (will refresh in background)...');
                this.setState({ 
                    snapshot: cached.data,
                    loading: false, 
                    isRefreshingInBackground: true 
                });
                // Continue to background refresh
                this.loadFreshSnapshot(cacheKey, period);
                return;
            }
        }

        // Step 2: Show loading state if no cache
        this.setState({
            loading: !this.state.snapshot || force,
            refreshing: force,
            error: null
        });

        // Step 3: Fetch fresh data
        try {
            const res = await api.getPostureSnapshot(currentOrg.orgId, { period, force });
            const payload = res?.data || res;
            const snapshot = payload?.snapshot || payload?.data?.snapshot || null;
            const triggeredGeneration = payload?.triggeredGeneration ?? payload?.data?.triggeredGeneration ?? force;

            if (!snapshot) {
                throw new Error('Snapshot unavailable');
            }

            // Cache the response
            this.setCachedSnapshot(cacheKey, snapshot);

            this.setState({
                snapshot,
                triggeredGeneration,
                loading: false,
                refreshing: false,
                isRefreshingInBackground: false
            });
        } catch (err) {
            logger.error('[Posture] Failed to load snapshot:', err);
            const is404 = err?.message?.includes('404');
            const errorMsg = is404
                ? 'Posture Snapshot API is being deployed. Please check back in a few minutes.'
                : (err?.message || 'Failed to load posture snapshot');

            this.setState({
                error: errorMsg,
                loading: false,
                refreshing: false,
                isRefreshingInBackground: false
            });
        }
    }

    async loadFreshSnapshot(cacheKey, period) {
        try {
            console.log('[Posture] 🔄 Background refresh starting...');
            
            // Wait for UI to settle
            await new Promise(resolve => setTimeout(resolve, 500));

            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) return;

            const res = await api.getPostureSnapshot(currentOrg.orgId, { period, force: false });
            const payload = res?.data || res;
            const snapshot = payload?.snapshot || payload?.data?.snapshot || null;

            if (snapshot) {
                // Cache the fresh data
                this.setCachedSnapshot(cacheKey, snapshot);

                // Silent update
                this.setState(prev => ({
                    snapshot,
                    isRefreshingInBackground: false
                }));

                console.log('[Posture] ✅ Background refresh complete');
            }
        } catch (err) {
            console.warn('[Posture] Background refresh failed:', err);
            this.setState({ isRefreshingInBackground: false });
        }
    }

    setPeriod(period) {
        this.setState({ period }, () => this.loadSnapshot(true));
    }

    renderTrendHighlights() {
        const history = this.state.snapshot?.risk?.history || [];
        if (!history.length) return null;
        const last = history.slice(-1)[0];
        const first = history[0];
        const delta = (last?.score ?? 0) - (first?.score ?? 0);
        const trendLabel = delta > 0 ? `Improved by ${delta.toFixed(1)} pts` : delta < 0 ? `Declined by ${Math.abs(delta).toFixed(1)} pts` : 'No change';
        const trendClass = delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted';

        return html`
            <div class="card shadow-sm mt-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <div class="card-title mb-0">Trends</div>
                        <div class="text-muted small">Risk score progression</div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-center gap-3">
                        <div class="display-6 mb-0 ${trendClass}">${trendLabel}</div>
                        <div class="text-muted small">First: ${first?.score ?? 'n/a'} → Latest: ${last?.score ?? 'n/a'}</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderActionHighlights() {
        const actions = this.state.snapshot?.actions?.prioritized || [];
        if (!actions.length) return null;
        const top = actions.slice(0, 3);
        return html`
            <div class="card shadow-sm mt-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <div class="card-title mb-0">Action Highlights</div>
                        <div class="text-muted small">Top 3 recommended actions</div>
                    </div>
                </div>
                <div class="card-body d-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
                    ${top.map(action => html`
                        <div class="p-3 rounded border bg-light">
                            <div class="fw-semibold">${action.title}</div>
                            <div class="text-muted small mb-1">Priority ${action.priority} · Effort ${action.effort}</div>
                            <div class="badge bg-primary-subtle text-primary">${action.affectedCount} affected</div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    getSeverityCounts() {
        const severities = this.state.snapshot?.findings?.bySeverity || {};
        return {
            critical: severities.Critical || severities.critical || 0,
            high: severities.High || severities.high || 0,
            medium: severities.Medium || severities.medium || 0,
            low: severities.Low || severities.low || 0,
        };
    }

    renderSeverityPills() {
        const { critical, high, medium, low } = this.getSeverityCounts();
        return html`
            <div class="d-flex gap-2 flex-wrap">
                <span class="badge bg-light border border-danger text-danger">Critical: ${critical}</span>
                <span class="badge bg-light border border-warning text-warning">High: ${high}</span>
                <span class="badge bg-light border border-info text-info">Medium: ${medium}</span>
                <span class="badge bg-light border text-muted">Low: ${low}</span>
            </div>
        `;
    }

    renderDomainBreakdown() {
        const domains = this.state.snapshot?.findings?.byDomain || {};
        const entries = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!entries.length) return html`<div class="text-muted">No domain findings available.</div>`;

        return html`
            <div class="d-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
                ${entries.map(([domain, count]) => html`
                    <div class="p-3 rounded border bg-light">
                        <div class="text-uppercase small text-muted">${domain}</div>
                        <div class="fw-bold fs-5">${count}</div>
                    </div>
                `)}
            </div>
        `;
    }

    renderActions() {
        const actions = this.state.snapshot?.actions?.prioritized || [];
        if (!actions.length) {
            return html`<div class="text-muted">No prioritized actions yet.</div>`;
        }

        return html`
            <div class="list-group list-group-flush">
                ${actions.slice(0, 6).map((action) => html`
                    <div class="list-group-item d-flex flex-column flex-lg-row align-items-start align-items-lg-center gap-2">
                        <div class="flex-grow-1">
                            <div class="fw-semibold">${action.title}</div>
                            <div class="text-muted small">Priority: ${action.priority} · Effort: ${action.effort} · Risk Reduction: ${action.riskReduction}</div>
                        </div>
                        <div class="d-flex gap-2">
                            <span class="badge bg-light border border-primary text-primary">${action.affectedCount} affected</span>
                            <span class="badge bg-outline-secondary border">SLA: ${action.sla}</span>
                        </div>
                    </div>
                `)}
            </div>
        `;
    }

    renderFindingsTable() {
        const findings = this.state.snapshot?.findings?.top10 || [];
        if (!findings.length) {
            return html`<div class="text-muted">No findings available.</div>`;
        }

        return html`
            <div class="table-responsive">
                <table class="table align-middle mb-0 table-hover">
                    <thead>
                        <tr>
                            <th scope="col">Finding</th>
                            <th scope="col">Domain</th>
                            <th scope="col">Severity</th>
                            <th scope="col">Affected Devices</th>
                            <th scope="col">Applications</th>
                            <th scope="col">Count</th>
                            <th scope="col">Aging (days)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${findings.map(item => html`
                            <tr>
                                <td class="fw-semibold">${item.title}</td>
                                <td><span class="badge bg-secondary">${item.domain}</span></td>
                                <td><span class="badge ${this.severityToColor(item.severity)}">${item.severity}</span></td>
                                <td>
                                    ${item.affectedDevices && item.affectedDevices.length > 0
                                        ? html`
                                            <div class="d-flex flex-wrap gap-1">
                                                ${item.affectedDevices.slice(0, 2).map(deviceName => html`
                                                    <span class="badge bg-light text-dark border border-1">${deviceName}</span>
                                                `)}
                                                ${item.affectedDevices.length > 2 ? html`<span class="text-muted small">+${item.affectedDevices.length - 2} more</span>` : ''}
                                            </div>
                                        `
                                        : html`<span class="text-muted">N/A</span>`
                                    }
                                </td>
                                <td>
                                    ${item.affectedApplications && item.affectedApplications.length > 0
                                        ? html`
                                            <div class="d-flex flex-wrap gap-1">
                                                ${item.affectedApplications.slice(0, 2).map(app => html`
                                                    <span class="badge bg-info-lt text-info">${app}</span>
                                                `)}
                                                ${item.affectedApplications.length > 2 ? html`<span class="text-muted small">+${item.affectedApplications.length - 2}</span>` : ''}
                                            </div>
                                        `
                                        : html`<span class="text-muted">N/A</span>`
                                    }
                                </td>
                                <td>${item.affectedCount}</td>
                                <td>${item.agingDays}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }

    severityToColor(severity) {
        const s = (severity || '').toLowerCase();
        if (s === 'critical') return 'bg-light border border-danger text-danger';
        if (s === 'high') return 'bg-light border border-warning text-warning';
        if (s === 'medium') return 'bg-light border border-info text-info';
        return 'bg-light border text-muted';
    }

    renderCompliance() {
        const compliance = this.state.snapshot?.compliance;
        if (!compliance) return html`<div class="text-muted">No compliance data.</div>`;

        const controls = Object.entries(compliance.controls || {}).slice(0, 5);
        return html`
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <div class="display-6 mb-0">${compliance.score ?? 0}</div>
                <div class="text-muted">Compliance score</div>
            </div>
            <div class="list-group list-group-flush">
                ${controls.map(([control, status]) => html`
                    <div class="list-group-item d-flex justify-content-between align-items-start">
                        <div>
                            <div class="fw-semibold">${control}</div>
                            <div class="text-muted small">${status.description || 'No description'}</div>
                        </div>
                        <span class="badge ${this.controlColor(status.status)}">${status.status}</span>
                    </div>
                `)}
            </div>
        `;
    }

    controlColor(status) {
        const s = (status || '').toLowerCase();
        if (s === 'compliant') return 'bg-light border border-success text-success';
        if (s === 'noncompliant') return 'bg-light border border-danger text-danger';
        return 'bg-light border text-muted';
    }

    renderMetadata() {
        const meta = this.state.snapshot?.metadata;
        if (!meta) return null;
        const warnings = meta.warnings || [];
        return html`
            <div class="d-flex flex-wrap gap-3 text-muted small">
                <div>Generated by: ${meta.generatedBy || 'PostureEngine'}</div>
                <div>Version: ${meta.generatorVersion || '1.0'}</div>
                <div>Data coverage: ${meta.dataQuality?.deviceCoverage ?? 'n/a'}%</div>
                ${warnings.length ? html`<div class="text-danger">Warnings: ${warnings.join('; ')}</div>` : null}
            </div>
        `;
    }

    renderHero() {
        const risk = this.state.snapshot?.risk || {};
        const severity = this.getSeverityCounts();

        const trendDelta = risk.scoreDelta ?? 0;
        const trendLabel = trendDelta > 0 ? `▲ ${trendDelta}` : trendDelta < 0 ? `▼ ${Math.abs(trendDelta)}` : '—';
        const trendClass = trendDelta > 0 ? 'text-success' : trendDelta < 0 ? 'text-danger' : 'text-light';

        return html`
            <div class="card shadow-sm border-0 mb-4" style="background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%); color: #fff;">
                <div class="card-body d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-3">
                    <div>
                        <div class="text-uppercase small opacity-75">Security Posture</div>
                        <div class="display-4 fw-bold mb-0">${risk.orgScore ?? 0}</div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-light text-dark">Grade: ${risk.grade || 'N/A'}</span>
                            <span class="badge bg-outline-light border ${trendClass}">Trend ${trendLabel}</span>
                        </div>
                        <div class="mt-3">Findings: ${severity.critical + severity.high + severity.medium + severity.low}</div>
                    </div>
                    <div class="d-flex flex-column gap-2">
                        <div class="btn-group" role="group">
                            <button class="btn btn-light" disabled=${this.state.refreshing} onClick=${() => this.loadSnapshot(true)}>
                                ${this.state.refreshing ? 'Refreshing...' : 'Regenerate'}
                            </button>
                            <button class="btn btn-outline-light ${this.state.period === 'daily' ? 'active' : ''}" onClick=${() => this.setPeriod('daily')}>Daily</button>
                            <button class="btn btn-outline-light ${this.state.period === 'weekly' ? 'active' : ''}" onClick=${() => this.setPeriod('weekly')}>Weekly</button>
                        </div>
                        ${this.state.triggeredGeneration ? html`<span class="small">Generated just now for this view.</span>` : null}
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        if (this.state.loading) {
            return html`
                <div class="d-flex justify-content-center align-items-center" style="min-height: 50vh;">
                    <div class="spinner-border text-primary" role="status"></div>
                </div>
            `;
        }

        if (this.state.error) {
            const is404 = this.state.error.includes('being deployed');
            
            return html`
                <div class="container py-4">
                    <div class="alert ${is404 ? 'alert-info' : 'alert-danger'}">
                        ${is404 ? html`
                            <div class="d-flex align-items-center">
                                <div class="spinner-border spinner-border-sm me-3" role="status"></div>
                                <div>
                                    <strong>Deployment in Progress</strong>
                                    <div class="mt-1">${this.state.error}</div>
                                    <div class="mt-2 small">
                                        In the meantime, you can view 
                                        <a href="#!/posture-ai" class="alert-link">AI Posture Reports</a>
                                    </div>
                                </div>
                            </div>
                        ` : this.state.error}
                    </div>
                    ${!is404 ? html`
                        <button class="btn btn-primary" onClick=${() => this.loadSnapshot()}>Retry</button>
                    ` : html`
                        <button class="btn btn-primary" onClick=${() => this.loadSnapshot()}>Check Again</button>
                    `}
                </div>
            `;
        }

        if (!this.state.snapshot) {
            return html`
                <div class="container py-4">
                    <div class="alert alert-warning">No snapshot available.</div>
                    <button class="btn btn-primary" onClick=${() => this.loadSnapshot(true)}>Generate now</button>
                </div>
            `;
        }

        const generatedAt = this.state.snapshot.timestamp ? new Date(this.state.snapshot.timestamp).toLocaleString() : 'Unknown';

        return html`
            <div class="page-header d-print-none mb-3">
                <div class="container">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>
                                    Security Posture
                                </h2>
                                ${this.state.isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle">
                                <span class="text-muted">Generated: ${generatedAt}</span>
                            </div>
                        </div>
                        <div class="col-auto ms-auto">
                            <button 
                                class="btn btn-icon" 
                                onClick=${() => this.loadSnapshot(true)}
                                title="Refresh snapshot"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="container py-4">

                ${this.renderHero()}

                <div class="row g-4">
                    <div class="col-lg-6">
                        <div class="card h-100 shadow-sm">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <div>
                                    <div class="card-title mb-0">Severity Mix</div>
                                    <div class="text-muted small">Counts by severity</div>
                                </div>
                            </div>
                            <div class="card-body">
                                ${this.renderSeverityPills()}
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card h-100 shadow-sm">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <div>
                                    <div class="card-title mb-0">Domain Breakdown</div>
                                    <div class="text-muted small">Top 5 domains by findings</div>
                                </div>
                            </div>
                            <div class="card-body">
                                ${this.renderDomainBreakdown()}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row g-4 mt-1">
                    <div class="col-lg-6">
                        <div class="card h-100 shadow-sm">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <div>
                                    <div class="card-title mb-0">Prioritized Actions</div>
                                    <div class="text-muted small">Top recommendations</div>
                                </div>
                            </div>
                            <div class="card-body">
                                ${this.renderActions()}
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card h-100 shadow-sm">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <div>
                                    <div class="card-title mb-0">Compliance</div>
                                    <div class="text-muted small">Control status snapshot</div>
                                </div>
                            </div>
                            <div class="card-body">
                                ${this.renderCompliance()}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card shadow-sm mt-4">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <div>
                            <div class="card-title mb-0">Top Findings</div>
                            <div class="text-muted small">Focus on what matters most</div>
                        </div>
                    </div>
                    <div class="card-body">
                        ${this.renderFindingsTable()}
                    </div>
                </div>

                <div class="card shadow-sm mt-4">
                    <div class="card-header">
                        <div class="card-title mb-0">Metadata</div>
                    </div>
                    <div class="card-body">
                        ${this.renderMetadata()}
                    </div>
                </div>
            </div>
        `;
    }
}
