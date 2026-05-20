import { api } from '@api';
import { logger } from '@config';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { EvidenceBanner, TimeWarpEvidenceCallout } from '../../components/shared/EvidenceBanner.js';
import { TrendSnapshotStrip, getTrendDateRange as getSharedTrendDateRange } from '../../components/TrendSnapshotStrip.js';
import { TrackingTimeline } from '../../components/v7/TrackingTimeline.js';

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

    getSurfaceCopy() {
        const mode = this.props?.mode === 'proof' || window.location.hash.startsWith('#!/proof') ? 'proof' : 'posture';
        if (mode === 'proof') {
            return {
                mode,
                pageName: 'proof',
                calloutSurface: 'captured report evidence',
                eyebrow: 'Captured evidence',
                title: 'Daily Report Evidence',
                subtitlePrefix: 'Evidence captured',
                empty: 'No captured report evidence is available yet.',
                prepare: 'Prepare Daily Report',
                trendTitle: 'Daily Report Trend',
                trendSubtitle: 'Trust, risk, and remediation movement from captured daily evidence'
            };
        }

        return {
            mode,
            pageName: 'posture',
            calloutSurface: 'posture evidence',
            eyebrow: 'Posture analysis',
            title: 'Security Posture Analysis',
            subtitlePrefix: 'Evidence prepared',
            empty: 'No posture evidence is available yet.',
            prepare: 'Prepare Evidence',
            trendTitle: 'Posture Trend',
            trendSubtitle: 'Risk, compliance, and remediation movement from daily reports'
        };
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

    readAtomRows(atoms, atomName) {
        const atom = atoms?.[atomName] || null;
        const rows = atom?.data || atom?.Data || [];
        return Array.isArray(rows) ? rows : [];
    }

    readNumber(source, names, fallback = 0) {
        for (const name of names) {
            const value = source?.[name];
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return fallback;
    }

    gradeForScore(score) {
        if (score >= 90) return 'A';
        if (score >= 75) return 'B';
        if (score >= 60) return 'C';
        if (score >= 40) return 'D';
        return 'F';
    }

    toIsoFromDateKey(value) {
        const text = String(value || '').trim();
        if (/^\d{8}$/.test(text)) {
            return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00Z`;
        }
        return text || new Date().toISOString();
    }

    buildTrendFallbackSnapshot(atoms, freshness) {
        const dailyTrends = this.readAtomRows(atoms, 'org-trends-daily');
        const weeklyTrends = this.readAtomRows(atoms, 'org-trends-weekly');
        const trends = dailyTrends.length ? dailyTrends : weeklyTrends;
        if (!trends.length) return null;

        const latest = trends[trends.length - 1] || {};
        const first = trends[0] || latest;
        const latestScore = this.readNumber(latest, ['hygieneScore', 'HygieneScore', 'securityScore', 'SecurityScore', 'riskPostureScore', 'RiskPostureScore']);
        const firstScore = this.readNumber(first, ['hygieneScore', 'HygieneScore', 'securityScore', 'SecurityScore', 'riskPostureScore', 'RiskPostureScore'], latestScore);
        const complianceScore = this.readNumber(latest, ['complianceScore', 'ComplianceScore']);
        const totalFindings = this.readNumber(latest, ['totalFindings', 'TotalFindings']);

        return {
            timestamp: this.toIsoFromDateKey(latest.date || latest.Date || latest.weekStart || latest.WeekStart || freshness?.asOf),
            risk: {
                orgScore: latestScore,
                grade: this.gradeForScore(latestScore),
                scoreDelta: Math.round((latestScore - firstScore) * 10) / 10,
                history: trends.map((point) => ({
                    date: point.date || point.Date || point.weekStart || point.WeekStart,
                    score: this.readNumber(point, ['hygieneScore', 'HygieneScore', 'securityScore', 'SecurityScore', 'riskPostureScore', 'RiskPostureScore'])
                }))
            },
            findings: {
                bySeverity: {},
                byDomain: totalFindings > 0 ? { 'Open evidence findings': totalFindings } : {},
                top10: []
            },
            actions: { prioritized: [] },
            compliance: { score: complianceScore, controls: {} },
            metadata: {
                generatedBy: 'Trend evidence fallback',
                generatorVersion: 'trend-fallback',
                warnings: ['The full posture report is not available; showing trend-backed evidence only.']
            },
            isTrendFallback: true
        };
    }

    normalizePostureSnapshot(snapshot, atoms) {
        if (!snapshot || snapshot.risk || snapshot.findings || snapshot.actions) return snapshot;

        const security = this.readAtomRows(atoms, 'security-snapshot')[0] || {};
        const compliance = this.readAtomRows(atoms, 'compliance-snapshot')[0] || {};
        const dailyTrends = this.readAtomRows(atoms, 'org-trends-daily');
        const standards = Array.isArray(compliance.standards) ? compliance.standards : [];
        const nistStandard = standards.find(s => String(s.standardId || '').toUpperCase().startsWith('NIST'));
        const allGaps = standards.flatMap(standard => (standard.gaps || []).map(gap => ({ ...gap, standardId: standard.standardId, standardName: standard.displayName })));
        const controls = {};

        allGaps.slice(0, 8).forEach((gap) => {
            const key = `${gap.standardId || 'CTRL'} ${gap.controlId || gap.title || 'Gap'}`.trim();
            controls[key] = {
                status: 'noncompliant',
                description: gap.description || gap.title || 'Control gap requires review.'
            };
        });

        const topFindings = [
            ...(security.top20AppRisks || []).map(item => ({
                title: `${item.appName || 'Application risk'}${item.version ? ` ${item.version}` : ''}`,
                domain: 'Software',
                severity: item.kevCount > 0 ? 'Critical' : item.cveCount > 0 ? 'High' : 'Medium',
                affectedDevices: item.deviceCount ? [`${item.deviceCount} device${item.deviceCount === 1 ? '' : 's'}`] : [],
                affectedApplications: item.appName ? [item.appName] : [],
                affectedCount: item.deviceCount || item.cveCount || 0,
                agingDays: 0
            })),
            ...(security.top20Devices || []).map(item => ({
                title: `${item.deviceName || item.deviceId || 'Device'} requires attention`,
                domain: 'Device',
                severity: (item.critical || 0) > 0 ? 'Critical' : (item.high || 0) > 0 ? 'High' : 'Medium',
                affectedDevices: [item.deviceName || item.deviceId || 'Device'],
                affectedApplications: [],
                affectedCount: (item.critical || 0) + (item.high || 0) + (item.medium || 0) + (item.low || 0),
                agingDays: item.offlineDays || 0
            }))
        ].slice(0, 10);

        const prioritizedActions = (snapshot.prioritizedActions || []).map(action => ({
            title: action.title || action.actionId || 'Review evidence gap',
            priority: action.priority || 'Medium',
            riskReduction: action.riskReduction ?? 0,
            affectedCount: action.affectedDevices ?? action.affectedDevicesList?.length ?? 0,
            effort: action.effort || 'Medium',
            sla: action.sla || 'Review'
        }));

        return {
            ...snapshot,
            risk: {
                orgScore: snapshot.hygieneScore ?? snapshot.securityScore ?? snapshot.riskPostureScore ?? 0,
                grade: snapshot.hygieneGrade || snapshot.grade || this.gradeForScore(snapshot.hygieneScore ?? snapshot.securityScore ?? 0),
                scoreDelta: snapshot.scoreDelta ?? 0,
                history: dailyTrends.map(point => ({
                    date: point.date || point.Date,
                    score: this.readNumber(point, ['hygieneScore', 'HygieneScore', 'securityScore', 'SecurityScore'])
                }))
            },
            findings: {
                bySeverity: security.bySeverity || {},
                byDomain: security.byDomain || snapshot.domainScores || {},
                top10: topFindings
            },
            actions: { prioritized: prioritizedActions },
            compliance: {
                score: compliance.overallScore ?? snapshot.complianceScore ?? 0,
                controls
            },
            nistComplianceGaps: nistStandard?.gaps || [],
            metadata: {
                generatedBy: 'Daily report evidence',
                generatorVersion: 'report-bundle',
                dataQuality: {
                    deviceCoverage: snapshot.deviceCount ? Math.round(((snapshot.activeDevices || 0) / snapshot.deviceCount) * 100) : null
                },
                warnings: snapshot.dataStateMessage ? [snapshot.dataStateMessage] : []
            }
        };
    }

    async loadSnapshot(force = false) {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ error: 'No organization selected', loading: false, refreshing: false });
            return;
        }

        const period = this.state?.period || 'daily';
        const effectiveDate = rewindContext.isActive?.() ? rewindContext.getDate?.() : 'live';
        const cacheKey = `posture_${currentOrg.orgId}_${period}_${effectiveDate || 'live'}`;

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
            const snapshot = this.normalizePostureSnapshot(this.readAtomRows(atoms, 'org-snapshot')[0] || null, atoms);
            const triggeredGeneration = !!force;
            const freshness = res?.data?.freshness || res?.freshness || null;

            if (!snapshot) {
                const fallbackSnapshot = this.buildTrendFallbackSnapshot(atoms, freshness);
                const trendSnapshots = this.readAtomRows(atoms, 'org-trends-daily');
                this.setState({
                    snapshot: fallbackSnapshot,
                    evidence,
                    trendSnapshots,
                    triggeredGeneration,
                    freshness,
                    nistGaps: null,
                    nistGapsLoading: false,
                    loading: false,
                    refreshing: false,
                    isRefreshingInBackground: false
                });
                return;
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
                ? 'The posture report service is being deployed. Please check back in a few minutes.'
                : (err?.message || 'Failed to load the posture report');

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
            const snapshot = this.normalizePostureSnapshot(this.readAtomRows(atoms, 'org-snapshot')[0] || null, atoms);
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
            } else {
                const fallbackSnapshot = this.buildTrendFallbackSnapshot(atoms, freshness);
                const trendSnapshots = this.readAtomRows(atoms, 'org-trends-daily');
                if (fallbackSnapshot) {
                    this.setState({
                        snapshot: fallbackSnapshot,
                        evidence,
                        trendSnapshots,
                        freshness,
                        nistGaps: null,
                        nistGapsLoading: false,
                        isRefreshingInBackground: false
                    });
                }
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
                ${ml.isAnomaly ? html`<span class="badge bg-danger-lt text-danger">Anomaly detected</span>` : ''}
                ${forecastNext !== null ? html`<span class="badge bg-primary-lt text-primary">Next risk: ${forecastNext}</span>` : ''}
                <span class="badge bg-secondary-lt text-secondary">Confidence ${confidencePct}%</span>
            </div>
        `;
    }

    setPeriod(period) {
        this.setState({ period }, () => this.loadSnapshot(false));
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
                            <div class="badge bg-primary-lt text-primary">${action.affectedCount} affected</div>
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
                <span class="badge bg-danger-lt text-danger">Critical: ${critical}</span>
                <span class="badge bg-warning-lt text-warning">High: ${high}</span>
                <span class="badge bg-info-lt text-info">Medium: ${medium}</span>
                <span class="badge bg-secondary-lt text-secondary">Low: ${low}</span>
            </div>
        `;
    }

    renderDomainBreakdown() {
        const domains = this.state.snapshot?.findings?.byDomain || {};
        const entries = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!entries.length) return html`<div class="text-muted">No domain findings available.</div>`;

        return html`
            <div class="d-grid posture-domain-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
                ${entries.map(([domain, count]) => html`
                    <div class="p-3 rounded border posture-domain-tile">
                        <div class="text-uppercase small text-secondary">${domain}</div>
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
                            <span class="badge bg-primary-lt text-primary">${action.affectedCount} affected</span>
                            <span class="badge bg-secondary-lt text-secondary">SLA: ${action.sla}</span>
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
                                                    <span class="badge bg-secondary-lt text-secondary border border-1">${deviceName}</span>
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
        if (s === 'critical') return 'bg-danger-lt text-danger';
        if (s === 'high') return 'bg-warning-lt text-warning';
        if (s === 'medium') return 'bg-info-lt text-info';
        return 'bg-secondary-lt text-secondary';
    }

    renderCompliance() {
        const compliance = this.state.snapshot?.compliance;
        if (!compliance) return html`<div class="text-muted">No compliance data.</div>`;

        const controls = Object.entries(compliance.controls || {}).slice(0, 5);
        const STATUS_LABEL = { compliant: 'Pass', noncompliant: 'Gap', partial: 'Partial' };
        return html`
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <div class="display-6 mb-0">${compliance.score ?? 0}</div>
                <div class="text-muted">Compliance score</div>
            </div>
            <div class="list-group list-group-flush">
                ${controls.map(([control, status]) => {
                    const raw = (status?.status || '').toLowerCase();
                    const label = STATUS_LABEL[raw] || (status?.status || '—');
                    return html`
                        <div class="list-group-item d-flex justify-content-between align-items-start gap-2">
                            <div class="flex-grow-1 min-w-0">
                                <div class="fw-semibold">${control}</div>
                                <div class="text-muted small">${status.description || 'No description'}</div>
                            </div>
                            <span class="badge ${this.controlColor(status.status)} text-nowrap flex-shrink-0"
                                  title=${status?.status || ''}>${label}</span>
                        </div>
                    `;
                })}
            </div>
        `;
    }

    controlColor(status) {
        const s = (status || '').toLowerCase();
        if (s === 'compliant') return 'bg-success-lt text-success';
        if (s === 'noncompliant') return 'bg-danger-lt text-danger';
        return 'bg-secondary-lt text-secondary';
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
            return html`<div class="text-muted text-center py-4">NIST gap analysis is not available in the current report.</div>`;
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

        const trendDelta = Number(risk.scoreDelta) || 0;
        const hasTrend = Number.isFinite(risk.scoreDelta) && trendDelta !== 0;
        const trendLabel = trendDelta > 0 ? `▲ ${trendDelta} pts` : trendDelta < 0 ? `▼ ${Math.abs(trendDelta)} pts` : '';
        const trendTone = trendDelta > 0 ? 'success' : trendDelta < 0 ? 'danger' : 'secondary';

        // Hygiene Score = orgScore (0-100, higher = better)
        const hygieneScore = risk.orgScore ?? 0;
        const grade = risk.grade || 'N/A';
        const gradeTone = grade === 'A' ? 'success'
                        : grade === 'B' ? 'success'
                        : grade === 'C' ? 'warning'
                        : grade === 'D' ? 'warning'
                        : grade === 'F' ? 'danger'
                        : 'secondary';

        // Build a 30-day TrackingTimeline from risk.history (daily scores).
        const history = Array.isArray(risk.history) ? risk.history : [];
        const trackingDays = history.slice(-30).map(h => {
            const v = Number(h?.score);
            const status = !Number.isFinite(v) ? 'none'
                         : v >= 75 ? 'ok'
                         : v >= 50 ? 'drift'
                         : 'risk';
            return {
                date: h?.date || h?.snapshotDate || null,
                status,
                label: h?.date ? `${h.date} · ${Math.round(v)}/100` : null
            };
        });

        return html`
            <!-- Hygiene Score Hero (calm, no purple gradient) -->
            <div class="card shadow-sm mb-4">
                <div class="card-body">
                    <div class="row align-items-center g-3">
                        <div class="col-lg-4">
                            <div class="text-uppercase text-secondary small fw-bold mb-1" style="letter-spacing:0.06em;">Hygiene Score</div>
                            <div class="d-flex align-items-baseline gap-3">
                                <div class="display-4 fw-bold mb-0" style="line-height:1;">${hygieneScore}<span class="h2 text-muted ms-1">/100</span></div>
                                <span class="badge bg-${gradeTone}-lt text-${gradeTone}" style="font-size:0.95rem;padding:0.4em 0.7em;">Grade ${grade}</span>
                            </div>
                            ${hasTrend ? html`
                                <div class="mt-2">
                                    <span class="text-${trendTone} fw-semibold">${trendLabel}</span>
                                    <span class="text-muted small ms-1">vs last week</span>
                                </div>
                            ` : html`
                                <div class="text-muted small mt-2">Baseline week — building trajectory</div>
                            `}
                        </div>
                        <div class="col-lg-6">
                            <div class="text-uppercase text-secondary small fw-bold mb-2" style="letter-spacing:0.06em;">Daily hygiene · last 30 days</div>
                            ${trackingDays.length > 0
                                ? html`<${TrackingTimeline} days=${trackingDays} length=30 ariaLabel="Daily hygiene score, last 30 days" />`
                                : html`<div class="text-muted small">No daily history yet. Trajectory will appear after a few daily reports.</div>`}
                            <div class="d-flex justify-content-between text-muted small mt-1">
                                <span>30 days ago</span>
                                <span>Today</span>
                            </div>
                        </div>
                        <div class="col-lg-2 text-lg-end">
                            <div class="btn-group" role="group" aria-label="Period">
                                <button type="button"
                                    class="btn btn-sm ${this.state.period === 'daily' ? 'btn-primary' : 'btn-outline-secondary'}"
                                    onClick=${() => this.setPeriod('daily')}>Daily</button>
                                <button type="button"
                                    class="btn btn-sm ${this.state.period === 'weekly' ? 'btn-primary' : 'btn-outline-secondary'}"
                                    onClick=${() => this.setPeriod('weekly')}>Weekly</button>
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
            const surface = this.getSurfaceCopy();
            
            return html`
                <div class="container py-4">
                    <${TimeWarpEvidenceCallout} surface=${surface.calloutSurface} />
                    <${EvidenceBanner} evidence=${this.state.evidence} pageName=${surface.pageName} />
                    <div class="alert ${is404 ? 'alert-info' : 'alert-danger'}">
                        ${is404 ? html`
                            <div class="d-flex align-items-center">
                                <div class="spinner-border spinner-border-sm me-3" role="status"></div>
                                <div>
                                    <strong>Deployment in Progress</strong>
                                    <div class="mt-1">${this.state.error}</div>
                                    <div class="mt-2 small">
                                        In the meantime, you can view 
                                        <a href="#!/mission-brief" class="alert-link">Mission Brief Builder</a>
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
            const surface = this.getSurfaceCopy();
            return html`
                <div class="container py-4">
                    <${TimeWarpEvidenceCallout} surface=${surface.calloutSurface} />
                    <${EvidenceBanner} evidence=${this.state.evidence} pageName=${surface.pageName} />
                    <div class="alert alert-warning">${surface.empty}</div>
                    <button class="btn btn-primary" data-mutates-state="true" onClick=${() => this.loadSnapshot(true)}>${surface.prepare}</button>
                </div>
            `;
        }

        const generatedAtRaw = this.state.snapshot.timestamp
            || this.state.snapshot.generatedAt
            || this.state.snapshot.generatedAtUtc
            || this.state.snapshot.snapshotDate
            || this.state.snapshot.asOf;
        const generatedAt = generatedAtRaw ? new Date(generatedAtRaw).toLocaleString() : 'Unknown';
        const surface = this.getSurfaceCopy();

        return html`
            <div class="page-header d-print-none mb-3">
                <div class="container">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="text-uppercase small fw-semibold text-primary mb-1" style="letter-spacing:0.06em;"><i class="ti ti-file-certificate me-1"></i>${surface.eyebrow}</div>
                            <div class="d-flex align-items-center gap-2 flex-wrap">
                                <h2 class="page-title mb-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>
                                    ${surface.title}
                                </h2>
                                ${this.state.isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle">
                                <span class="text-muted">${surface.subtitlePrefix} <strong class="text-body">${generatedAt}</strong>${surface.mode === 'proof' ? ' · ready to share with auditors and insurers' : ' · ready for posture review'}</span>
                                ${this.state.freshness?.degraded ? html`
                                    <span class="badge bg-warning-lt text-warning ms-2">
                                        <i class="ti ti-alert-triangle me-1"></i>Degraded report
                                    </span>
                                ` : null}
                                ${this.state.snapshot?.isTrendFallback ? html`
                                    <span class="badge bg-azure-lt text-azure ms-2"><i class="ti ti-chart-line me-1"></i>Trend evidence only</span>
                                ` : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="container">
                <${TimeWarpEvidenceCallout} surface=${surface.calloutSurface} />
                <${EvidenceBanner} evidence=${this.state.evidence} pageName=${surface.pageName} />
                ${this.state.snapshot?.isTrendFallback ? html`
                    <div class="alert alert-info border-0 shadow-sm">
                        Full posture report evidence is still being prepared. Showing the latest trend-backed posture signals that are available for this organization.
                    </div>
                ` : null}
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
                    title=${surface.trendTitle}
                    subtitle=${surface.trendSubtitle}
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
                                    <div class="text-muted small">Control status report</div>
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
