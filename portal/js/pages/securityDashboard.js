import { auth } from '../auth.js';
import { api } from '../api.js';
import { config } from '../config.js';
import { orgContext } from '../orgContext.js';
import { ChartRenderer } from '../components/ChartRenderer.js';

const { html, Component } = window;

/**
 * Security Posture Report - Cached daily/hourly security assessment with smart refresh
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
            selectedDate: this.formatDate(new Date()),
            showGenerateButton: false
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

            if (!response.ok) {
                // Handle 404 - no report exists for this date
                if (response.status === 404) {
                    // Immediately trigger dashboard generation
                    this.setState({
                        loading: true,
                        error: null,
                        report: null,
                        showGenerateButton: false,
                        selectedDate: targetDate,
                        refreshing: true
                    });
                    await this.refreshDashboard();
                    return;
                }
                // Handle other errors
                const data = await response.json().catch(() => ({}));
                throw new Error(data.Message || `HTTP ${response.status}: Failed to load dashboard`);
            }

            const data = await response.json();

            this.setState({
                loading: false,
                report: data.Report || null,
                reportId: data.ReportId || null,
                generatedAt: data.GeneratedAt ? new Date(data.GeneratedAt) : null,
                nextRefreshAt: data.NextRefreshAt ? new Date(data.NextRefreshAt) : null,
                canRefreshNow: data.CanRefreshNow || false,
                selectedDate: targetDate,
                showGenerateButton: false
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
            const response = await fetch(`${config.API_BASE}/api/analyst/run`, {
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
                    `${config.API_BASE}/api/analyst/reports/${reportId}`,
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
                        refreshing: false
                    });
                    // Reload the dashboard to get the newly generated report
                    await this.loadDashboard();
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

    render({ }, { loading, error, report, generatedAt, nextRefreshAt, canRefreshNow, refreshing, selectedDate, showGenerateButton }) {
        const currentOrg = orgContext.getCurrentOrg();
        const user = auth.getUser();
        const displayDate = selectedDate ? `${selectedDate.substring(0, 4)}-${selectedDate.substring(4, 6)}-${selectedDate.substring(6, 8)}` : '';

        return html`
            <div class="page-header d-print-none">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Security Posture Report</h2>
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
                                    title="${canRefreshNow ? 'Refresh security report with latest data' : 'Refresh temporarily disabled to conserve AI resources'}"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-refresh" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"></path>
                                        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"></path>
                                    </svg>
                                    ${refreshing ? 'Refreshing...' : canRefreshNow ? 'Refresh Report' : 'Refresh Disabled'}
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

                ${!loading && !report && !error && showGenerateButton && html`
                    <div class="alert alert-info" role="alert">
                        <div class="d-flex">
                            <div>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <circle cx="12" cy="12" r="9"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                            </div>
                            <div class="flex-fill">
                                <h4 class="alert-title">No Security Report Available</h4>
                                <div class="text-secondary mb-3">
                                    No security posture report has been generated for ${this.formatDateDisplay(selectedDate)} yet.
                                </div>
                                <button 
                                    class="btn btn-primary"
                                    onClick=${() => this.refreshDashboard()}
                                    disabled=${refreshing}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                    ${refreshing ? 'Generating Report...' : 'Generate Security Report'}
                                </button>
                            </div>
                        </div>
                    </div>
                `}

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

                        ${report.ExecutiveSummary && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Executive Summary</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="markdown" dangerouslySetInnerHTML=${{ __html: this.renderMarkdown(report.ExecutiveSummary) }}></div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.RiskSummary && html`
                            <div class="col-12">
                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">Risk Summary</h3>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            ${report.RiskSummary.OverallRiskScore && html`
                                                <div class="col-md-4">
                                                    <div class="text-center">
                                                        <h4 class="mb-0">${report.RiskSummary.OverallRiskScore.toFixed(1)}/100</h4>
                                                        <small class="text-muted">Overall Risk Score</small>
                                                    </div>
                                                </div>
                                            `}
                                            ${report.RiskSummary.RiskLevel && html`
                                                <div class="col-md-4">
                                                    <div class="text-center">
                                                        <span class="badge bg-${report.RiskSummary.RiskLevel === 'Critical' ? 'danger' : report.RiskSummary.RiskLevel === 'High' ? 'warning' : report.RiskSummary.RiskLevel === 'Medium' ? 'info' : 'success'}">
                                                            ${report.RiskSummary.RiskLevel}
                                                        </span>
                                                        <div><small class="text-muted">Risk Level</small></div>
                                                    </div>
                                                </div>
                                            `}
                                        </div>
                                        ${report.RiskSummary.TopRiskFactors?.length > 0 && html`
                                            <hr class="my-3" />
                                            <h5>Top Risk Factors</h5>
                                            <ul class="list-unstyled">
                                                ${report.RiskSummary.TopRiskFactors.slice(0, 5).map((factor, idx) => html`
                                                    <li key=${idx} class="mb-2">
                                                        <span class="badge bg-danger me-2">${idx + 1}</span>
                                                        <strong>${factor.Category || factor.Description}</strong>
                                                        ${factor.ImpactScore && html`<span class="text-muted ms-2">(Impact: ${factor.ImpactScore})</span>`}
                                                    </li>
                                                `)}
                                            </ul>
                                        `}
                                    </div>
                                </div>
                            </div>
                        `}

                        ${report.Recommendations?.length > 0 && html`
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

                        ${report.Charts?.length > 0 && html`
                            <${ChartRenderer} charts=${report.Charts} />
                        `}
                    </div>
                `}
        `;
    }

    renderMarkdown(text) {
        if (!text) return '';
        
        if (!window.marked || !window.DOMPurify) {
            logger.error('[SecurityDashboard] DOMPurify or marked.js not loaded - cannot render markdown safely');
            return ''; // Return empty instead of unsafe fallback
        }
        
        try {
            const rawHtml = window.marked.parse(text);
            return window.DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote'],
                ALLOWED_ATTR: ['href', 'title'],
                ALLOW_DATA_ATTR: false
            });
        } catch (err) {
            logger.error('[SecurityDashboard] Markdown parsing failed:', err);
            return '';
        }
    }
}
