/**
 * Diagnostics Page - Admin Business Intelligence
 * Problem devices, problem orgs, revenue leaks, system health
 * Route: #!/siteadmin/diagnostics
 */

import { api } from '@api';
import { formatRelativeTime, formatNumber } from '@utils/dataHelpers.js';
import { StatusDot } from '@components/shared/StatusBadge.js';

const { html, Component } = window;

export class DiagnosticsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            overview: null,
            activeView: 'devices', // devices, orgs, revenue, health
            problemDevices: [],
            problemOrgs: [],
            revenueLeaks: [],
            systemHealth: null,
            filters: {
                minFailures: 10,
                minOfflineDays: 30,
                minErrorRate: 50,
                minMonthlyLoss: 100
            }
        };
    }

    async componentDidMount() {
        await this.loadDiagnostics();
        // Auto-refresh every 5 minutes
        this.refreshInterval = setInterval(() => this.loadDiagnostics(), 5 * 60 * 1000);
    }

    componentWillUnmount() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    async loadDiagnostics() {
        try {
            this.setState({ loading: true, error: null });

            // Load overview metrics using unified API
            const overviewRes = await api.get('/api/v1/admin/diagnostics?category=overview');

            // Load initial data for active view
            let data = {};
            if (this.state.activeView === 'devices') {
                data.problemDevices = await this.loadProblemDevices();
            } else if (this.state.activeView === 'orgs') {
                data.problemOrgs = await this.loadProblemOrgs();
            } else if (this.state.activeView === 'revenue') {
                data.revenueLeaks = await this.loadRevenueLeaks();
            } else if (this.state.activeView === 'health') {
                data.systemHealth = await this.loadSystemHealth();
            }

            this.setState({
                loading: false,
                overview: overviewRes.data,
                ...data
            });
        } catch (error) {
            console.error('Failed to load diagnostics:', error);
            this.setState({
                loading: false,
                error: error.message || 'Failed to load diagnostics data'
            });
        }
    }

    async loadProblemDevices() {
        const { minFailures, minOfflineDays } = this.state.filters;
        const response = await api.get(`/api/v1/admin/diagnostics?category=problem-devices&minFailures=${minFailures}&minOfflineDays=${minOfflineDays}`);
        return response.data.devices || [];
    }

    async loadProblemOrgs() {
        const { minErrorRate } = this.state.filters;
        const response = await api.get(`/api/v1/admin/diagnostics?category=problem-orgs&minErrorRate=${minErrorRate}`);
        return response.data.orgs || [];
    }

    async loadRevenueLeaks() {
        const { minMonthlyLoss } = this.state.filters;
        const response = await api.get(`/api/v1/admin/diagnostics?category=revenue-leaks&minMonthlyLoss=${minMonthlyLoss}`);
        return response.data.leaks || [];
    }

    async loadSystemHealth() {
        const response = await api.get('/api/v1/admin/diagnostics?category=system-health');
        return response.data;
    }

    async handleViewChange(view) {
        this.setState({ activeView: view });
        
        // Load data for new view
        try {
            let data = {};
            if (view === 'devices' && !this.state.problemDevices.length) {
                data.problemDevices = await this.loadProblemDevices();
            } else if (view === 'orgs' && !this.state.problemOrgs.length) {
                data.problemOrgs = await this.loadProblemOrgs();
            } else if (view === 'revenue' && !this.state.revenueLeaks.length) {
                data.revenueLeaks = await this.loadRevenueLeaks();
            } else if (view === 'health' && !this.state.systemHealth) {
                data.systemHealth = await this.loadSystemHealth();
            }
            
            if (Object.keys(data).length > 0) {
                this.setState(data);
            }
        } catch (error) {
            console.error('Failed to load view data:', error);
        }
    }

    renderKPICards() {
        const { overview } = this.state;
        if (!overview) return null;

        return html`
            <div class="row row-cards mb-3">
                <div class="col-sm-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-auto">
                                    <span class="bg-red text-white avatar">
                                        <i class="ti ti-alert-triangle"></i>
                                    </span>
                                </div>
                                <div class="col">
                                    <div class="font-weight-medium">
                                        ${overview.problemDevicesCount || 0} Problem Devices
                                    </div>
                                    <div class="text-muted">
                                        High failures or offline
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-auto">
                                    <span class="bg-orange text-white avatar">
                                        <i class="ti ti-building"></i>
                                    </span>
                                </div>
                                <div class="col">
                                    <div class="font-weight-medium">
                                        ${overview.problemOrgsCount || 0} Problem Orgs
                                    </div>
                                    <div class="text-muted">
                                        High error rates
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-auto">
                                    <span class="bg-yellow text-white avatar">
                                        <i class="ti ti-cash"></i>
                                    </span>
                                </div>
                                <div class="col">
                                    <div class="font-weight-medium">
                                        $${formatNumber(overview.monthlyRevenueLeak || 0)} Revenue Leak
                                    </div>
                                    <div class="text-muted">
                                        Monthly potential loss
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card card-sm">
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-auto">
                                    <span class="bg-green text-white avatar">
                                        <i class="ti ti-heart-rate-monitor"></i>
                                    </span>
                                </div>
                                <div class="col">
                                    <div class="font-weight-medium">
                                        ${overview.systemHealthScore || 0}% Health
                                    </div>
                                    <div class="text-muted">
                                        Platform health score
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTabs() {
        const { activeView } = this.state;
        
        return html`
            <ul class="nav nav-tabs mb-3">
                <li class="nav-item">
                    <a 
                        class="nav-link ${activeView === 'devices' ? 'active' : ''}" 
                        href="#" 
                        onClick=${(e) => { e.preventDefault(); this.handleViewChange('devices'); }}
                    >
                        <i class="ti ti-device-desktop me-2"></i>
                        Problem Devices
                    </a>
                </li>
                <li class="nav-item">
                    <a 
                        class="nav-link ${activeView === 'orgs' ? 'active' : ''}" 
                        href="#" 
                        onClick=${(e) => { e.preventDefault(); this.handleViewChange('orgs'); }}
                    >
                        <i class="ti ti-building me-2"></i>
                        Problem Orgs
                    </a>
                </li>
                <li class="nav-item">
                    <a 
                        class="nav-link ${activeView === 'revenue' ? 'active' : ''}" 
                        href="#" 
                        onClick=${(e) => { e.preventDefault(); this.handleViewChange('revenue'); }}
                    >
                        <i class="ti ti-cash me-2"></i>
                        Revenue Leaks
                    </a>
                </li>
                <li class="nav-item">
                    <a 
                        class="nav-link ${activeView === 'health' ? 'active' : ''}" 
                        href="#" 
                        onClick=${(e) => { e.preventDefault(); this.handleViewChange('health'); }}
                    >
                        <i class="ti ti-heart-rate-monitor me-2"></i>
                        System Health
                    </a>
                </li>
            </ul>
        `;
    }

    renderProblemDevicesTable() {
        const { problemDevices, loading } = this.state;

        if (loading) {
            return html`<div class="text-center py-4"><div class="spinner-border"></div></div>`;
        }

        if (!problemDevices || problemDevices.length === 0) {
            return html`
                <div class="empty">
                    <div class="empty-icon">
                        <i class="ti ti-check icon" style="font-size: 48px;"></i>
                    </div>
                    <p class="empty-title">No problem devices</p>
                    <p class="empty-subtitle text-muted">All devices are healthy</p>
                </div>
            `;
        }

        return html`
            <div class="table-responsive">
                <table class="table table-vcenter card-table">
                    <thead>
                        <tr>
                            <th>Device</th>
                            <th>Organization</th>
                            <th>Issue</th>
                            <th>Last Seen</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${problemDevices.map(device => html`
                            <tr>
                                <td>
                                    <a href="#!/devices/${device.deviceId}">${device.deviceName}</a>
                                </td>
                                <td>${device.orgName}</td>
                                <td>
                                    <span class="badge bg-${device.issueType === 'High Failures' ? 'danger' : 'warning'}">
                                        ${device.issueType}
                                    </span>
                                </td>
                                <td>${formatRelativeTime(device.lastSeen)}</td>
                                <td>
                                    <a href="#!/devices/${device.deviceId}" class="btn btn-sm btn-primary">
                                        View
                                    </a>
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderProblemOrgsTable() {
        const { problemOrgs, loading } = this.state;

        if (loading) {
            return html`<div class="text-center py-4"><div class="spinner-border"></div></div>`;
        }

        if (!problemOrgs || problemOrgs.length === 0) {
            return html`
                <div class="empty">
                    <div class="empty-icon">
                        <i class="ti ti-check icon" style="font-size: 48px;"></i>
                    </div>
                    <p class="empty-title">No problem organizations</p>
                    <p class="empty-subtitle text-muted">All organizations are healthy</p>
                </div>
            `;
        }

        return html`
            <div class="table-responsive">
                <table class="table table-vcenter card-table">
                    <thead>
                        <tr>
                            <th>Organization</th>
                            <th>Error Rate</th>
                            <th>Devices</th>
                            <th>License Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${problemOrgs.map(org => html`
                            <tr>
                                <td>${org.orgName}</td>
                                <td>
                                    <span class="badge bg-danger">
                                        ${org.errorRate}%
                                    </span>
                                </td>
                                <td>${org.deviceCount} devices</td>
                                <td>
                                    <span class="badge bg-${org.licenseStatus === 'Active' ? 'success' : 'warning'}">
                                        ${org.licenseStatus}
                                    </span>
                                </td>
                                <td>
                                    <a href="#!/siteadmin" class="btn btn-sm btn-primary">
                                        Manage
                                    </a>
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderRevenueLeaksTable() {
        const { revenueLeaks, loading } = this.state;

        if (loading) {
            return html`<div class="text-center py-4"><div class="spinner-border"></div></div>`;
        }

        if (!revenueLeaks || revenueLeaks.length === 0) {
            return html`
                <div class="empty">
                    <div class="empty-icon">
                        <i class="ti ti-check icon" style="font-size: 48px;"></i>
                    </div>
                    <p class="empty-title">No revenue leaks detected</p>
                    <p class="empty-subtitle text-muted">All billing is accurate</p>
                </div>
            `;
        }

        return html`
            <div class="table-responsive">
                <table class="table table-vcenter card-table">
                    <thead>
                        <tr>
                            <th>Organization</th>
                            <th>Issue Type</th>
                            <th>Monthly Loss</th>
                            <th>Details</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${revenueLeaks.map(leak => html`
                            <tr>
                                <td>${leak.orgName}</td>
                                <td>
                                    <span class="badge bg-warning">
                                        ${leak.issueType}
                                    </span>
                                </td>
                                <td class="text-danger font-weight-bold">
                                    $${formatNumber(leak.monthlyLoss)}
                                </td>
                                <td>${leak.details}</td>
                                <td>
                                    <a href="#!/siteadmin" class="btn btn-sm btn-primary">
                                        Fix
                                    </a>
                                </td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderSystemHealthView() {
        const { systemHealth, loading } = this.state;

        if (loading) {
            return html`<div class="text-center py-4"><div class="spinner-border"></div></div>`;
        }

        if (!systemHealth) {
            return html`<div class="text-muted">No health data available</div>`;
        }

        return html`
            <div class="row row-cards">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Device Health</h3>
                        </div>
                        <div class="card-body">
                            <div class="h1 mb-3">${systemHealth.deviceHealthScore}%</div>
                            <div class="progress progress-sm">
                                <div class="progress-bar bg-${systemHealth.deviceHealthScore >= 80 ? 'success' : 'warning'}" 
                                     style="width: ${systemHealth.deviceHealthScore}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Telemetry Success Rate</h3>
                        </div>
                        <div class="card-body">
                            <div class="h1 mb-3">${systemHealth.telemetrySuccessRate}%</div>
                            <div class="progress progress-sm">
                                <div class="progress-bar bg-${systemHealth.telemetrySuccessRate >= 90 ? 'success' : 'warning'}" 
                                     style="width: ${systemHealth.telemetrySuccessRate}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">License Utilization</h3>
                        </div>
                        <div class="card-body">
                            <div class="h2 mb-3">${systemHealth.usedSeats} / ${systemHealth.totalSeats} seats</div>
                            <div class="progress progress-sm">
                                <div class="progress-bar" style="width: ${(systemHealth.usedSeats / systemHealth.totalSeats) * 100}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Platform Status</h3>
                        </div>
                        <div class="card-body">
                            <div class="list-group list-group-flush">
                                <div class="list-group-item">
                                    <div class="row align-items-center">
                                        <div class="col-auto">
                                            <${StatusDot} status="online" />
                                        </div>
                                        <div class="col">
                                            <div>API Endpoints</div>
                                            <div class="text-muted small">All operational</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="list-group-item">
                                    <div class="row align-items-center">
                                        <div class="col-auto">
                                            <${StatusDot} status="online" />
                                        </div>
                                        <div class="col">
                                            <div>Telemetry Ingestion</div>
                                            <div class="text-muted small">${systemHealth.telemetrySuccessRate}% success</div>
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

    render() {
        const { loading, error, activeView } = this.state;

        return html`
            <div class="container-xl">
                <!-- Page header -->
                <div class="page-header d-print-none mb-3">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Site Admin</div>
                            <h2 class="page-title">Diagnostics</h2>
                        </div>
                        <div class="col-auto ms-auto d-print-none">
                            <a href="#!/siteadmin" class="btn btn-secondary">
                                <i class="ti ti-arrow-left me-2"></i>
                                Back to Site Admin
                            </a>
                        </div>
                    </div>
                </div>

                ${error && html`
                    <div class="alert alert-danger">
                        <i class="ti ti-alert-circle me-2"></i>
                        ${error}
                    </div>
                `}

                ${this.renderKPICards()}
                ${this.renderTabs()}

                <div class="card">
                    <div class="card-body">
                        ${activeView === 'devices' ? this.renderProblemDevicesTable() :
                          activeView === 'orgs' ? this.renderProblemOrgsTable() :
                          activeView === 'revenue' ? this.renderRevenueLeaksTable() :
                          activeView === 'health' ? this.renderSystemHealthView() : ''}
                    </div>
                </div>
            </div>
        `;
    }
}
