/**
 * Unified Dashboard - Adaptive layout for all user roles
 * Role-based widgets: Individual, Business Admin, Security Analyst, Site Admin
 * Uses existing Security Report API, no backend changes
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
            securityReport: null,
            deviceStats: null,
            licenseInfo: null,
            recentAlerts: []
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadDashboardData());
        this.loadDashboardData();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
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

            // Load data based on role
            await Promise.all([
                this.loadSecurityOverview(),
                this.loadDeviceStats(),
                this.loadLicenseInfo()
            ]);

            this.setState({ loading: false });
        } catch (error) {
            console.error('[UnifiedDashboard] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    async loadSecurityOverview() {
        try {
            const currentOrg = orgContext.getCurrentOrg();
            const user = auth.getUser();
            const orgId = currentOrg?.orgId || user.email;
            
            // Use existing Security Report API
            const token = auth.getToken();
            const today = this.formatDate(new Date());
            const response = await fetch(
                `${config.API_BASE}/api/analyst/reports/${orgId}/historical/${today}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                this.setState({ securityReport: data });
            } else if (response.status !== 404) {
                // 404 means no report yet (expected), other errors are real problems
                console.warn('[UnifiedDashboard] Security report failed:', response.status);
            }
        } catch (error) {
            console.warn('[UnifiedDashboard] Security overview failed:', error);
        }
    }

    async loadDeviceStats() {
        try {
            const currentOrg = orgContext.getCurrentOrg();
            const user = auth.getUser();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.get(`/api/orgs/${orgId}/devices`);
            
            if (response.success) {
                this.setState({ deviceStats: this.computeDeviceStats(response.data || []) });
            }
        } catch (error) {
            console.warn('[UnifiedDashboard] Device stats failed:', error);
        }
    }

    async loadLicenseInfo() {
        try {
            const currentOrg = orgContext.getCurrentOrg();
            const user = auth.getUser();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.get(`/api/orgs/${orgId}/licenses`);
            
            if (response.success && response.data?.length > 0) {
                this.setState({ licenseInfo: response.data[0] }); // Use first active license
            }
        } catch (error) {
            console.warn('[UnifiedDashboard] License info failed:', error);
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    computeDeviceStats(devices) {
        const total = devices.length;
        const active = devices.filter(d => d.state === 'Active').length;
        const disabled = devices.filter(d => d.state === 'Disabled').length;
        const blocked = devices.filter(d => d.state === 'Blocked').length;
        const criticalCVEs = devices.reduce((sum, d) => sum + (d.criticalCVECount || 0), 0);
        
        return { total, active, disabled, blocked, criticalCVEs };
    }

    getUserRole() {
        const { user } = this.state;
        if (!user) return 'Individual';
        
        if (user.userType === 'SiteAdmin') return 'SiteAdmin';
        if (user.userType === 'BusinessAdmin') return 'BusinessAdmin';
        return 'Individual';
    }

    getRiskScore() {
        const { securityReport } = this.state;
        if (!securityReport?.summary?.overallRiskScore) return null;
        
        const score = securityReport.summary.overallRiskScore;
        return Math.round(score);
    }

    getRiskColor(score) {
        if (score === null) return 'secondary';
        if (score >= 80) return 'danger';
        if (score >= 60) return 'warning';
        if (score >= 40) return 'info';
        return 'success';
    }

    render() {
        const { loading, error, user, deviceStats, licenseInfo, securityReport } = this.state;
        
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
                            <h2 class="page-title">Security Dashboard</h2>
                            <div class="text-muted">Welcome back${user ? `, ${user.email}` : ''}</div>
                        </div>
                        <div class="col-auto ms-auto">
                            ${this.renderQuickActions()}
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <!-- KPI Cards -->
                    <div class="row row-deck row-cards mb-3">
                        ${this.renderKPICards(role, riskScore, riskColor)}
                    </div>

                    <!-- Role-specific content -->
                    <div class="row row-deck row-cards">
                        ${this.renderRoleContent(role)}
                    </div>
                </div>
            </div>
        `;
    }

    renderQuickActions() {
        const role = this.getUserRole();
        
        return html`
            <div class="btn-list">
                ${role !== 'Individual' && html`
                    <a href="#!/security/response" class="btn btn-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        Response Actions
                    </a>
                `}
                <a href="#!/analyst" class="btn">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                    Investigate
                </a>
                <a href="#!/reports/security" class="btn">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><line x1="9" y1="9" x2="10" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /></svg>
                    Download Report
                </a>
            </div>
        `;
    }

    renderKPICards(role, riskScore, riskColor) {
        const { deviceStats, licenseInfo } = this.state;
        
        // Security Score Card
        const scoreCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Risk Score</div>
                            <div class="ms-auto lh-1">
                                <div class="dropdown">
                                    <a class="dropdown-toggle text-muted" href="#" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">Last 24 hours</a>
                                </div>
                            </div>
                        </div>
                        <div class="h1 mb-3">
                            ${riskScore !== null ? html`<span class="text-${riskColor}">${riskScore}</span>` : html`<span class="text-muted">--</span>`}
                        </div>
                        <div class="d-flex mb-2">
                            <div>${riskScore !== null ? (riskScore >= 70 ? 'High Risk' : riskScore >= 40 ? 'Medium Risk' : 'Low Risk') : 'No data'}</div>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-${riskColor}" style="width: ${riskScore || 0}%" role="progressbar"></div>
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
                            <div class="subheader">Endpoints</div>
                        </div>
                        <div class="h1 mb-3">${deviceStats?.total || 0}</div>
                        <div class="d-flex mb-2">
                            <div>
                                <span class="badge bg-success me-1">${deviceStats?.active || 0}</span> Active
                                ${deviceStats?.disabled > 0 && html`<span class="badge bg-secondary ms-2">${deviceStats.disabled}</span> Disabled`}
                            </div>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-primary" style="width: ${deviceStats?.total ? (deviceStats.active / deviceStats.total * 100) : 0}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // License Card
        const licenseCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">License</div>
                        </div>
                        <div class="h1 mb-3">
                            ${licenseInfo ? html`
                                ${licenseInfo.licenseType === 'Business' ? html`${licenseInfo.seats} seats` : '5 devices'}
                            ` : html`<span class="text-muted">--</span>`}
                        </div>
                        <div class="d-flex mb-2">
                            <div>
                                ${licenseInfo?.licenseType === 'Business' && html`
                                    ${licenseInfo.remainingCredits || 0} credits remaining
                                `}
                                ${licenseInfo?.licenseType === 'Personal' && html`
                                    Personal license
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Alerts Card
        const alertsCard = html`
            <div class="col-sm-6 col-lg-3">
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Critical Items</div>
                        </div>
                        <div class="h1 mb-3 text-warning">${deviceStats?.criticalCVEs || 0}</div>
                        <div class="d-flex mb-2">
                            <div>Critical vulnerabilities</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html`${scoreCard}${devicesCard}${licenseCard}${alertsCard}`;
    }

    renderRoleContent(role) {
        const { securityReport, deviceStats } = this.state;
        
        // Security Overview Widget
        const securityWidget = html`
            <div class="col-lg-8">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Security Overview</h3>
                        <div class="card-actions">
                            <a href="#!/posture" class="btn btn-sm btn-primary">View Full Report</a>
                        </div>
                    </div>
                    <div class="card-body">
                        ${securityReport?.summary ? html`
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="mb-3">
                                        <div class="text-muted">Total Vulnerabilities</div>
                                        <div class="h2">${securityReport.summary.totalVulnerabilities || 0}</div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="mb-3">
                                        <div class="text-muted">Critical CVEs</div>
                                        <div class="h2 text-danger">${securityReport.summary.criticalCount || 0}</div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="mb-3">
                                        <div class="text-muted">High Severity</div>
                                        <div class="h2 text-warning">${securityReport.summary.highCount || 0}</div>
                                    </div>
                                </div>
                            </div>
                            ${securityReport.summary.topRecommendations?.length > 0 && html`
                                <div class="mt-3">
                                    <div class="text-muted mb-2">Top Recommendations</div>
                                    <ul class="list-unstyled">
                                        ${securityReport.summary.topRecommendations.slice(0, 3).map(rec => html`
                                            <li class="mb-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline text-warning" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>
                                                ${rec}
                                            </li>
                                        `)}
                                    </ul>
                                </div>
                            `}
                        ` : html`
                            <div class="empty">
                                <div class="empty-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 8l.01 0" /><path d="M11 12l1 0l0 4l1 0" /></svg>
                                </div>
                                <p class="empty-title">No security report available</p>
                                <p class="empty-subtitle text-muted">Security reports are generated daily</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        // Quick Links Widget
        const quickLinksWidget = html`
            <div class="col-lg-4">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Quick Access</h3>
                    </div>
                    <div class="list-group list-group-flush">
                        <a href="#!/devices" class="list-group-item list-group-item-action">
                            <div class="d-flex">
                                <div>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></svg>
                                    Manage Endpoints
                                </div>
                                <div class="ms-auto">
                                    <span class="badge bg-primary badge-pill">${deviceStats?.total || 0}</span>
                                </div>
                            </div>
                        </a>
                        <a href="#!/inventory" class="list-group-item list-group-item-action">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="5" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="16" r="1" /><path d="M8 11v-4a4 4 0 0 1 8 0v4" /></svg>
                            Software Inventory
                        </a>
                        <a href="#!/trends" class="list-group-item list-group-item-action">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
                            Trends & Analytics
                        </a>
                        ${role !== 'Individual' && html`
                            <a href="#!/members" class="list-group-item list-group-item-action">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg>
                                Team Access
                            </a>
                        `}
                        <a href="#!/licenses" class="list-group-item list-group-item-action">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="5" y="11" width="14" height="10" rx="2" /><circle cx="12" cy="16" r="1" /><path d="M8 11v-5a4 4 0 0 1 8 0v5" /></svg>
                            License Management
                        </a>
                    </div>
                </div>
            </div>
        `;

        return html`${securityWidget}${quickLinksWidget}`;
    }
}

// For direct page rendering
if (document.getElementById('page-root')) {
    window.preactRender(html`<${UnifiedDashboardPage} />`, document.getElementById('page-root'));
}
