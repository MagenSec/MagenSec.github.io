import { auth } from '../auth.js';
import { api } from '../api.js';
import { config } from '../config.js';
import { orgContext } from '../orgContext.js';
import { ChartRenderer } from '../components/ChartRenderer.js';

const { html, Component } = window;

/**
 * Security Dashboard - Cached daily/hourly dashboard with smart refresh
 */
export class SecurityDashboardPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            report: null,
            reportId: null,
            generatedAt: null,
            nextRefreshAt: null,
            canRefreshNow: false,
            refreshing: false,
            selectedDate: this.formatDate(new Date())
        };
    }

    componentDidMount() {
        this.loadDashboard();
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    async loadDashboard(date = null) {
        const targetDate = date || this.state.selectedDate;
        const currentOrg = orgContext.getCurrentOrg();
        
        if (!currentOrg) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            const token = auth.getToken();
            const response = await fetch(
                `${config.API_BASE}/api/analyst/reports/${currentOrg.orgId}/historical/${targetDate}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                if (data.Error === 'NOT_FOUND') {
                    // No dashboard for this date - trigger generation
                    this.setState({ 
                        loading: false, 
                        error: `No dashboard report found for ${this.formatDateDisplay(targetDate)}. Click "Generate Dashboard" to create one.`,
                        report: null
                    });
                    return;
                }
                throw new Error(data.Message || 'Failed to load dashboard');
            }

            this.setState({
                loading: false,
                report: data.Report || null,
                reportId: data.ReportId || null,
                generatedAt: data.GeneratedAt ? new Date(data.GeneratedAt) : null,
                nextRefreshAt: data.NextRefreshAt ? new Date(data.NextRefreshAt) : null,
                canRefreshNow: data.CanRefreshNow || false,
                selectedDate: targetDate
            });
        } catch (err) {
            this.setState({ 
                error: err.message || 'Failed to load dashboard', 
                loading: false 
            });
        }
    }

    async refreshDashboard() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg) return;

        this.setState({ refreshing: true, error: null });

        try {
            const token = auth.getToken();
            
            // Trigger new dashboard generation with !dashboard prompt
            const response = await fetch(`${api.baseUrl}/api/analyst/run`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: '!dashboard',
                    waitSeconds: 5 // Short timeout, expect 202
                })
            });

            const data = await response.json();

            if (!data.Success) {
                throw new Error(data.Message || 'Failed to refresh dashboard');
            }

            // If completed inline (unlikely for dashboard), reload
            if (response.status === 200 && data.Report) {
                this.setState({
                    refreshing: false,
                    report: data.Report,
                    reportId: data.ReportId,
                    generatedAt: new Date(),
                    canRefreshNow: false
                });
                return;
            }

            // Otherwise poll for completion
            const reportId = data.ReportId;
            await this.pollForCompletion(reportId);
        } catch (err) {
            this.setState({ 
                error: err.message || 'Failed to refresh dashboard', 
                refreshing: false 
            });
        }
    }

    async pollForCompletion(reportId) {
        const token = auth.getToken();
        const maxAttempts = 30;
        let attempts = 0;

        const poll = async () => {
            if (attempts >= maxAttempts) {
                this.setState({ 
                    error: 'Dashboard generation timed out. Please try again later.', 
                    refreshing: false 
                });
                return;
            }

            attempts++;

            try {
                const response = await fetch(
                    `${api.baseUrl}/api/analyst/reports/${reportId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );

                const data = await response.json();

                if (!data.Success) {
                    throw new Error(data.Message || 'Failed to check report status');
                }

                if (data.Status?.State === 'Completed') {
                    this.setState({
                        refreshing: false,
                        report: data.Report,
                        reportId: reportId,
                        generatedAt: new Date(),
                        canRefreshNow: false
                    });
                    return;
                }

                if (data.Status?.State === 'Failed') {
                    throw new Error(data.Status.Error || 'Report generation failed');
                }

                // Still processing, poll again
                setTimeout(poll, 5000);
            } catch (err) {
                this.setState({ 
                    error: err.message || 'Failed to poll report status', 
                    refreshing: false 
                });
            }
        };

        poll();
    }

    formatDateDisplay(yyyymmdd) {
        const year = yyyymmdd.substring(0, 4);
        const month = yyyymmdd.substring(4, 6);
        const day = yyyymmdd.substring(6, 8);
        return `${year}-${month}-${day}`;
    }

    handleDateChange = (e) => {
        const dateValue = e.target.value; // YYYY-MM-DD from input
        const yyyymmdd = dateValue.replace(/-/g, '');
        this.loadDashboard(yyyymmdd);
    }

    handleLogout = () => {
        auth.logout();
        window.page('/');
    }

    render({ }, { loading, error, report, generatedAt, nextRefreshAt, canRefreshNow, refreshing, selectedDate }) {
        const currentOrg = orgContext.getCurrentOrg();
        const displayDate = selectedDate ? `${selectedDate.substring(0, 4)}-${selectedDate.substring(4, 6)}-${selectedDate.substring(6, 8)}` : '';

        return html`
            <div class="page">
                <!-- Navigation Header -->
                <header class="navbar navbar-expand-md navbar-light sticky-top d-print-none">
                    <div class="container-xl">
                        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu">
                            <span class="navbar-toggler-icon"></span>
                        </button>
                        <h1 class="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">
                            <span>MagenSec</span>
                        </h1>
                        <div class="navbar-nav flex-row order-md-last">
                            <div class="nav-item dropdown">
                                <a href="#" class="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown" aria-label="Open user menu">
                                    <span class="avatar avatar-sm" style="background-image: url(https://ui-avatars.com/api/?name=${encodeURIComponent(auth.getSession()?.user || 'U')}&background=206bc4&color=fff)"></span>
                                    <div class="d-none d-xl-block ps-2">
                                        <div>${auth.getSession()?.user || 'User'}</div>
                                        <div class="mt-1 small text-muted">${currentOrg?.name || currentOrg?.orgId || 'No org selected'}</div>
                                    </div>
                                </a>
                                <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                                    <button class="dropdown-item" onClick=${this.handleLogout}>Logout</button>
                                </div>
                            </div>
                        </div>
                        <div class="collapse navbar-collapse" id="navbar-menu">
                            <div class="d-flex flex-column flex-md-row flex-fill align-items-stretch align-items-md-center">
                                <ul class="navbar-nav">
                                    <li class="nav-item">
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
                                    <li class="nav-item active">
                                        <a class="nav-link" href="#!/security-dashboard" onclick=${(e) => { e.preventDefault(); window.page('/security-dashboard'); }}>
                                            <span class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /><circle cx="12" cy="11" r="1" /><line x1="12" y1="12" x2="12" y2="14.5" /></svg>
                                            </span>
                                            <span class="nav-link-title">Security Dashboard</span>
                                        </a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- Content -->
                <div class="page-wrapper">
                    <div class="page-header d-print-none">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Security Dashboard</h2>
                            <div class="text-secondary mt-1">
                                ${currentOrg ? currentOrg.name || currentOrg.orgId : 'No organization selected'}
                            </div>
                        </div>
                        <div class="col-auto ms-auto d-print-none">
                            <div class="btn-list">
                                <input 
                                    type="date" 
                                    class="form-control d-inline-block w-auto" 
                                    value="${displayDate}"
                                    max="${this.formatDate(new Date()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}"
                                    onChange=${this.handleDateChange}
                                />
                                <button 
                                    class="btn btn-primary" 
                                    onClick=${() => this.refreshDashboard()}
                                    disabled=${!canRefreshNow || refreshing || loading}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-refresh" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"></path>
                                    </svg>
                                    ${refreshing ? 'Refreshing...' : canRefreshNow ? 'Refresh Dashboard' : 'Refresh Disabled'}
                                </button>
                            </div>
                            ${!canRefreshNow && nextRefreshAt && html`
                                <div class="text-secondary mt-2">
                                    <small>Next refresh available: ${nextRefreshAt.toLocaleTimeString()}</small>
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                ${error && html`
                    <div class="alert alert-warning" role="alert">
                        <div class="d-flex">
                            <div>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M12 9v4"></path>
                                    <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"></path>
                                    <path d="M12 16h.01"></path>
                                </svg>
                            </div>
                            <div>
                                <h4 class="alert-title">Notice</h4>
                                <div class="text-secondary">${error}</div>
                            </div>
                        </div>
                    </div>
                `}

                ${loading && html`
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <div class="text-secondary mt-3">Loading dashboard...</div>
                    </div>
                `}

                ${!loading && !error && report && html`
                    <div class="row row-deck row-cards">
                        ${generatedAt && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-secondary">
                                            <small>Generated: ${generatedAt.toLocaleString()}</small>
                                            ${reportId && html` | <small>Report ID: <code>${reportId}</code></small>`}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.executiveSummary && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Executive Summary</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="markdown" dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(report.executiveSummary) }}></div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.riskSummary && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Risk Summary</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="markdown" dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(report.riskSummary) }}></div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.recommendations?.length > 0 && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Recommendations</h3>
                                    </div>
                                    <div class="list-group list-group-flush">
                                        ${report.recommendations.map((rec, idx) => html`
                                            <div class="list-group-item">
                                                <div class="row align-items-center">
                                                    <div class="col-auto">
                                                        <span class="badge bg-primary">${idx + 1}</span>
                                                    </div>
                                                    <div class="col">
                                                        <strong>${rec.title || rec.recommendation}</strong>
                                                        ${rec.description && html`<div class="text-secondary small mt-1">${rec.description}</div>`}
                                                    </div>
                                                    ${rec.priority && html`
                                                        <div class="col-auto">
                                                            <span class="badge bg-${rec.priority === 'High' ? 'danger' : rec.priority === 'Medium' ? 'warning' : 'info'}">
                                                                ${rec.priority}
                                                            </span>
                                                        </div>
                                                    `}
                                                </div>
                                            </div>
                                        `)}
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.charts?.length > 0 && html`
                            <${ChartRenderer} charts=${report.charts} />
                        `}
                    </div>
                `}
                </div>
            </div>
        `;
    }

    renderMarkdown(text) {
        if (!text) return '';
        if (typeof window.marked === 'undefined' || typeof window.DOMPurify === 'undefined') {
            return text; // Fallback to plain text
        }
        const rawHtml = window.marked.parse(text);
        return window.DOMPurify.sanitize(rawHtml);
    }
}
