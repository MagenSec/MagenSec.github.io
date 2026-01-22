import { api } from '../api.js';
import { logger } from '../config.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

/**
 * Posture Snapshot (PostureEngine) - deterministic, on-demand posture view.
 * Fetches the latest snapshot for the selected org; if missing, generates one immediately.
 */
export class PosturePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            refreshing: false,
            error: null,
            snapshot: null,
            triggeredGeneration: false
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

    async loadSnapshot(force = false) {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ error: 'No organization selected', loading: false, refreshing: false });
            return;
        }

        this.setState({
            loading: !this.state.snapshot || force,
            refreshing: force,
            error: null
        });

        try {
            const res = await api.getPostureSnapshot(currentOrg.orgId, { period: 'daily', force });
            const payload = res?.data || res;
            const snapshot = payload?.snapshot || payload?.data?.snapshot || null;
            const triggeredGeneration = payload?.triggeredGeneration ?? payload?.data?.triggeredGeneration ?? force;

            if (!snapshot) {
                throw new Error('Snapshot unavailable');
            }

            this.setState({
                snapshot,
                triggeredGeneration,
                loading: false,
                refreshing: false
            });
        } catch (err) {
            logger.error('[Posture] Failed to load snapshot:', err);
            this.setState({
                error: err?.message || 'Failed to load posture snapshot',
                loading: false,
                refreshing: false
            });
        }
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
                ${critical > 0 ? html`<span class="badge bg-danger text-white">⚠️ ${critical} Critical</span>` : ''}
                ${high > 0 ? html`<span class="badge bg-warning text-white">🔴 ${high} High</span>` : ''}
                ${medium > 0 ? html`<span class="badge bg-info text-white">🟡 ${medium} Medium</span>` : ''}
                ${low > 0 ? html`<span class="badge bg-success text-white">🔵 ${low} Low</span>` : ''}
                ${critical === 0 && high === 0 && medium === 0 && low === 0 ? html`
                    <span class="badge bg-success-lt">✓ No vulnerabilities found</span>
                ` : ''}
            </div>
        `;
    }

    renderDomainBreakdown() {
        const domains = this.state.snapshot?.findings?.byDomain || {};
        const entries = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!entries.length) return html`<div class="text-muted">No domain findings available.</div>`;

        const domainIcons = {
            'Vulnerabilities': '🛡️',
            'Configuration': '⚙️',
            'Compliance': '📋',
            'Identity': '👤',
            'Network': '🌐',
            'Endpoint': '💻'
        };

        return html`
            <div class="row row-cards">
                ${entries.map(([domain, count]) => html`
                    <div class="col-sm-6 col-lg-4">
                        <div class="card card-sm">
                            <div class="card-body">
                                <div class="d-flex align-items-center">
                                    <div class="subheader">${domainIcons[domain] || '📊'} ${domain}</div>
                                    <div class="ms-auto">
                                        <span class="badge ${count > 10 ? 'bg-danger' : count > 5 ? 'bg-warning' : 'bg-success'} text-white">
                                            ${count}
                                        </span>
                                    </div>
                                </div>
                                <div class="h1 mb-0 mt-2">${count}</div>
                                <div class="text-muted small">findings</div>
                            </div>
                        </div>
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
                ${actions.slice(0, 6).map((action) => {
                    // Task 4: Show affected apps/devices list
                    const devices = action.affectedDevices || [];
                    const displayDevices = devices.slice(0, 3).join(', ');
                    const moreCount = Math.max(0, devices.length - 3);
                    const deviceList = displayDevices + (moreCount > 0 ? `, ...${moreCount} more` : '');
                    
                    return html`
                    <div class="list-group-item d-flex flex-column flex-lg-row align-items-start align-items-lg-center gap-2">
                        <div class="flex-grow-1">
                            <div class="fw-semibold">${action.title}</div>
                            <div class="text-muted small">Priority: ${action.priority} · Effort: ${action.effort} · Risk Reduction: ${action.riskReduction}</div>
                            ${deviceList ? html`<div class="text-muted small mt-1"><strong>Devices:</strong> ${deviceList}</div>` : ''}
                        </div>
                        <div class="d-flex gap-2">
                            <span class="badge bg-primary text-white">${action.affectedCount || devices.length || 0} affected</span>
                            <span class="badge bg-outline-secondary border">SLA: ${action.sla}</span>
                        </div>
                    </div>
                `})}
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
                <table class="table align-middle mb-0">
                    <thead>
                        <tr>
                            <th scope="col">Finding</th>
                            <th scope="col">Domain</th>
                            <th scope="col">Severity</th>
                            <th scope="col">Affected Apps/Devices</th>
                            <th scope="col">Aging (days)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${findings.map(item => {
                            // Task 5: Show affected apps/devices instead of just count
                            const entities = item.affectedEntities || [];
                            const displayEntities = entities.slice(0, 3).join(', ');
                            const moreCount = Math.max(0, entities.length - 3);
                            const entityList = displayEntities + (moreCount > 0 ? `, ...${moreCount} more` : '');
                            const count = item.affectedCount || entities.length || 0;
                            
                            return html`
                            <tr>
                                <td class="fw-semibold">${item.title}</td>
                                <td>${item.domain}</td>
                                <td><span class="badge bg-${this.severityToColor(item.severity)} text-white">${item.severity}</span></td>
                                <td>
                                    <span class="badge bg-primary-lt">${count} affected</span>
                                    ${entityList ? html`<div class="text-muted small mt-1">${entityList}</div>` : ''}
                                </td>
                                <td>${item.agingDays}</td>
                            </tr>
                        `})}
                    </tbody>
                </table>
            </div>
        `;
    }

    severityToColor(severity) {
        const s = (severity || '').toLowerCase();
        if (s === 'critical') return 'danger';
        if (s === 'high') return 'warning text-dark';
        if (s === 'medium') return 'info text-dark';
        return 'secondary';
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
                        <span class="badge bg-${this.controlColor(status.status)} text-white">${status.status}</span>
                    </div>
                `)}
            </div>
        `;
    }

    controlColor(status) {
        const s = (status || '').toLowerCase();
        if (s === 'compliant') return 'success';
        if (s === 'noncompliant') return 'danger';
        return 'secondary';
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

        return html`
            <div class="card shadow-sm border-0 mb-4" style="background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%); color: #fff;">
                <div class="card-body d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-3">
                    <div>
                        <div class="text-uppercase small opacity-75">Security Posture</div>
                        <div class="display-4 fw-bold mb-0">${risk.orgScore ?? 0}</div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-white text-dark">Grade: ${risk.grade || 'N/A'}</span>
                            <span class="badge bg-white-lt text-dark border">Trend Δ ${risk.scoreDelta ?? 0}</span>
                        </div>
                        <div class="mt-3">Findings: ${severity.critical + severity.high + severity.medium + severity.low}</div>
                    </div>
                    <div class="d-flex flex-column gap-2">
                        <button class="btn btn-light" disabled=${this.state.refreshing} onClick=${() => this.loadSnapshot(true)}>
                            ${this.state.refreshing ? 'Refreshing...' : 'Regenerate snapshot'}
                        </button>
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
            return html`
                <div class="container py-4">
                    <div class="alert alert-danger">${this.state.error}</div>
                    <button class="btn btn-primary" onClick=${() => this.loadSnapshot()}>Retry</button>
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
            <div class="container py-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h2 class="mb-0">Security Posture</h2>
                        <div class="text-muted">Generated: ${generatedAt}</div>
                    </div>
                </div>

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
