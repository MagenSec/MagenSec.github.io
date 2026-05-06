import { api } from '@api';
import { logger } from '@config';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { EvidenceBanner } from '../../components/shared/EvidenceBanner.js';
import { TrendSnapshotStrip, getTrendDateRange as getSharedTrendDateRange } from '../../components/TrendSnapshotStrip.js';

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
            evidence: null,
            trendSnapshots: [],
            triggeredGeneration: false,
            freshness: null,
            period: 'daily',
            isRefreshingInBackground: false,
            frameworkView: 'cis', // 'cis', 'nist', or 'both'
            nistGaps: null,
            nistGapsLoading: false
        };
        this.orgUnsubscribe = null;
        this._rewindUnsub = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadSnapshot());
        this._rewindUnsub = rewindContext.onChange(() => this.loadSnapshot());
        this.loadSnapshot();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this._rewindUnsub) this._rewindUnsub();
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

    extractNistGaps(snapshot) {
        const gaps = snapshot?.nistComplianceGaps || snapshot?.NistComplianceGaps || null;
        return Array.isArray(gaps) ? gaps : null;
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
                    evidence: null,
                    nistGaps: this.extractNistGaps(cached.data),
                    nistGapsLoading: false,
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

        // Step 3: Fetch fresh data via the unified page-bundle endpoint.
        // 'posture' bundle includes org-snapshot (the posture snapshot), security/compliance
        // snapshots, and daily/weekly trend atoms.
        try {
            const res = await api.getPageBundle(currentOrg.orgId, 'posture', force ? { refresh: true } : {});
            const atoms = res?.data?.atoms || {};
            const evidence = res?.data?.evidence || res?.data?.Evidence || null;
            const snapshot = atoms['org-snapshot']?.data?.[0] || null;
            const triggeredGeneration = !!force;
            const freshness = res?.data?.freshness || res?.freshness || null;

            if (!snapshot) {
                const error = new Error('Dossier unavailable');
                error.evidence = evidence;
                throw error;
            }

            // Cache the response
            this.setCachedSnapshot(cacheKey, snapshot);
            const trendSnapshots = await this.loadTrendSnapshots(currentOrg.orgId);

            this.setState({
                snapshot,
                evidence,
                trendSnapshots,
                triggeredGeneration,
                freshness,
                nistGaps: this.extractNistGaps(snapshot),
                nistGapsLoading: false,
                loading: false,
                refreshing: false,
                isRefreshingInBackground: false
            });
        } catch (err) {
            logger.error('[Posture] Failed to load snapshot:', err);
            const is404 = err?.message?.includes('404');
            const errorMsg = is404
                ? 'Posture dossier API is being deployed. Please check back in a few minutes.'
                : (err?.message || 'Failed to load posture dossier');

            this.setState({
                error: errorMsg,
                evidence: err?.evidence || this.state.evidence,
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

            const res = await api.getPageBundle(currentOrg.orgId, 'posture');
            const atoms = res?.data?.atoms || {};
            const evidence = res?.data?.evidence || res?.data?.Evidence || null;
            const snapshot = atoms['org-snapshot']?.data?.[0] || null;
            const freshness = res?.data?.freshness || res?.freshness || null;

            if (snapshot) {
                // Cache the fresh data
                this.setCachedSnapshot(cacheKey, snapshot);
                const trendSnapshots = await this.loadTrendSnapshots(currentOrg.orgId);

                // Silent update
                this.setState(prev => ({
                    snapshot,
                    evidence,
                    trendSnapshots,
                    freshness,
                    nistGaps: this.extractNistGaps(snapshot),
                    nistGapsLoading: false,
                    isRefreshingInBackground: false
                }));

                console.log('[Posture] ✅ Background refresh complete');
            }
        } catch (err) {
            console.warn('[Posture] Background refresh failed:', err);
            this.setState({ isRefreshingInBackground: false });
        }
    }

    getTrendDateRange(days = 30) {
        return getSharedTrendDateRange(days);
    }

    async loadTrendSnapshots(orgId) {
        try {
            const range = this.getTrendDateRange(30);
            const res = await api.getTrendSnapshots(orgId, range);
            const payload = res?.data || res;
            const trends = Array.isArray(payload) ? payload : (payload?.data || payload?.snapshots || []);
            return Array.isArray(trends) ? trends : [];
        } catch (err) {
            console.warn('[Posture] Failed to load trend snapshots:', err);
            return [];
        }
    }

    getLatestReliableMlTrend() {
        const trendSnapshots = this.state?.trendSnapshots || [];
        if (!trendSnapshots.length) return null;
        const latest = trendSnapshots[trendSnapshots.length - 1];
        if (!latest?.ml || latest.ml.isReliable !== true) return null;
        return latest.ml;
    }

    renderMlTrendBadges() {
        const ml = this.getLatestReliableMlTrend();
        if (!ml) return null;

        const confidencePct = Math.round((ml.confidence || 0) * 100);
        const forecastNext = Number.isFinite(ml.forecastNext) ? Math.round(ml.forecastNext) : null;

        return html`
            <div class="d-flex flex-wrap gap-2 mt-2">
                ${ml.isAnomaly ? html`<span class="badge bg-danger text-white">Anomaly detected</span>` : ''}
                ${forecastNext !== null ? html`<span class="badge bg-primary text-white">Next risk: ${forecastNext}</span>` : ''}
                <span class="badge bg-secondary text-white">Confidence ${confidencePct}%</span>
            </div>
        `;
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
                    ${this.renderMlTrendBadges()}
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
        return 'bg-light border border-secondary text-secondary';
    }

    getGapsByFunction(gaps) {
        if (!gaps || !Array.isArray(gaps)) return {};
        
        const grouped = {
            'IDENTIFY': [],
            'PROTECT': [],
            'DETECT': [],
            'RESPOND': [],
            'RECOVER': [],
            'GOVERN': []
        };

        gaps.forEach(gap => {
            const category = gap.category?.toUpperCase() || 'UNKNOWN';
            if (grouped[category]) {
                grouped[category].push(gap);
            }
        });

        // Sort each function's gaps by priority descending
        Object.keys(grouped).forEach(fn => {
            grouped[fn].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        });

        return grouped;
    }

    priorityToColor(priority) {
        if (priority >= 80) return 'bg-light border border-danger text-danger'; // P1
        if (priority >= 60) return 'bg-light border border-warning text-warning'; // P2
        if (priority >= 40) return 'bg-light border border-info text-info'; // P3
        return 'bg-light border text-muted'; // P4
    }

    priorityToLabel(priority) {
        if (priority >= 80) return 'P1: Critical';
        if (priority >= 60) return 'P2: High';
        if (priority >= 40) return 'P3: Medium';
        return 'P4: Low';
    }

    renderNistComplianceGaps() {
        const gaps = this.state.nistGaps;
        if (!Array.isArray(gaps)) {
            return html`<div class="text-muted text-center py-4">NIST gap analysis data is not available in the current dossier.</div>`;
        }

        if (gaps.length === 0) {
            return html`<div class="text-muted text-center py-4">No NIST gaps detected. Great job!</div>`;
        }

        const grouped = this.getGapsByFunction(gaps);
        const functionOrder = ['IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER', 'GOVERN'];
        const functionIcons = {
            'IDENTIFY': '🔍',
            'PROTECT': '🛡️',
            'DETECT': '👁️',
            'RESPOND': '⚡',
            'RECOVER': '♻️',
            'GOVERN': '⚙️'
        };

        const summary = {
            p1: gaps.filter(g => g.priority >= 80).length,
            p2: gaps.filter(g => g.priority >= 60 && g.priority < 80).length,
            p3: gaps.filter(g => g.priority >= 40 && g.priority < 60).length,
            p4: gaps.filter(g => g.priority < 40).length
        };

        return html`
            <div>
                <!-- NIST Gap Summary Badges -->
                <div class="d-flex gap-2 mb-3 flex-wrap">
                    <span class="badge bg-light border border-danger text-danger">P1: ${summary.p1}</span>
                    <span class="badge bg-light border border-warning text-warning">P2: ${summary.p2}</span>
                    <span class="badge bg-light border border-info text-info">P3: ${summary.p3}</span>
                    <span class="badge bg-light border text-muted">P4: ${summary.p4}</span>
                </div>

                <!-- NIST Gaps by Function -->
                <div class="list-group">
                    ${functionOrder.map(fn => {
                        const fnGaps = grouped[fn] || [];
                        if (fnGaps.length === 0) return '';
                        
                        return html`
                            <div class="list-group-item bg-light">
                                <div class="d-flex align-items-center gap-2 mb-2">
                                    <span style="font-size: 1.2em;">${functionIcons[fn]}</span>
                                    <div class="fw-semibold">${fn}</div>
                                    <span class="badge bg-secondary">${fnGaps.length} gaps</span>
                                </div>

                                <div class="list-group" style="margin-left: 20px;">
                                    ${fnGaps.slice(0, 3).map(gap => html`
                                        <div class="list-group-item p-2 mb-1">
                                            <div class="d-flex justify-content-between align-items-start">
                                                <div>
                                                    <div class="fw-semibold">${gap.subcategoryId}: ${gap.subcategoryTitle}</div>
                                                    <div class="text-muted small">${gap.description}</div>
                                                </div>
                                                <span class="badge ${this.priorityToColor(gap.priority)}">${this.priorityToLabel(gap.priority)}</span>
                                            </div>
                                            <div class="text-muted small mt-2">
                                                ${gap.estimatedEffort && html`<span>Effort: ${gap.estimatedEffort}</span>`}
                                                ${gap.affectedAssets && html`<span> · Affects ${gap.affectedAssets} asset(s)</span>`}
                                            </div>
                                        </div>
                                    `)}
                                    ${fnGaps.length > 3 ? html`
                                        <div class="text-muted small p-2">+${fnGaps.length - 3} more gaps</div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
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
        const actions = this.state.snapshot?.actions?.prioritized || [];

        const trendDelta = risk.scoreDelta ?? 0;
        const trendLabel = trendDelta > 0 ? `▲ ${trendDelta}` : trendDelta < 0 ? `▼ ${Math.abs(trendDelta)}` : '—';
        const trendClass = trendDelta > 0 ? 'text-success' : trendDelta < 0 ? 'text-danger' : 'text-light';

        // Hygiene Score = orgScore (0-100, higher = better)
        const hygieneScore = risk.orgScore ?? 0;
        const hygieneColor = hygieneScore >= 75 ? 'success' : hygieneScore >= 50 ? 'warning' : 'danger';

        // Top 2 priority actions
        const topActions = actions.slice(0, 2);

        return html`
            <!-- Hygiene Score Hero -->
            <div class="card shadow-sm border-0 mb-4" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff;">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-lg-4 text-center text-lg-start mb-3 mb-lg-0">
                            <div class="text-uppercase small opacity-75 mb-1">Hygiene Score</div>
                            <div class="display-3 fw-bold mb-0">${hygieneScore}</div>
                            <div class="d-flex align-items-center gap-2 mt-1 justify-content-center justify-content-lg-start">
                                <span class="badge bg-light text-dark">Grade ${risk.grade || 'N/A'}</span>
                                <span class="badge bg-outline-light border ${trendClass}">
                                    ${trendLabel} week-over-week
                                </span>
                            </div>
                        </div>
                        <div class="col-lg-5">
                            ${topActions.length > 0 ? html`
                                <div class="text-uppercase small opacity-75 mb-2">Top Priority Actions</div>
                                ${topActions.map((action, i) => html`
                                    <div class="d-flex align-items-start gap-2 mb-2">
                                        <span class="badge bg-light text-dark rounded-circle" style="width:24px;height:24px;line-height:24px;padding:0;text-align:center;">${i + 1}</span>
                                        <div>
                                            <div class="fw-semibold">${action.title}</div>
                                            <div class="small opacity-75">${action.affectedCount} affected · ${action.effort} effort</div>
                                        </div>
                                    </div>
                                `)}
                            ` : html`
                                <div class="text-center opacity-75 py-3">
                                    <div class="fw-semibold">All clear</div>
                                    <div class="small">No priority actions needed</div>
                                </div>
                            `}
                        </div>
                        <div class="col-lg-3 text-center text-lg-end">
                            <div class="d-flex flex-column gap-2">
                                <div class="btn-group" role="group">
                                    <button class="btn btn-light btn-sm" disabled=${this.state.refreshing} onClick=${() => this.loadSnapshot(true)}>
                                        ${this.state.refreshing ? 'Refreshing…' : 'Regenerate'}
                                    </button>
                                </div>
                                <div class="btn-group" role="group">
                                    <button class="btn btn-sm ${this.state.period === 'daily' ? 'btn-light' : 'btn-outline-light'}" onClick=${() => this.setPeriod('daily')}>Daily</button>
                                    <button class="btn btn-sm ${this.state.period === 'weekly' ? 'btn-light' : 'btn-outline-light'}" onClick=${() => this.setPeriod('weekly')}>Weekly</button>
                                </div>
                                ${this.state.triggeredGeneration ? html`<span class="small opacity-75">Generated just now</span>` : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Fleet Summary Strip -->
            <div class="row row-cards mb-3">
                <div class="col-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <span class="bg-danger text-white avatar rounded me-3">${severity.critical}</span>
                                <div><div class="fw-bold">Critical</div><div class="text-muted small">findings</div></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <span class="bg-warning text-white avatar rounded me-3">${severity.high}</span>
                                <div><div class="fw-bold">High</div><div class="text-muted small">findings</div></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <span class="bg-info text-white avatar rounded me-3">${severity.medium}</span>
                                <div><div class="fw-bold">Medium</div><div class="text-muted small">findings</div></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <span class="bg-secondary text-white avatar rounded me-3">${severity.low}</span>
                                <div><div class="fw-bold">Low</div><div class="text-muted small">findings</div></div>
                            </div>
                        </div>
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
                    <${EvidenceBanner} evidence=${this.state.evidence} pageName="posture" />
                    <div class="alert ${is404 ? 'alert-info' : 'alert-danger'}">
                        ${is404 ? html`
                            <div class="d-flex align-items-center">
                                <div class="spinner-border spinner-border-sm me-3" role="status"></div>
                                <div>
                                    <strong>Deployment in Progress</strong>
                                    <div class="mt-1">${this.state.error}</div>
                                    <div class="mt-2 small">
                                        In the meantime, you can view 
                                        <a href="#!/mission-brief" class="alert-link">Mission Briefing Reports</a>
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
                    <${EvidenceBanner} evidence=${this.state.evidence} pageName="posture" />
                    <div class="alert alert-warning">No dossier available.</div>
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
                                    Protection Overview
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
                                ${this.state.freshness?.degraded ? html`
                                    <span class="badge bg-warning text-white ms-2">
                                        Degraded dossier
                                    </span>
                                ` : null}
                            </div>
                        </div>
                        <div class="col-auto ms-auto">
                            <button 
                                class="btn btn-icon" 
                                onClick=${() => this.loadSnapshot(true)}
                                title="Refresh dossier"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="container">
                <${EvidenceBanner} evidence=${this.state.evidence} pageName="posture" />
            </div>

            <div class="page-header d-print-none mb-3" style="margin-top: 20px;">
                <div class="container">
                    <div class="row align-items-center">
                        <div class="col">
                            <h3 class="page-title mb-0">Compliance Frameworks</h3>
                        </div>
                        <div class="col-auto">
                            <div class="btn-group" role="group">
                                <button 
                                    type="button" 
                                    class="btn btn-sm ${this.state.frameworkView === 'cis' ? 'btn-primary' : 'btn-outline-primary'}"
                                    onClick=${() => this.setState({ frameworkView: 'cis' })}
                                >
                                    CIS Controls
                                </button>
                                <button 
                                    type="button" 
                                    class="btn btn-sm ${this.state.frameworkView === 'nist' ? 'btn-primary' : 'btn-outline-primary'}"
                                    onClick=${() => this.setState({ frameworkView: 'nist' })}
                                >
                                    NIST CSF
                                </button>
                                <button 
                                    type="button" 
                                    class="btn btn-sm ${this.state.frameworkView === 'both' ? 'btn-primary' : 'btn-outline-primary'}"
                                    onClick=${() => this.setState({ frameworkView: 'both' })}
                                >
                                    Compare All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="container py-4">

                ${this.renderHero()}

                <${TrendSnapshotStrip}
                    trends=${this.state.trendSnapshots}
                    context="posture"
                    title="Posture Trend"
                    subtitle="Risk, compliance, and remediation movement from daily dossiers"
                />

                <div class="row g-4">
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
                                    <div class="text-muted small">Control status dossier</div>
                                </div>
                            </div>
                            <div class="card-body">
                                ${this.renderCompliance()}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Collapsed drill-down sections -->
                <div class="accordion mt-4" id="postureAccordion">
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#postureAllRisks" aria-expanded="false">
                                All Risks — Domain Breakdown
                            </button>
                        </h2>
                        <div id="postureAllRisks" class="accordion-collapse collapse" data-bs-parent="#postureAccordion">
                            <div class="accordion-body">
                                ${this.renderDomainBreakdown()}
                            </div>
                        </div>
                    </div>
                    <div class="accordion-item">
                        <h2 class="accordion-header">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#postureTopFindings" aria-expanded="false">
                                Top Findings
                            </button>
                        </h2>
                        <div id="postureTopFindings" class="accordion-collapse collapse" data-bs-parent="#postureAccordion">
                            <div class="accordion-body">
                                ${this.renderFindingsTable()}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Compliance Framework Cards -->
                ${(this.state.frameworkView === 'cis' || this.state.frameworkView === 'both') ? html`
                    <div class="card shadow-sm mt-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <div>
                                <div class="card-title mb-0">CIS Controls v8 Compliance Gaps</div>
                                <div class="text-muted small">Control deficiencies by priority</div>
                            </div>
                        </div>
                        <div class="card-body">
                            ${this.state.snapshot?.cisComplianceGaps && Array.isArray(this.state.snapshot.cisComplianceGaps)
                                ? this.state.snapshot.cisComplianceGaps.length > 0
                                    ? html`<div class="text-muted">CIS gaps: ${this.state.snapshot.cisComplianceGaps.length} detected</div>`
                                    : html`<div class="text-muted text-center py-4">No CIS gaps detected. Excellent!</div>`
                                : html`<div class="text-muted text-center py-4">CIS gap analysis data not available.</div>`
                            }
                        </div>
                    </div>
                ` : ''}

                ${(this.state.frameworkView === 'nist' || this.state.frameworkView === 'both') ? html`
                    <div class="card shadow-sm mt-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <div>
                                <div class="card-title mb-0">NIST CSF 2.0 Compliance Gaps</div>
                                <div class="text-muted small">6 functions across 21 subcategories</div>
                            </div>
                            ${this.state.nistGapsLoading ? html`
                                <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                    <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                    Loading...
                                </span>
                            ` : ''}
                        </div>
                        <div class="card-body">
                            ${this.renderNistComplianceGaps()}
                        </div>
                    </div>
                ` : ''}

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
