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
            dashboardData: null,
            deviceStats: { total: 0, active: 0, disabled: 0, blocked: 0 },
            threatSummary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
            complianceSummary: { score: 0, compliant: 0, nonCompliant: 0, total: 0 },
            recentAlerts: [],
            recentDevices: [],
            licenseInfo: null,
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

            // Use the comprehensive dashboard API endpoint
            const orgId = currentOrg?.orgId || user.email;
            const response = await api.getDashboardData(orgId);
            
            if (response.success && response.data) {
                const dashboard = response.data;
                
                // Extract all dashboard sections
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
                    loading: false
                });

                // Also load license info separately for credits display
                await this.loadLicenseInfo();
            } else {
                throw new Error(response.message || response.error || 'Failed to load dashboard data');
            }
        } catch (error) {
            console.error('[UnifiedDashboard] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    async loadLicenseInfo() {
        try {
            const currentOrg = orgContext.getCurrentOrg();
            const user = auth.getUser();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.getLicenses(orgId);
            
            if (response.success) {
                // Ensure data is an array
                const licensesData = Array.isArray(response.data) ? response.data : (response.data?.licenses || []);
                if (licensesData.length > 0) {
                    this.setState({ licenseInfo: licensesData[0] }); // Use first active license
                }
            }
        } catch (error) {
            console.warn('[UnifiedDashboard] License info failed:', error.message);
        }
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this.state.refreshInterval) {
            clearInterval(this.state.refreshInterval);
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    async refreshData() {
        try {
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            const orgId = currentOrg?.orgId || user.email;
            
            const response = await api.getDashboardData(orgId);
            
            if (response.success && response.data) {
                const dashboard = response.data;
                
                this.setState({
                    dashboardData: dashboard,
                    deviceStats: dashboard.devices || this.state.deviceStats,
                    threatSummary: dashboard.threats || this.state.threatSummary,
                    complianceSummary: dashboard.compliance || this.state.complianceSummary,
                    recentAlerts: dashboard.alerts || [],
                    recentDevices: dashboard.recentDevices || [],
                    securityScore: dashboard.securityScore || 0,
                    securityGrade: dashboard.grade || 'N/A',
                    lastScan: dashboard.lastScan || 'Never',
                    nextScan: dashboard.nextScan || 'Pending'
                });
                
                console.log('[UnifiedDashboard] Data refreshed');
            }
        } catch (error) {
            console.warn('[UnifiedDashboard] Refresh failed:', error.message);
        }
    }

    getUserRole() {
        const { user } = this.state;
        if (!user) return 'Individual';
        
        if (user.userType === 'SiteAdmin') return 'SiteAdmin';
        if (user.userType === 'BusinessAdmin') return 'BusinessAdmin';
        return 'Individual';
    }

    getRiskScore() {
        const { securityScore } = this.state;
        return securityScore || 0;
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
                            <div>${riskLabel} - Last scan: ${lastScan}</div>
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
                            <div class="subheader">Endpoints</div>
                        </div>
                        <div class="h1 mb-3">${deviceStats.total}</div>
                        <div class="d-flex mb-2">
                            <div>
                                <span class="badge bg-success me-1">${deviceStats.active}</span> Active
                                ${deviceStats.disabled > 0 && html`<span class="badge bg-secondary ms-2">${deviceStats.disabled}</span> Disabled`}
                                ${deviceStats.blocked > 0 && html`<span class="badge bg-danger ms-2">${deviceStats.blocked}</span> Blocked`}
                            </div>
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
                            <div class="subheader">Threats</div>
                        </div>
                        <div class="h1 mb-3">${threatSummary.total}</div>
                        <div class="d-flex mb-2">
                            <div>
                                ${threatSummary.critical > 0 && html`<span class="badge bg-danger me-1">${threatSummary.critical}</span> Critical`}
                                ${threatSummary.high > 0 && html`<span class="badge bg-warning ms-1">${threatSummary.high}</span> High`}
                                ${threatSummary.total === 0 && html`<span class="text-success">No threats detected</span>`}
                            </div>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-danger" style="width: ${threatSummary.total ? (threatSummary.critical / threatSummary.total * 100) : 0}%" role="progressbar"></div>
                            <div class="progress-bar bg-warning" style="width: ${threatSummary.total ? (threatSummary.high / threatSummary.total * 100) : 0}%" role="progressbar"></div>
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
                                    ${licenseInfo.remainingCredits || 0} credits
                                `}
                                ${licenseInfo?.licenseType === 'Personal' && html`
                                    Personal license
                                `}
                                ${!licenseInfo && html`No license`}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html`${scoreCard}${devicesCard}${threatsCard}${licenseCard}`;
    }

    renderRoleContent(role) {
        const { threatSummary, complianceSummary, recentAlerts, recentDevices, deviceStats } = this.state;
        
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
                        <div class="row">
                            <div class="col-md-6">
                                <h4 class="mb-3">Threats</h4>
                                <div class="row">
                                    <div class="col-6">
                                        <div class="mb-3">
                                            <div class="text-muted">Critical</div>
                                            <div class="h3 text-danger">${threatSummary.critical}</div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="mb-3">
                                            <div class="text-muted">High</div>
                                            <div class="h3 text-warning">${threatSummary.high}</div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="mb-3">
                                            <div class="text-muted">Medium</div>
                                            <div class="h3">${threatSummary.medium}</div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="mb-3">
                                            <div class="text-muted">Low</div>
                                            <div class="h3">${threatSummary.low}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h4 class="mb-3">Compliance</h4>
                                <div class="row">
                                    <div class="col-12">
                                        <div class="mb-3">
                                            <div class="text-muted">Compliance Score</div>
                                            <div class="h2">${complianceSummary.score}%</div>
                                            <div class="progress progress-sm">
                                                <div class="progress-bar ${complianceSummary.score >= 80 ? 'bg-success' : complianceSummary.score >= 60 ? 'bg-warning' : 'bg-danger'}" 
                                                     style="width: ${complianceSummary.score}%" 
                                                     role="progressbar"></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="mb-3">
                                            <div class="text-muted">Compliant</div>
                                            <div class="h3 text-success">${complianceSummary.compliant}</div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="mb-3">
                                            <div class="text-muted">Non-Compliant</div>
                                            <div class="h3 text-danger">${complianceSummary.nonCompliant}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        ${recentAlerts.length > 0 && html`
                            <div class="mt-4">
                                <h4 class="mb-3">Recent Alerts</h4>
                                <div class="list-group list-group-flush">
                                    ${recentAlerts.slice(0, 5).map(alert => html`
                                        <div class="list-group-item">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="badge ${alert.severity === 'critical' ? 'bg-danger' : 
                                                                         alert.severity === 'high' ? 'bg-warning' : 
                                                                         alert.severity === 'warning' ? 'bg-info' : 'bg-secondary'}">
                                                        ${alert.severity}
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <div class="font-weight-medium">${alert.title}</div>
                                                    <div class="text-muted small">${alert.device} - ${alert.detected}</div>
                                                </div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>
                        `}
                        
                        ${threatSummary.total === 0 && recentAlerts.length === 0 && html`
                            <div class="empty mt-4">
                                <div class="empty-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon text-success" width="48" height="48" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /><path d="M9 12l2 2l4 -4" /></svg>
                                </div>
                                <p class="empty-title">No threats detected</p>
                                <p class="empty-subtitle text-muted">Your systems are secure</p>
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
