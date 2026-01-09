/**
 * Unified Dashboard - Security Operations Center (SOC) View
 * Adaptive layout for all user roles
 * Features: AI Analyst, Security Posture, Inventory, Threat Intel
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { config } from '../config.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class UnifiedDashboardPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            user: null,
            currentOrg: null,
            dashboardData: null,
            deviceStats: { total: 0, active: 0, disabled: 0, blocked: 0 },
            threatSummary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
            complianceSummary: { score: 0, compliant: 0, nonCompliant: 0, total: 0 },
            recentAlerts: [],
            recentDevices: [],
            licenseInfo: null,
            coverage: { healthy: 0, stale: 0, offline: 0, total: 0 },
            actions: [],
            inventoryStats: { totalApps: 0, vendors: 0 },
            securityScore: 0,
            securityGrade: 'N/A',
            lastScan: 'Never',
            nextScan: 'Pending',
            generatedAt: null,
            refreshInterval: null
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadDashboardData());
        this.loadDashboardData();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this.state.refreshInterval) {
            clearInterval(this.state.refreshInterval);
        }
    }

    async loadDashboardData() {
        try {
            this.setState({ loading: true, error: null });
            
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            
            if (!user) {
                this.setState({ error: 'Not authenticated', loading: false });
                return;
            }

            this.setState({ user, currentOrg });

            const orgId = currentOrg?.orgId || user.email;
            
            // Single fetch for unified dashboard data
            const dashboardRes = await api.getUnifiedDashboard(orgId);
            
            if (dashboardRes.success && dashboardRes.data) {
                const dashboard = dashboardRes.data;
                
                // Inventory stats from backend
                const inventoryStats = dashboard.inventory || { totalApps: 0, vendors: 0 };

                // License info from backend
                const licenseInfo = dashboard.license || null;

                const coverage = dashboard.coverage || { healthy: 0, stale: 0, offline: 0, total: 0 };
                const actions = dashboard.actions || [];
                const generatedAt = dashboard.generatedAt || new Date().toISOString();

                this.setState({
                    dashboardData: dashboard,
                    deviceStats: dashboard.devices || { total: 0, active: 0, disabled: 0, blocked: 0 },
                    threatSummary: dashboard.threats || { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
                    complianceSummary: dashboard.compliance || { score: 0, compliant: 0, nonCompliant: 0, total: 0 },
                    recentAlerts: dashboard.alerts || [],
                    recentDevices: dashboard.recentDevices || [],
                    securityScore: dashboard.securityScore || 0,
                    securityGrade: dashboard.grade || 'N/A',
                    lastScan: dashboard.lastScan || 'Never',
                    nextScan: dashboard.nextScan || 'Pending',
                    inventoryStats,
                    licenseInfo,
                    coverage,
                    actions,
                    generatedAt,
                    loading: false
                });
            } else {
                throw new Error(dashboardRes.message || dashboardRes.error || 'Failed to load dashboard data');
            }
        } catch (error) {
            console.error('[UnifiedDashboard] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    handleAnalystSearch(query) {
        if (query && query.trim()) {
            window.location.hash = `#!/analyst?q=${encodeURIComponent(query.trim())}`;
        }
    }

    getUserRole() {
        const currentOrg = orgContext.currentOrg;
        if (currentOrg?.role === 'SiteAdmin') return 'SiteAdmin';
        if (currentOrg?.role === 'Owner' || currentOrg?.role === 'ReadWrite') return 'Business';
        return 'Individual';
    }

    getRiskScore() {
        return this.state.securityScore || 0;
    }

    getRiskColor(score) {
        if (score === null || score === 0) return 'secondary';
        if (score >= 80) return 'danger';
        if (score >= 60) return 'warning';
        if (score >= 40) return 'info';
        return 'success';
    }

    getRiskLabel(score) {
        if (score >= 80) return 'Critical';
        if (score >= 60) return 'High';
        if (score >= 40) return 'Medium';
        if (score > 0) return 'Low';
        return 'No Risk';
    }

    getCoveragePercents() {
        const { coverage } = this.state;
        const total = coverage.total || 0;
        return {
            healthyPct: total ? Math.round((coverage.healthy / total) * 100) : 0,
            stalePct: total ? Math.round((coverage.stale / total) * 100) : 0,
            offlinePct: total ? Math.max(0, 100 - Math.round((coverage.healthy / total) * 100) - Math.round((coverage.stale / total) * 100)) : 0
        };
    }

    getSeatUsage() {
        const { licenseInfo } = this.state;
        return {
            used: licenseInfo?.usedSeats ?? 0,
            total: licenseInfo?.seats ?? 0,
            pct: licenseInfo?.seatUtilization ?? 0
        };
    }

    getCreditUsage() {
        const { licenseInfo } = this.state;
        return {
            remaining: licenseInfo?.remainingCredits ?? 0,
            pct: licenseInfo?.creditUtilization ?? 0
        };
    }

    render() {
        const { loading, error, user, currentOrg } = this.state;
        
        if (loading) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="alert alert-danger">
                    <h4 class="alert-title">Dashboard Error</h4>
                    <div class="text-secondary">${error}</div>
                </div>
            `;
        }

        const role = this.getUserRole();
        const riskScore = this.getRiskScore();
        const riskColor = this.getRiskColor(riskScore);
        const orgName = currentOrg?.name || currentOrg?.orgId || user?.email || 'Your organization';

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Security overview</div>
                            <h2 class="page-title">${orgName}</h2>
                        </div>
                        <div class="col-auto ms-auto">
                            ${this.renderQuickActions()}
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    ${this.renderValuePanel(riskColor)}
                    ${this.renderHero(riskScore, riskColor)}
                    ${this.renderHighlights()}

                    <div class="row row-deck row-cards mt-3">
                        ${this.renderKPICards(role, riskScore, riskColor)}
                    </div>

                    <div class="row row-cards mt-3">
                        <div class="col-lg-8">
                            <div class="vstack gap-3">
                                ${this.renderAIAnalystWidget()}
                                ${this.renderActionList()}
                                ${this.renderPostureWidget()}
                                ${this.renderRecentAlerts()}
                            </div>
                        </div>
                        <div class="col-lg-4">
                            <div class="vstack gap-3">
                                ${this.renderCoverageWidget()}
                                ${this.renderLicenseWidget()}
                                ${this.renderRecentDevices()}
                                ${this.renderInventoryWidget()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderValuePanel(riskColor) {
        const { threatSummary } = this.state;
        const coveragePercents = this.getCoveragePercents();
        const seats = this.getSeatUsage();
        const credits = this.getCreditUsage();

        return html`
            <div class="card mb-3" style="background: linear-gradient(120deg, #0b7285 0%, #1c7ed6 50%, #4263eb 100%); color: #fff;">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-lg-7">
                            <div class="text-uppercase text-white-50 fw-semibold mb-1">Trusted Security Overview</div>
                            <div class="h2 mb-2">Spot risks faster. Prove readiness instantly.</div>
                            <div class="text-white-70">Real-time telemetry, actionable playbooks, and license health in one view. Ship reports your auditors will love.</div>
                            <div class="btn-list mt-3">
                                <a href="#!/posture" class="btn btn-white">Run full scan</a>
                                <a href="#!/devices" class="btn btn-light">Add device</a>
                            </div>
                        </div>
                        <div class="col-lg-5 mt-3 mt-lg-0">
                            <div class="row row-cards g-2">
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm">
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Coverage</div>
                                            <div class="h3 mb-0">${coveragePercents.healthyPct}%</div>
                                            <div class="text-muted small">Healthy telemetry</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm">
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Seats used</div>
                                            <div class="h3 mb-0">${seats.used}/${seats.total || '—'}</div>
                                            <div class="text-muted small">${seats.pct}% utilization</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm">
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Credits left</div>
                                            <div class="h3 mb-0">${credits.remaining}</div>
                                            <div class="text-muted small">${credits.pct}% used</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm">
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Open threats</div>
                                            <div class="h3 mb-0 text-${riskColor}">${(threatSummary.critical || 0) + (threatSummary.high || 0)}</div>
                                            <div class="text-muted small">Critical / High</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderHero(riskScore, riskColor) {
        const { securityGrade, lastScan, nextScan, coverage, generatedAt } = this.state;
        const coverageTotal = coverage.total || 0;
        const coverageLabel = coverageTotal ? `${coverage.healthy}/${coverageTotal} healthy` : 'No devices yet';

        return html`
            <div class="card bg-dark text-white">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-lg-8">
                            <div class="text-uppercase text-white-50 fw-semibold mb-1">Security posture</div>
                            <div class="d-flex align-items-center">
                                <div class="display-6 mb-0 me-3 text-${riskColor}">${riskScore}</div>
                                <div>
                                    <div class="h3 mb-0">Grade ${securityGrade}</div>
                                    <div class="text-white-70">Last scan: ${lastScan} · Next: ${nextScan}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-4 text-lg-end mt-3 mt-lg-0">
                            <div class="text-white-50">Telemetry coverage</div>
                            <div class="h4 mb-1">${coverageLabel}</div>
                            <div class="text-white-50 small">Updated ${this.formatTimestamp(generatedAt)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderHighlights() {
        const { deviceStats, threatSummary, complianceSummary } = this.state;
        const atRisk = (deviceStats.blocked || 0) + (deviceStats.disabled || 0);
        const hasThreats = (threatSummary.total || 0) > 0;
        const criticalHigh = hasThreats ? (threatSummary.critical || 0) + (threatSummary.high || 0) : '—';
        const hasCompliance = (complianceSummary.total || 0) > 0;
        const complianceScoreLabel = hasCompliance ? `${complianceSummary.score}%` : 'Awaiting scan';

        return html`
            <div class="row row-cards mt-3">
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">At-risk endpoints</div>
                            <div class="h2 mb-0">${atRisk}</div>
                            <div class="text-muted small">Blocked + disabled</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">Critical/High threats</div>
                            <div class="h2 mb-0">${criticalHigh}</div>
                            <div class="text-muted small">Focus your patching</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">Compliance score</div>
                            <div class="h2 mb-0">${complianceScoreLabel}</div>
                            <div class="text-muted small">${complianceSummary.compliant} pass / ${complianceSummary.nonCompliant} fail</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">Telemetry health</div>
                            <div class="h2 mb-0">${this.getCoveragePercents().healthyPct}%</div>
                            <div class="text-muted small">Healthy devices streaming</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderActionList() {
        const { actions } = this.state;

        const severityToBadge = (severity) => {
            if (severity === 'critical') return 'bg-danger';
            if (severity === 'warning') return 'bg-warning';
            if (severity === 'success') return 'bg-success';
            return 'bg-info';
        };

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Recommended actions</h3>
                    <div class="card-actions">
                        <span class="badge bg-azure-lt">Landing page focus</span>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${actions && actions.length ? actions.slice(0, 4).map(action => html`
                        <div class="list-group-item">
                            <div class="d-flex align-items-start">
                                <span class="status-dot me-3 ${severityToBadge(action.severity)}"></span>
                                <div class="flex-fill">
                                    <div class="d-flex align-items-center">
                                        <div class="fw-semibold">${action.title}</div>
                                        ${action.ctaLabel ? html`<a href="${action.ctaHref || '#'}" class="ms-auto small text-primary">${action.ctaLabel}</a>` : ''}
                                    </div>
                                    <div class="text-muted small">${action.description}</div>
                                </div>
                            </div>
                        </div>
                    `) : html`
                        <div class="list-group-item text-muted text-center py-3">No immediate actions. Keep monitoring telemetry.</div>
                    `}
                </div>
            </div>
        `;
    }

    renderCoverageWidget() {
        const { coverage } = this.state;
        const total = coverage.total || 0;
        const healthyPct = total ? Math.round((coverage.healthy / total) * 100) : 0;
        const stalePct = total ? Math.round((coverage.stale / total) * 100) : 0;
        const offlinePct = total ? Math.max(0, 100 - healthyPct - stalePct) : 0;

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Telemetry coverage</h3>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <div class="subheader">Healthy</div>
                        <div class="ms-auto h4 mb-0">${coverage.healthy}</div>
                    </div>
                    <div class="progress progress-sm mb-3">
                        <div class="progress-bar bg-success" style=${`width: ${healthyPct}%`} role="progressbar"></div>
                        <div class="progress-bar bg-warning" style=${`width: ${stalePct}%`} role="progressbar"></div>
                        <div class="progress-bar bg-secondary" style=${`width: ${offlinePct}%`} role="progressbar"></div>
                    </div>
                    <div class="small text-muted">Stale: ${coverage.stale} · Offline: ${coverage.offline}</div>
                </div>
            </div>
        `;
    }

    renderLicenseWidget() {
        const { licenseInfo } = this.state;

        if (!licenseInfo) {
            return html`
                <div class="card mb-3">
                    <div class="card-body text-center text-muted">No license info available.</div>
                </div>
            `;
        }

        const seatPct = licenseInfo.seatUtilization || 0;
        const creditPct = licenseInfo.creditUtilization || 0;

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">License & credits</h3>
                    <div class="card-actions">
                        <span class="badge ${licenseInfo.status === 'Active' ? 'bg-success-lt text-success' : 'bg-warning-lt text-warning'}">${licenseInfo.status}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <div>Seats</div>
                        <div class="ms-auto">${licenseInfo.usedSeats}/${licenseInfo.seats}</div>
                    </div>
                    <div class="progress progress-sm mb-3">
                        <div class="progress-bar" style=${`width: ${seatPct}%`} role="progressbar"></div>
                    </div>
                    <div class="d-flex align-items-center mb-2">
                        <div>Credits remaining</div>
                        <div class="ms-auto">${licenseInfo.remainingCredits}</div>
                    </div>
                    <div class="progress progress-sm">
                        <div class="progress-bar bg-azure" style=${`width: ${creditPct}%`} role="progressbar"></div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentDevices() {
        const { recentDevices } = this.state;

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Recent devices</h3>
                    <div class="card-actions">
                        <a href="#!/devices" class="btn btn-sm btn-ghost-secondary">View all</a>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${recentDevices && recentDevices.length ? recentDevices.map(device => {
                        // Prefer friendly names; only show IDs in the link, not as display text
                        const deviceName = device.displayName
                            || device.friendlyName
                            || device.deviceName
                            || device.hostname
                            || device.name
                            || 'Unnamed device';
                        const deviceId = device.deviceId || device.id || device.name || device.hostname || '';
                        const deviceHref = deviceId ? `#!/devices/${encodeURIComponent(deviceId)}` : '#!/devices';

                        return html`
                            <div class="list-group-item">
                                <div class="d-flex align-items-center">
                                    <div class="flex-fill">
                                        <a class="fw-semibold" href="${deviceHref}">${deviceName}</a>
                                        <div class="text-muted small">${this.formatTimestamp(device.lastSeen)}</div>
                                    </div>
                                    <span class="badge ${device.status === 'active' ? 'bg-success-lt text-success' : device.status === 'blocked' ? 'bg-danger-lt text-danger' : 'bg-warning-lt text-warning'}">${device.status}</span>
                                </div>
                            </div>`;
                    }) : html`<div class="list-group-item text-muted text-center py-3">No recent activity</div>`}
                </div>
            </div>
        `;
    }

    formatTimestamp(value) {
        if (!value) return 'just now';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleString();
    }

    renderAIAnalystWidget() {
        return html`
            <div class="card bg-primary-lt mb-3">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <span class="avatar avatar-md bg-primary text-white">AI</span>
                        </div>
                        <div class="col">
                            <h3 class="card-title m-0">AI Security Analyst</h3>
                            <div class="text-muted">Ask questions about your security posture, vulnerabilities, or devices.</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="input-group input-group-flat">
                            <input type="text" class="form-control" placeholder="e.g., 'Show me critical vulnerabilities' or 'How many devices are non-compliant?'" 
                                onKeydown=${(e) => e.key === 'Enter' && this.handleAnalystSearch(e.target.value)} />
                            <span class="input-group-text">
                                <a href="#" class="link-primary" title="Ask Analyst" onClick=${(e) => {
                                    e.preventDefault();
                                    const input = e.target.closest('.input-group').querySelector('input');
                                    this.handleAnalystSearch(input.value);
                                }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                </a>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderKPICards(role, riskScore, riskColor) {
        const { deviceStats, licenseInfo, coverage, securityGrade, lastScan, complianceSummary } = this.state;
        const riskLabel = this.getRiskLabel(riskScore);

        const scoreCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Security Score</div>
                            <div class="ms-auto lh-1">
                                <span class="badge bg-${riskColor}">${securityGrade}</span>
                            </div>
                        </div>
                        <div class="h1 mb-3"><span class="text-${riskColor}">${riskScore}</span>/100</div>
                        <div class="d-flex mb-2">
                            <div>${riskLabel}</div>
                            <div class="ms-auto text-muted small">Last: ${lastScan}</div>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-${riskColor}" style="width: ${riskScore}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        const devicesCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Active Endpoints</div>
                            <div class="ms-auto lh-1"><a href="#!/devices" class="text-muted">View All</a></div>
                        </div>
                        <div class="h1 mb-3">${deviceStats.active} <span class="text-muted fs-4 fw-normal">/ ${deviceStats.total}</span></div>
                        <div class="d-flex mb-2">
                            <span class="text-${deviceStats.blocked > 0 ? 'danger' : 'success'}">${deviceStats.blocked} Blocked</span>
                            <span class="ms-auto text-muted">${deviceStats.disabled} Disabled</span>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-primary" style="width: ${deviceStats.total ? (deviceStats.active / deviceStats.total * 100) : 0}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        const coverageCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Telemetry</div>
                        </div>
                        <div class="h1 mb-3">${coverage.healthy}/${coverage.total || 0}</div>
                        <div class="d-flex mb-2">
                            <span class="text-success me-2">Healthy</span>
                            <span class="text-warning">${coverage.stale} Stale</span>
                            <span class="ms-auto text-danger">${coverage.offline} Offline</span>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-success" style="width: ${coverage.total ? (coverage.healthy / coverage.total * 100) : 0}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        const creditsCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Credits</div>
                        </div>
                        <div class="h1 mb-3">${licenseInfo?.remainingCredits ?? 0}</div>
                        <div class="d-flex mb-2">
                            <span class="text-muted">Seats used ${licenseInfo?.usedSeats ?? 0}/${licenseInfo?.seats ?? 0}</span>
                            <span class="ms-auto badge ${licenseInfo?.status === 'Active' ? 'bg-success-lt text-success' : 'bg-warning-lt text-warning'}">${licenseInfo?.status || 'Unknown'}</span>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-azure" style="width: ${licenseInfo?.creditUtilization ?? 0}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        return html`${scoreCard}${devicesCard}${coverageCard}${creditsCard}`;
    }

    renderPostureWidget() {
        const { threatSummary, complianceSummary } = this.state;
        const hasPostureData = (threatSummary.total || 0) > 0 || (complianceSummary.total || 0) > 0;

        if (!hasPostureData) {
            return html`
                <div class="card mb-3">
                    <div class="card-body text-center py-5">
                        <h3 class="card-title mb-2">Security posture summary</h3>
                        <div class="text-muted mb-3">No posture data yet. Run a full scan to generate threats and compliance scores.</div>
                        <div>
                            <a href="#!/posture" class="btn btn-primary me-2">Run full scan</a>
                            <a href="#!/devices" class="btn btn-outline-secondary">Add devices</a>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Security Posture Summary</h3>
                    <div class="card-actions">
                        <a href="#!/posture" class="btn btn-sm btn-outline-primary">Full Report</a>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h4 class="subheader">Threat Distribution</h4>
                            <div class="d-flex align-items-center mb-3">
                                <div class="w-100">
                                    <div class="row">
                                        <div class="col-auto d-flex align-items-center">
                                            <span class="legend me-2 bg-danger"></span>
                                            <span>Critical: <strong>${threatSummary.critical}</strong></span>
                                        </div>
                                        <div class="col-auto d-flex align-items-center">
                                            <span class="legend me-2 bg-warning"></span>
                                            <span>High: <strong>${threatSummary.high}</strong></span>
                                        </div>
                                        <div class="col-auto d-flex align-items-center">
                                            <span class="legend me-2 bg-info"></span>
                                            <span>Medium: <strong>${threatSummary.medium}</strong></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h4 class="subheader">Compliance Status</h4>
                            <div class="d-flex align-items-center">
                                <div class="w-100">
                                    <div class="row">
                                        <div class="col-auto d-flex align-items-center">
                                            <span class="legend me-2 bg-success"></span>
                                            <span>Compliant: <strong>${complianceSummary.compliant}</strong></span>
                                        </div>
                                        <div class="col-auto d-flex align-items-center">
                                            <span class="legend me-2 bg-danger"></span>
                                            <span>Non-Compliant: <strong>${complianceSummary.nonCompliant}</strong></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentAlerts() {
        const { recentAlerts } = this.state;
        
        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Recent Alerts</h3>
                    <div class="card-actions">
                        <a href="#!/alerts" class="btn btn-sm btn-ghost-secondary">View All</a>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${recentAlerts.length > 0 ? recentAlerts.slice(0, 5).map(alert => html`
                        <div class="list-group-item">
                            <div class="row align-items-center">
                                <div class="col-auto">
                                    <span class="status-dot status-dot-animated ${alert.severity === 'critical' ? 'bg-danger' : alert.severity === 'high' ? 'bg-warning' : 'bg-secondary'} d-block"></span>
                                </div>
                                <div class="col text-truncate">
                                    <a href="#" class="text-body d-block">${alert.title}</a>
                                    <div class="d-block text-muted text-truncate mt-n1">
                                        ${alert.device} &middot; ${alert.detected}
                                    </div>
                                </div>
                                <div class="col-auto">
                                    <a href="#" class="list-group-item-actions">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 6l6 6l-6 6" /></svg>
                                    </a>
                                </div>
                            </div>
                        </div>
                    `) : html`
                        <div class="list-group-item text-center text-muted py-4">
                            No recent alerts
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderInventoryWidget() {
        const { inventoryStats } = this.state;
        const hasInventory = (inventoryStats.totalApps || 0) > 0 || (inventoryStats.vendors || 0) > 0;
        
        return html`
            <div class="card mb-0">
                <div class="card-header">
                    <h3 class="card-title">Software Inventory</h3>
                    <div class="card-actions">
                        <a href="#!/inventory" class="btn btn-sm btn-ghost-secondary">Manage</a>
                    </div>
                </div>
                <div class="card-body">
                    ${hasInventory ? html`
                        <div class="d-flex align-items-center mb-3">
                            <div class="subheader">Total Applications</div>
                            <div class="ms-auto h3 mb-0">${inventoryStats.totalApps}</div>
                        </div>
                        <div class="d-flex align-items-center">
                            <div class="subheader">Unique Vendors</div>
                            <div class="ms-auto h3 mb-0">${inventoryStats.vendors}</div>
                        </div>
                        <div class="mt-3">
                            <a href="#!/inventory" class="btn btn-outline-secondary w-100">View Software Inventory</a>
                        </div>
                    ` : html`
                        <div class="text-center text-muted py-3">
                            No inventory yet. Install the agent and run a software scan.
                        </div>
                        <div class="mt-2 d-flex justify-content-center">
                            <a href="#!/devices" class="btn btn-primary">Add device</a>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderPlaceholderTile(title, description, icon) {
        return html`
            <div class="card">
                <div class="card-body text-center py-4">
                    <div class="mb-3">
                        <span class="avatar avatar-xl rounded bg-secondary-lt">
                            ${icon === 'activity' ? html`
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h4l3 8l4 -16l3 8h4" /></svg>
                            ` : html`
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M9 15l2 2l4 -4" /></svg>
                            `}
                        </span>
                    </div>
                    <h3 class="card-title mb-1">${title}</h3>
                    <div class="text-muted">${description}</div>
                </div>
            </div>
        `;
    }

    renderQuickActions() {
        return html`
            <div class="btn-list">
                <a href="#!/devices" class="btn btn-white">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="12" y1="9" x2="12" y2="15" /></svg>
                    Add Device
                </a>
                <a href="#!/settings" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><circle cx="12" cy="12" r="3" /></svg>
                    Settings
                </a>
            </div>
        `;
    }
}

// For direct page rendering
if (document.getElementById('page-root')) {
    window.preactRender(html`<${UnifiedDashboardPage} />`, document.getElementById('page-root'));
}
