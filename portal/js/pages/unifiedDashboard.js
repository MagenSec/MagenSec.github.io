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
            inventoryStats: { totalApps: 0, vendors: 0 },
            securityScore: 0,
            securityGrade: 'N/A',
            lastScan: 'Never',
            nextScan: 'Pending',
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

    render() {
        const { loading, error, user } = this.state;
        
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

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Overview</div>
                            <h2 class="page-title">Security Operations Center</h2>
                        </div>
                        <div class="col-auto ms-auto">
                            ${this.renderQuickActions()}
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <!-- AI Analyst Widget -->
                    <div class="row mb-3">
                        ${this.renderAIAnalystWidget()}
                    </div>

                    <!-- KPI Cards -->
                    <div class="row row-deck row-cards mb-3">
                        ${this.renderKPICards(role, riskScore, riskColor)}
                    </div>

                    <!-- Main Content Grid -->
                    <div class="row row-deck row-cards">
                        <!-- Left Column: Posture & Alerts -->
                        <div class="col-lg-8">
                            <div class="row row-cards">
                                <div class="col-12">
                                    ${this.renderPostureWidget()}
                                </div>
                                <div class="col-12">
                                    ${this.renderRecentAlerts()}
                                </div>
                            </div>
                        </div>

                        <!-- Right Column: Inventory & Placeholders -->
                        <div class="col-lg-4">
                            <div class="row row-cards">
                                <div class="col-12">
                                    ${this.renderInventoryWidget()}
                                </div>
                                <div class="col-12">
                                    ${this.renderPlaceholderTile('Threat Intelligence', 'Global threat feed integration coming soon.', 'activity')}
                                </div>
                                <div class="col-12">
                                    ${this.renderPlaceholderTile('Compliance Reports', 'Detailed compliance frameworks (ISO, SOC2) coming soon.', 'file-check')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderAIAnalystWidget() {
        return html`
            <div class="col-12">
                <div class="card bg-primary-lt">
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
            </div>
        `;
    }

    renderKPICards(role, riskScore, riskColor) {
        const { deviceStats, licenseInfo, threatSummary, securityGrade, lastScan } = this.state;
        const riskLabel = this.getRiskLabel(riskScore);
        
        // Security Score Card
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
                        <div class="h1 mb-3">
                            <span class="text-${riskColor}">${riskScore}</span>/100
                        </div>
                        <div class="d-flex mb-2">
                            <div>${riskLabel}</div>
                            <div class="ms-auto text-muted small">Last: ${lastScan}</div>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-${riskColor}" style="width: ${riskScore}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Devices Card
        const devicesCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Active Endpoints</div>
                            <div class="ms-auto lh-1">
                                <a href="#!/devices" class="text-muted">View All</a>
                            </div>
                        </div>
                        <div class="h1 mb-3">${deviceStats.active} <span class="text-muted fs-4 fw-normal">/ ${deviceStats.total}</span></div>
                        <div class="d-flex mb-2">
                            <span class="text-${deviceStats.blocked > 0 ? 'danger' : 'success'}">
                                ${deviceStats.blocked} Blocked
                            </span>
                            <span class="ms-auto text-muted">${deviceStats.disabled} Disabled</span>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-primary" style="width: ${deviceStats.total ? (deviceStats.active / deviceStats.total * 100) : 0}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Threats Card
        const threatsCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Active Threats</div>
                        </div>
                        <div class="h1 mb-3">${threatSummary.total}</div>
                        <div class="d-flex mb-2">
                            <span class="text-danger me-2">${threatSummary.critical} Critical</span>
                            <span class="text-warning">${threatSummary.high} High</span>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-danger" style="width: ${threatSummary.total ? (threatSummary.critical / threatSummary.total * 100) : 0}%" role="progressbar"></div>
                            <div class="progress-bar bg-warning" style="width: ${threatSummary.total ? (threatSummary.high / threatSummary.total * 100) : 0}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Compliance Card
        const { complianceSummary } = this.state;
        const complianceCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Compliance</div>
                        </div>
                        <div class="h1 mb-3">${complianceSummary.score}%</div>
                        <div class="d-flex mb-2">
                            <span class="text-success me-2">${complianceSummary.compliant} Pass</span>
                            <span class="text-danger">${complianceSummary.nonCompliant} Fail</span>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar ${complianceSummary.score >= 80 ? 'bg-success' : 'bg-warning'}" style="width: ${complianceSummary.score}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html`${scoreCard}${devicesCard}${threatsCard}${complianceCard}`;
    }

    renderPostureWidget() {
        const { threatSummary, complianceSummary } = this.state;
        
        return html`
            <div class="card">
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
            <div class="card">
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
        
        return html`
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Software Inventory</h3>
                    <div class="card-actions">
                        <a href="#!/inventory" class="btn btn-sm btn-ghost-secondary">Manage</a>
                    </div>
                </div>
                <div class="card-body">
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
