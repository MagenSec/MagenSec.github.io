/**
 * Dashboard Page - Professional Security-Focused UI
 * Preact + HTM with enhanced mock data
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { SearchableOrgSwitcher } from '../components/SearchableOrgSwitcher.js';

const { html, Component } = window;

export class DashboardPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            data: null,
            error: null
        };
        
        // Subscribe to org changes
        this.unsubscribeOrg = null;
    }

    componentDidMount() {
        // Subscribe to org context changes
        this.unsubscribeOrg = orgContext.onChange((org) => {
            console.log('[Dashboard] Org changed:', org);
            this.loadData(); // Reload data when org changes
        });
        
        this.loadData();
    }
    
    componentWillUnmount() {
        // Cleanup subscription
        if (this.unsubscribeOrg) {
            this.unsubscribeOrg();
        }
    }
    
    handleOrgChange() {
        // Reload dashboard data when org changes
        this.setState({ loading: true, error: null });
        this.loadData();
    }

    handleScanNow() {
        // TODO: Trigger scan for current org's devices
        alert('Scan triggered! This will be implemented when the API is ready.');
    }

    async loadData() {
        try {
            const user = auth.getUser();
            console.log('[Dashboard-v2] User:', user);
            
            if (!user || !user.sessionToken) {
                console.error('[Dashboard-v2] Not authenticated or no session token');
                throw new Error('Not authenticated');
            }

            // Get orgId from user session or org context
            const currentOrg = orgContext.getCurrentOrg();
            const session = auth.getSession();
            const orgId = currentOrg?.orgId || session?.orgId || user.email;
            
            console.log('[Dashboard-v2] Loading data for orgId:', orgId);
            console.log('[Dashboard-v2] Session token present:', !!user.sessionToken);

            this.setState({ loading: true, error: null });

            // Call real dashboard API
            console.log('[Dashboard-v2] Calling API...');
            const response = await api.getDashboardData(orgId);
            console.log('[Dashboard-v2] API response:', response);
            
            if (!response.success) {
                throw new Error(response.message || 'Failed to load dashboard data');
            }

            // Transform API response to expected format
            const gradeValue = response.data.grade || response.data.securityGrade || '?';
            const alertsValue = response.data.alerts || response.data.recentAlerts || [];
            const devicesValue = response.data.recentDevices || [];

            const data = {
                // Security Overview
                securityScore: response.data.securityScore,
                grade: gradeValue,
                lastScan: response.data.lastScan,
                nextScan: response.data.nextScan,
                
                // Quick Stats
                devices: response.data.devices,
                threats: response.data.threats,
                compliance: response.data.compliance,
                
                // Security Alerts
                alerts: alertsValue,
                
                // Recent Devices
                recentDevices: devicesValue
            };
            
            console.log('[Dashboard-v2] Transformed data:', data);
            this.setState({ data, loading: false });
        } catch (error) {
            console.error('[Dashboard-v2] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    render() {
        const { html } = window;
        const { loading, data, error } = this.state;
        const user = auth.getUser();

        return html`
            <div class="page">
                <!-- Header -->
                <header class="navbar navbar-expand-md navbar-dark bg-primary">
                    <div class="container-xl">
                        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu">
                            <span class="navbar-toggler-icon"></span>
                        </button>
                        <h1 class="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">
                            <a href="#!/dashboard" onclick=${(e) => { e.preventDefault(); window.page('/dashboard'); }}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-white" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
                                    <circle cx="12" cy="11" r="1" />
                                    <line x1="12" y1="12" x2="12" y2="14.5" />
                                </svg>
                            </a>
                            <span class="text-white ms-2">MagenSec</span>
                        </h1>
                        <div class="navbar-nav flex-row order-md-last">
                            <div class="d-none d-md-flex me-3">
                                <${SearchableOrgSwitcher} onOrgChange=${() => this.handleOrgChange()} />
                            </div>
                            <div class="nav-item dropdown">
                                <a href="#" class="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown" aria-label="Open user menu">
                                    <span class="avatar avatar-sm" style="background-image: url(https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || user?.email || 'User')}&background=random)"></span>
                                    <div class="d-none d-xl-block ps-2">
                                        <div class="text-white small">${user?.name || user?.email}</div>
                                        <div class="mt-1 small text-white-50">Welcome back</div>
                                    </div>
                                </a>
                                <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                                    <a href="#!/devices" onclick=${(e) => { e.preventDefault(); window.page('/devices'); }} class="dropdown-item">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                        Devices
                                    </a>
                                    <a href="#!/analyst" onclick=${(e) => { e.preventDefault(); window.page('/analyst'); }} class="dropdown-item">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8" /><path d="M10 16v4" /><path d="M14 16v4" /></svg>
                                        AI Analyst
                                    </a>
                                    <div class="dropdown-divider"></div>
                                    <a href="#" onclick=${(e) => { e.preventDefault(); auth.logout(); }} class="dropdown-item text-danger">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></svg>
                                        Logout
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="collapse navbar-collapse" id="navbar-menu">
                            <div class="d-flex flex-column flex-md-row flex-fill align-items-stretch align-items-md-center">
                                <ul class="navbar-nav">
                                    <li class="nav-item active">
                                        <a class="nav-link" href="#!/dashboard" onclick=${(e) => { e.preventDefault(); window.page('/dashboard'); }}>
                                            <span class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="5 12 3 12 12 3 21 12 19 12" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /></svg>
                                            </span>
                                            <span class="nav-link-title">Dashboard</span>
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" href="#!/devices" onclick=${(e) => { e.preventDefault(); window.page('/devices'); }}>
                                            <span class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                            </span>
                                            <span class="nav-link-title">Devices</span>
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" href="#!/analyst" onclick=${(e) => { e.preventDefault(); window.page('/analyst'); }}>
                                            <span class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M8 20h8" /><path d="M10 16v4" /><path d="M14 16v4" /></svg>
                                            </span>
                                            <span class="nav-link-title">AI Analyst</span>
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" href="#!/security-dashboard" onclick=${(e) => { e.preventDefault(); window.page('/security-dashboard'); }}>
                                            <span class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /><circle cx="12" cy="11" r="1" /><line x1="12" y1="12" x2="12" y2="14.5" /></svg>
                                            </span>
                                            <span class="nav-link-title">Security Dashboard</span>
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <button class="nav-link" onclick=${() => this.handleScanNow()}>
                                            <span class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                            </span>
                                            <span class="nav-link-title">Scan Now</span>
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Content -->
                <div class="page-wrapper">
                    <div class="page-body">
                        <div class="container-xl">
                            ${loading ? this.renderLoading() : error ? this.renderError(error) : this.renderDashboard(data)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderLoading() {
        const { html } = window;
        return html`
            <div class="row row-cards">
                <!-- Skeleton for Security Score -->
                <div class="col-12">
                    <div class="card placeholder-glow">
                        <div class="card-body">
                            <div class="placeholder col-3 mb-3"></div>
                            <div class="placeholder col-12" style="height: 80px;"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Skeleton for Stats Grid -->
                ${[1,2,3,4].map(() => html`
                    <div class="col-sm-6 col-lg-3">
                        <div class="card placeholder-glow">
                            <div class="card-body">
                                <div class="placeholder col-6 mb-3"></div>
                                <div class="placeholder col-8" style="height: 32px;"></div>
                            </div>
                        </div>
                    </div>
                `)}
                
                <!-- Skeleton for Alerts -->
                <div class="col-12">
                    <div class="card placeholder-glow">
                        <div class="card-header">
                            <div class="placeholder col-4"></div>
                        </div>
                        <div class="card-body">
                            ${[1,2,3].map(() => html`
                                <div class="placeholder col-12 mb-2" style="height: 60px;"></div>
                            `)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderError(error) {
        const { html } = window;
        return html`
            <div class="empty">
                <div class="empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-danger" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                </div>
                <p class="empty-title">Error Loading Dashboard</p>
                <p class="empty-subtitle text-muted">${error}</p>
                <div class="empty-action">
                    <button 
                        onclick=${() => this.loadData()}
                        class="btn btn-danger"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        `;
    }

    renderDashboard(data) {
        const { html } = window;
        
        // If no devices, show empty state
        if (data.devices.total === 0) {
            return this.renderEmptyState();
        }
        
        return html`
            <div class="row row-cards">
                <!-- Security Score Card -->
                ${this.renderSecurityScore(data)}
                
                <!-- Quick Stats Grid -->
                ${this.renderStatsGrid(data)}
                
                <!-- Security Alerts and Device Status (Side by Side) -->
                <div class="col-md-6">
                    ${this.renderAlerts(data.alerts)}
                </div>
                <div class="col-md-6">
                    ${this.renderRecentDevices(data.recentDevices)}
                </div>
            </div>
        `;
    }

    renderEmptyState() {
        const { html } = window;
        return html`
            <div class="empty">
                <div class="empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-primary" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>
                </div>
                <p class="empty-title">Get Started with MagenSec</p>
                <p class="empty-subtitle text-muted">
                    Install the agent on your first device to start monitoring security posture and vulnerabilities.
                </p>
                <div class="empty-action">
                    <button class="btn btn-primary" onclick=${() => window.open('https://magensec.short.gy/x64', '_blank')}>
                        Download Windows Agent (x64)
                    </button>
                    <button class="btn btn-secondary ms-2" onclick=${() => window.open('https://magensec.short.gy/arm64', '_blank')}>
                        Download Windows Agent (ARM64)
                    </button>
                    <button class="btn btn-outline-secondary ms-2" onclick=${() => window.open('https://magensec.gigabits.co.in/', '_blank')}>
                        View Documentation
                    </button>
                </div>
            </div>
        `;
    }

    renderSecurityScore(data) {
        const { html } = window;
        const { securityScore, grade, lastScan, nextScan } = data;
        
        return html`
            <div class="col-12 mb-3">
                <div class="card bg-primary text-white">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-auto d-none d-md-block">
                                <div class="avatar avatar-xl bg-white text-primary">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                        <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
                                        <circle cx="12" cy="11" r="1" />
                                        <line x1="12" y1="12" x2="12" y2="14.5" />
                                    </svg>
                                </div>
                            </div>
                            <div class="col">
                                <div class="text-white-50 mb-2">Overall Security Score</div>
                                <div class="h1 mb-0">${securityScore}/100 <span class="h2">(Grade: ${grade})</span></div>
                                <div class="mt-2 text-white-50">
                                    <small>Last Scan: ${lastScan}</small>
                                    <small class="ms-4">Next Scan: ${nextScan}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderStatsGrid(data) {
        const { html } = window;
    const { devices, threats, compliance } = data;
    // Derive warnings as medium+low, critical already separate
    const warningCount = (threats.medium || 0) + (threats.low || 0);
        
        return html`
            <!-- Active Devices -->
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-auto">
                                <span class="avatar bg-primary-lt">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                </span>
                            </div>
                            <div class="col">
                                <div class="font-weight-medium">${devices.active}/${devices.total}</div>
                                <div class="text-muted">Active Devices</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Critical Threats -->
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-auto">
                                <span class="avatar bg-danger-lt">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" /></svg>
                                </span>
                            </div>
                            <div class="col">
                                <div class="font-weight-medium">${threats.critical}</div>
                                <div class="text-muted">Critical Threats</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Warnings -->
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-auto">
                                <span class="avatar bg-warning-lt">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                </span>
                            </div>
                            <div class="col">
                                <div class="font-weight-medium">${warningCount}</div>
                                <div class="text-muted">Warnings</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Compliance -->
            <div class="col-sm-6 col-lg-3">
                <div class="card card-sm">
                    <div class="card-body">
                        <div class="row align-items-center">
                            <div class="col-auto">
                                <span class="avatar bg-success-lt">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                                </span>
                            </div>
                            <div class="col">
                                <div class="font-weight-medium">${compliance.score}%</div>
                                <div class="text-muted">${compliance.compliant}/${compliance.total} Resources</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderAlerts(alerts) {
        const { html } = window;
        
        if (!alerts || alerts.length === 0) {
            return html`
                <div class="card">
                    <div class="empty">
                        <div class="empty-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon text-success" width="48" height="48" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2l4 -4" /></svg>
                        </div>
                        <p class="empty-title">All Clear - No Security Alerts</p>
                        <p class="empty-subtitle text-muted">Your devices are secure and up-to-date.</p>
                    </div>
                </div>
            `;
        }
        
        return html`
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-danger" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>
                        Security Alerts
                        <span class="badge bg-danger text-white ms-2">${alerts.length}</span>
                    </h3>
                    <div class="card-actions">
                        <a href="#" class="btn btn-primary btn-sm">View All</a>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${alerts.map(alert => this.renderAlert(alert))}
                </div>
            </div>
        `;
    }

    renderAlert(alert) {
        const { html } = window;
        const severityConfig = {
            critical: { color: 'danger', label: 'CRITICAL' },
            high: { color: 'warning', label: 'HIGH' },
            medium: { color: 'info', label: 'MEDIUM' },
            low: { color: 'secondary', label: 'LOW' }
        };
        const sevKey = (alert.severity || '').toLowerCase();
        const config = severityConfig[sevKey] || severityConfig.low;
        
        return html`
            <div class="list-group-item">
                <div class="row align-items-center">
                    <div class="col-auto">
                        <span class="badge bg-${config.color} text-white">${config.label}</span>
                    </div>
                    <div class="col">
                        <div class="text-truncate">
                            <strong>${alert.title}</strong>
                        </div>
                        <div class="text-muted text-truncate mt-1">${alert.description}</div>
                        <div class="text-muted small mt-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                            ${alert.device}
                            <span class="ms-3">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-inline" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>
                                ${alert.detected}
                            </span>
                        </div>
                    </div>
                    <div class="col-auto">
                        <button class="btn btn-sm btn-outline-primary">Remediate</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentDevices(devices) {
        const { html } = window;
        
        return html`
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-primary" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                        Device Status
                    </h3>
                    <div class="card-actions">
                        <a href="#!/devices" class="btn btn-primary btn-sm">View All</a>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${devices.map(device => this.renderDeviceRow(device))}
                </div>
            </div>
        `;
    }

    renderDeviceRow(device) {
        const { html } = window;
        const statusConfig = {
            active: { color: 'success', text: 'Active' },
            disabled: { color: 'warning', text: 'Disabled' },
            blocked: { color: 'danger', text: 'Blocked' }
        };
        const config = statusConfig[device.status] || statusConfig.active;
        
        return html`
            <div class="list-group-item">
                <div class="row align-items-center">
                    <div class="col-auto">
                        <span class="avatar bg-primary-lt">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                        </span>
                    </div>
                    <div class="col">
                        <div class="text-truncate">
                            <strong>${device.name}</strong>
                        </div>
                        <div class="text-muted small mt-1">
                            <span class="badge bg-${config.color} text-white me-2">${config.text}</span>
                            ${device.threats > 0 ? html`<span class="badge bg-danger text-white">${device.threats} threat${device.threats > 1 ? 's' : ''}</span>` : ''}
                        </div>
                        <div class="text-muted small">Last seen: ${device.lastSeen}</div>
                    </div>
                    <div class="col-auto">
                        <a href="#" class="btn btn-sm btn-outline-primary">Details</a>
                    </div>
                </div>
            </div>
        `;
    }
}
